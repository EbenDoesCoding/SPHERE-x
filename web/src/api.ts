/**
 * Loads a field: its manifest from `GET /api/fields`, then its frame file (Contract v1.0,
 * sections 5 to 7).
 *
 * - While the API answers 202 the same URL is polled and progress is reported.
 * - `status: "empty"` is a normal answer (no public exposure covers the position), not an error.
 * - Error answers become a `FieldError` carrying the contract's `code`.
 * - A fixture falls back to the copy bundled with the site when the API cannot be reached, so
 *   the recorded fields work with no back end at all.
 */
import {
  type BuildingResponse,
  type BuildStage,
  type ErrorCode,
  FOV_CHOICES_ARCMIN,
  type Manifest,
} from "./contract";

const FIELDS_URL = "/api/fields";
/** Poll interval when the API does not say, s. */
const POLL_DEFAULT_S = 1;
/** The API cancels a build nobody has polled for 20 s, so never wait long. */
const POLL_MIN_S = 0.2;
const POLL_MAX_S = 5;
/** Give up polling after this long, ms. The API itself answers "partial" at 120 s. */
const BUILD_DEADLINE_MS = 180_000;
/** Pauses before the second and third attempt of a request that failed to connect, ms. */
const RETRY_DELAYS_MS = [300, 900];

/** A position (degrees, field of view in arcmin) or the name of a recorded field. */
export type FieldRequest = { ra: number; dec: number; fov: number } | { fixture: string };

export type FieldSource = "api" | "bundled";

export interface LoadedField {
  manifest: Manifest;
  /** The uncompressed frame file; null when the field is empty. */
  frames: ArrayBuffer | null;
  /** "bundled" when the copy shipped with the site was used because the API was unreachable. */
  source: FieldSource;
}

export interface LoadProgress {
  /** A build stage reported by the API, or "frames" while the frame file downloads. */
  stage: BuildStage | "frames";
  /** Units done so far (exposures for build stages); null when unknown. */
  done: number | null;
  /** Units in total (exposures for build stages, bytes for "frames"); null when unknown. */
  total: number | null;
}

export type FieldErrorCode =
  | ErrorCode
  /** The API did not answer at all. */
  | "unreachable"
  /** A recorded field is not bundled with this build and the API did not answer. */
  | "fixture_missing"
  /** The answer does not follow the contract. */
  | "bad_response"
  /** The frame file does not match its manifest. */
  | "bad_frames"
  /** The build did not finish in time. */
  | "timeout";

export class FieldError extends Error {
  override readonly name = "FieldError";

  constructor(
    readonly code: FieldErrorCode,
    message: string,
    /** Seconds to wait before trying again, when the API said so (429). */
    readonly retryAfterS?: number,
  ) {
    super(message);
  }
}

export interface LoadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: LoadProgress) => void;
  /** Replaceable for tests. */
  fetchImpl?: typeof fetch;
  /** Replaceable for tests: resolves after `ms`, rejects if the signal aborts first. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Replaceable for tests: clock in ms. */
  now?: () => number;
}

type Context = Required<Pick<LoadOptions, "fetchImpl" | "sleep" | "now">> &
  Pick<LoadOptions, "signal" | "onProgress">;

/** Raised internally when nothing that speaks the contract answered. */
class ApiUnreachable extends Error {}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Checks a request before any network call; throws `FieldError("bad_request")`. */
export function checkRequest(request: FieldRequest): void {
  if ("fixture" in request) {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(request.fixture)) {
      throw new FieldError("bad_request", "That is not the name of a recorded field.");
    }
    return;
  }
  const { ra, dec, fov } = request;
  if (!Number.isFinite(ra) || ra < 0 || ra > 360) {
    throw new FieldError("bad_request", "Right ascension must be between 0 and 360 degrees.");
  }
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) {
    throw new FieldError("bad_request", "Declination must be between -90 and 90 degrees.");
  }
  if (!(FOV_CHOICES_ARCMIN as readonly number[]).includes(fov)) {
    const choices = FOV_CHOICES_ARCMIN.join(", ");
    throw new FieldError("bad_request", `Field of view must be one of ${choices} arcmin.`);
  }
}

/** The `GET /api/fields` URL of a request. Repeating it polls the same build. */
export function fieldUrl(request: FieldRequest): string {
  const query =
    "fixture" in request
      ? new URLSearchParams({ fixture: request.fixture })
      : new URLSearchParams({
          ra: String(request.ra),
          dec: String(request.dec),
          fov: String(request.fov),
        });
  return `${FIELDS_URL}?${query}`;
}

/** Checks a downloaded frame file against its manifest; throws `FieldError("bad_frames")`. */
export function checkFrames(manifest: Manifest, buffer: ArrayBuffer): void {
  const { frames, grid, planes } = manifest;
  if (!frames) throw new FieldError("bad_frames", "The manifest has no frame file.");
  if (buffer.byteLength !== frames.nbytes) {
    throw new FieldError(
      "bad_frames",
      `The frame file is ${buffer.byteLength} bytes long; its manifest says ${frames.nbytes}. The download is incomplete or out of date.`,
    );
  }
  const expected = planes.length * grid.nx * grid.ny * 2;
  if (frames.nbytes !== expected) {
    throw new FieldError(
      "bad_frames",
      `The manifest lists ${planes.length} planes of ${grid.nx} x ${grid.ny} pixels (${expected} bytes), but its frame file is ${frames.nbytes} bytes.`,
    );
  }
}

/** One GET with two more attempts when the connection itself fails. */
async function fetchWithRetry(url: string, accept: string, context: Context): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await context.fetchImpl(url, {
        headers: { Accept: accept },
        signal: context.signal,
      });
    } catch (error) {
      if (isAbort(error) || context.signal?.aborted) throw error;
      if (attempt >= RETRY_DELAYS_MS.length) throw new ApiUnreachable();
      await context.sleep(RETRY_DELAYS_MS[attempt], context.signal);
    }
  }
}

/**
 * The JSON body when it carries the contract's `contract` key, else null. A dev proxy with no
 * back end and a static host both answer `/api/...` with something else (an error page).
 */
async function contractBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "contract" in body) {
      const record = body as Record<string, unknown>;
      if (typeof record.contract === "string") return record;
    }
  } catch {
    // Not JSON: not our API.
  }
  return null;
}

/**
 * Set by the site's own proxy (web/functions/api) on the 503 it writes when the API address is
 * not configured or the API does not answer. The body then has the contract's error shape, but
 * it does not come from the API.
 */
const PROXY_ERROR_HEADER = "x-tombaugh-proxy-error";

/** The contract JSON of an answer that really comes from the API; throws `ApiUnreachable` else. */
async function apiBody(response: Response): Promise<Record<string, unknown>> {
  const body = response.headers.has(PROXY_ERROR_HEADER) ? null : await contractBody(response);
  if (body === null) throw new ApiUnreachable();
  return body;
}

const ERROR_CODES: readonly ErrorCode[] = [
  "bad_request",
  "not_found",
  "busy",
  "upstream_unavailable",
  "internal",
];

const CODE_BY_HTTP_STATUS: Record<number, ErrorCode> = {
  400: "bad_request",
  404: "not_found",
  429: "busy",
  503: "upstream_unavailable",
};

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  bad_request: "The API rejected the position or field of view.",
  not_found: "The API does not know this field.",
  busy: "The build queue is full. Try again shortly.",
  upstream_unavailable: "The SPHEREx archive cannot be reached and this field is not cached.",
  internal: "The API failed while building this field.",
};

function errorFrom(body: Record<string, unknown>, response: Response): FieldError {
  const stated = ERROR_CODES.find((code) => code === body.code);
  const code = stated ?? CODE_BY_HTTP_STATUS[response.status] ?? "internal";
  const message =
    typeof body.message === "string" && body.message ? body.message : DEFAULT_MESSAGES[code];
  const retryAfter = Number(response.headers.get("Retry-After"));
  return new FieldError(code, message, retryAfter > 0 ? retryAfter : undefined);
}

/** Checks that a 200 answer is a manifest this code can draw. */
function checkManifest(body: Record<string, unknown>): Manifest {
  const manifest = body as unknown as Manifest;
  const bad = (what: string) => new FieldError("bad_response", `Unusable manifest: ${what}.`);
  if (!manifest.contract.startsWith("1.")) {
    throw bad(`it uses contract ${manifest.contract}, this page understands 1.x`);
  }
  if (manifest.status === "empty") return manifest;
  if (manifest.status !== "ready" && manifest.status !== "partial") {
    throw bad(`unknown status "${String(manifest.status)}"`);
  }
  const { grid, frames, planes, time_bins: timeBins, centre } = manifest;
  if (!grid || !frames || !centre || !Array.isArray(planes) || !Array.isArray(timeBins)) {
    throw bad("the grid, centre, planes, time bins or frame file are missing");
  }
  const { wave_bins: waveBins, warnings, exposures, provenance } = manifest;
  if (!Array.isArray(waveBins) || !Array.isArray(warnings) || !exposures || !provenance) {
    throw bad("the wave bins, warnings, exposure summary or provenance are missing");
  }
  if (grid.projection !== "TAN" || grid.row0 !== "north" || grid.col0 !== "east") {
    throw bad("its grid is not the north-up, east-left TAN grid of the contract");
  }
  if (frames.dtype !== "float16" || frames.byteorder !== "little") {
    throw bad("its frame file is not little-endian float16");
  }
  return manifest;
}

function pollDelayMs(building: Partial<BuildingResponse>): number {
  const stated = Number(building.retry_after_s);
  const seconds = Number.isFinite(stated) && stated > 0 ? stated : POLL_DEFAULT_S;
  return 1000 * Math.min(POLL_MAX_S, Math.max(POLL_MIN_S, seconds));
}

/** GETs the manifest, polling the same URL for as long as the API answers 202. */
async function requestManifest(url: string, context: Context): Promise<Manifest> {
  const startedAt = context.now();
  for (;;) {
    const response = await fetchWithRetry(url, "application/json", context);
    const body = await apiBody(response);
    if (response.status === 202 || body.status === "building") {
      const building = body as Partial<BuildingResponse>;
      context.onProgress?.({
        stage: building.progress?.stage ?? "discover",
        done: building.progress?.done ?? null,
        total: building.progress?.total ?? null,
      });
      if (context.now() - startedAt > BUILD_DEADLINE_MS) {
        throw new FieldError("timeout", "The build did not finish in time. Try again.");
      }
      await context.sleep(pollDelayMs(building), context.signal);
      continue;
    }
    if (!response.ok || body.status === "error") throw errorFrom(body, response);
    return checkManifest(body);
  }
}

/** Downloads the frame file and checks its length against the manifest. */
async function fetchFrames(
  url: string,
  manifest: Manifest,
  context: Context,
): Promise<ArrayBuffer> {
  context.onProgress?.({ stage: "frames", done: null, total: manifest.frames?.nbytes ?? null });
  const response = await fetchWithRetry(url, "application/octet-stream", context);
  if (!response.ok) throw errorFrom(await apiBody(response), response);
  const buffer = await response.arrayBuffer();
  checkFrames(manifest, buffer);
  return buffer;
}

async function loadFromApi(request: FieldRequest, context: Context): Promise<LoadedField> {
  const manifest = await requestManifest(fieldUrl(request), context);
  if (manifest.status === "empty" || !manifest.frames) {
    return { manifest, frames: null, source: "api" };
  }
  const frames = await fetchFrames(manifest.frames.url, manifest, context);
  return { manifest, frames, source: "api" };
}

/** The copy of a recorded field shipped with the site under fixtures/<name>/. */
async function loadBundled(name: string, context: Context): Promise<LoadedField> {
  const folder = `${import.meta.env.BASE_URL}fixtures/${name}`;
  const missing = new FieldError(
    "fixture_missing",
    `The recorded field "${name}" is not bundled with this build, and the API cannot be reached.`,
  );
  try {
    const response = await fetchWithRetry(`${folder}/manifest.json`, "application/json", context);
    const body = response.ok ? await contractBody(response) : null;
    if (body === null) throw missing;
    const manifest = checkManifest(body);
    if (manifest.status === "empty" || !manifest.frames) {
      return { manifest, frames: null, source: "bundled" };
    }
    const frames = await fetchFrames(`${folder}/frames.bin`, manifest, context);
    return { manifest, frames, source: "bundled" };
  } catch (error) {
    if (error instanceof ApiUnreachable) throw missing;
    throw error;
  }
}

/**
 * Loads a field by position or by fixture name.
 * Rejects with a `FieldError`, or with the abort reason when `options.signal` aborts.
 */
export async function loadField(
  request: FieldRequest,
  options: LoadOptions = {},
): Promise<LoadedField> {
  checkRequest(request);
  const context: Context = {
    signal: options.signal,
    onProgress: options.onProgress,
    fetchImpl: options.fetchImpl ?? ((input, init) => fetch(input, init)),
    sleep: options.sleep ?? defaultSleep,
    now: options.now ?? (() => Date.now()),
  };
  try {
    return await loadFromApi(request, context);
  } catch (error) {
    if (!(error instanceof ApiUnreachable)) throw error;
    if ("fixture" in request) return loadBundled(request.fixture, context);
    throw new FieldError(
      "unreachable",
      "The Tombaugh API cannot be reached, so a new field cannot be built right now.",
    );
  }
}
