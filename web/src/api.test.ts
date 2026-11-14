import { describe, expect, it } from "vitest";
import {
  checkFrames,
  checkRequest,
  FieldError,
  type FieldErrorCode,
  type FieldRequest,
  fieldUrl,
  type LoadProgress,
  loadField,
} from "./api";
import type { Manifest } from "./contract";

// A minimal manifest for exercising the loader: a 2 x 2 grid and one plane, so the frame file
// is 8 bytes. It describes no real sky; only lengths and statuses matter here.
const synthetic_manifest: Manifest = {
  contract: "1.0",
  status: "ready",
  key: "0123456789abcdef",
  request: { ra: 10, dec: 20, fov_arcmin: 6 },
  centre: { ra: 10, dec: 20 },
  epoch_ref: 2026.0,
  grid: {
    nx: 2,
    ny: 2,
    cx: 0.5,
    cy: 0.5,
    pixscale_arcsec: 3.075,
    projection: "TAN",
    row0: "north",
    col0: "east",
  },
  time_binning: { gap_days: 20, max_span_days: 60, sub_span_days: 30 },
  time_bins: [
    {
      id: 0,
      mjd_start: 60979,
      mjd_end: 60993,
      mjd_mid: 60986,
      date_start: "2025-10-31",
      date_end: "2025-11-14",
      n_exposures: 9,
      detectors: [6],
    },
  ],
  wave_bins: [],
  planes: [
    {
      index: 0,
      kind: "sci",
      mission: "SPHEREx",
      time_bin: 0,
      wave_bin: 20,
      band: null,
      lam_min: 4.412,
      lam_max: 4.5595,
      lam_eff: 4.49,
      n_exposures: 9,
      sigma: 0.02,
      mjd_mid: 60986,
      date_start: "2025-10-31",
      date_end: "2025-11-14",
      offset: 0,
    },
  ],
  frames: {
    url: "/api/fields/0123456789abcdef/frames.bin",
    dtype: "float16",
    byteorder: "little",
    nbytes: 8,
    sha256: "",
  },
  exposures: {
    found: 9,
    used: 9,
    sampled: false,
    collections: { spherex_dr1: 9 },
    newest_mjd: 60993,
    newest_date: "2025-11-14",
  },
  provenance: { pipeline_version: "test", built_at: "", data_dois: [], notes: [] },
  warnings: [],
};

const synthetic_frames = () => new ArrayBuffer(8);

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const binary = (buffer: ArrayBuffer) =>
  new Response(buffer, { headers: { "Content-Type": "application/octet-stream" } });

const html = (status = 200) =>
  new Response("<!doctype html><title>Not the API</title>", {
    status,
    headers: { "Content-Type": "text/html" },
  });

const building = (stage: string, done: number, total: number, retryAfterS = 1) =>
  json(
    {
      contract: "1.0",
      status: "building",
      progress: { stage, done, total },
      retry_after_s: retryAfterS,
    },
    202,
  );

const apiError = (status: number, code: string, message: string, headers = {}) =>
  json({ contract: "1.0", status: "error", code, message }, status, headers);

/** What web/functions/api answers when it cannot reach the API: the contract's 503, flagged. */
const proxyError = (reason: string) =>
  apiError(503, "upstream_unavailable", "The API cannot be reached right now.", {
    "x-tombaugh-proxy-error": reason,
  });

type Handler = (url: string, call: number) => Response | Promise<Response>;

/** A stand-in for fetch that records the URLs asked for, plus a sleep that returns at once. */
function harness(handler: Handler) {
  const urls: string[] = [];
  const sleeps: number[] = [];
  const progress: LoadProgress[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    return handler(url, urls.length);
  };
  const options = {
    fetchImpl,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    onProgress: (step: LoadProgress) => {
      progress.push(step);
    },
  };
  return { urls, sleeps, progress, options };
}

const offline: Handler = () => {
  throw new TypeError("fetch failed");
};

async function failure(promise: Promise<unknown>): Promise<FieldError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(FieldError);
    return error as FieldError;
  }
  throw new Error("expected the load to fail");
}

describe("fieldUrl", () => {
  it("asks for a position with ra, dec and fov", () => {
    expect(fieldUrl({ ra: 133.7599, dec: -7.2418, fov: 6 })).toBe(
      "/api/fields?ra=133.7599&dec=-7.2418&fov=6",
    );
  });

  it("asks for a recorded field by name", () => {
    expect(fieldUrl({ fixture: "wise0855" })).toBe("/api/fields?fixture=wise0855");
  });
});

describe("checkRequest", () => {
  it("accepts the whole sky and every allowed field of view", () => {
    for (const fov of [3, 4, 5, 6, 8, 10]) {
      expect(() => checkRequest({ ra: 0, dec: -90, fov })).not.toThrow();
      expect(() => checkRequest({ ra: 359.9999, dec: 90, fov })).not.toThrow();
    }
    expect(() => checkRequest({ fixture: "barnard" })).not.toThrow();
  });

  it.each<[FieldRequest, string]>([
    [{ ra: -0.1, dec: 0, fov: 6 }, "Right ascension"],
    [{ ra: 360.5, dec: 0, fov: 6 }, "Right ascension"],
    [{ ra: Number.NaN, dec: 0, fov: 6 }, "Right ascension"],
    [{ ra: 10, dec: 90.01, fov: 6 }, "Declination"],
    [{ ra: 10, dec: Number.NaN, fov: 6 }, "Declination"],
    [{ ra: 10, dec: 0, fov: 7 }, "Field of view"],
    [{ ra: 10, dec: 0, fov: 60 }, "Field of view"],
    [{ fixture: "../secrets" }, "recorded field"],
    [{ fixture: "" }, "recorded field"],
  ])("rejects %j", (request, what) => {
    expect(() => checkRequest(request)).toThrow(FieldError);
    expect(() => checkRequest(request)).toThrow(what);
  });

  it("stops a bad request before any network call", async () => {
    const { urls, options } = harness(offline);
    const error = await failure(loadField({ ra: 400, dec: 0, fov: 6 }, options));
    expect(error.code).toBe("bad_request");
    expect(urls).toEqual([]);
  });
});

describe("loadField from the API", () => {
  it("polls the same URL while the API answers 202, reporting progress", async () => {
    const { urls, sleeps, progress, options } = harness((url, call) => {
      if (url.endsWith("frames.bin")) return binary(synthetic_frames());
      if (call === 1) return building("discover", 0, 0);
      if (call === 2) return building("fetch", 120, 258, 2);
      if (call === 3) return building("stack", 258, 258, 0.5);
      return json(synthetic_manifest);
    });
    const field = await loadField({ ra: 10, dec: 20, fov: 6 }, options);

    const fields = "/api/fields?ra=10&dec=20&fov=6";
    expect(urls).toEqual([
      fields,
      fields,
      fields,
      fields,
      "/api/fields/0123456789abcdef/frames.bin",
    ]);
    expect(sleeps).toEqual([1000, 2000, 500]);
    expect(progress).toEqual([
      { stage: "discover", done: 0, total: 0 },
      { stage: "fetch", done: 120, total: 258 },
      { stage: "stack", done: 258, total: 258 },
      { stage: "frames", done: null, total: 8 },
    ]);
    expect(field.source).toBe("api");
    expect(field.manifest.key).toBe("0123456789abcdef");
    expect(field.frames?.byteLength).toBe(8);
  });

  it("fetches the frame file at the manifest's URL as it is, version query included", async () => {
    // The API writes the first 16 hex characters of the file's SHA-256 into the URL: the file is
    // cached as immutable, so other bytes must have another address.
    const { frames } = synthetic_manifest;
    if (!frames) throw new Error("the synthetic manifest has a frame file");
    const versioned = `${frames.url}?v=00112233445566ff`;
    const manifest: Manifest = { ...synthetic_manifest, frames: { ...frames, url: versioned } };
    const { urls, options } = harness((url) =>
      url.startsWith("/api/fields/") ? binary(synthetic_frames()) : json(manifest),
    );
    const field = await loadField({ fixture: "wise0855" }, options);
    expect(urls).toEqual(["/api/fields?fixture=wise0855", versioned]);
    expect(field.frames?.byteLength).toBe(8);
  });

  it("keeps the poll interval within sensible bounds", async () => {
    const { sleeps, options } = harness((url, call) => {
      if (url.endsWith("frames.bin")) return binary(synthetic_frames());
      if (call === 1) return building("fetch", 1, 9, 600);
      if (call === 2) return building("fetch", 2, 9, 0);
      if (call === 3) return building("fetch", 3, 9, 0.001);
      return json(synthetic_manifest);
    });
    await loadField({ ra: 10, dec: 20, fov: 6 }, options);
    expect(sleeps).toEqual([5000, 1000, 200]);
  });

  it("gives up when a build never finishes", async () => {
    let clock = 0;
    const { options } = harness(() => building("fetch", 1, 9));
    const error = await failure(
      loadField(
        { ra: 10, dec: 20, fov: 6 },
        {
          ...options,
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
        },
      ),
    );
    expect(error.code).toBe("timeout");
    expect(clock).toBeGreaterThan(180_000);
  });

  it("returns an empty field as a normal answer, without asking for frames", async () => {
    const empty = {
      ...synthetic_manifest,
      status: "empty",
      planes: [],
      time_bins: [],
      frames: null,
    };
    const { urls, options } = harness(() => json(empty));
    const field = await loadField({ ra: 10, dec: 20, fov: 6 }, options);
    expect(field.manifest.status).toBe("empty");
    expect(field.frames).toBeNull();
    expect(urls).toHaveLength(1);
  });

  it("passes a partial field through with its warnings", async () => {
    const partial = { ...synthetic_manifest, status: "partial", warnings: ["detector 3 missing"] };
    const { options } = harness((url) =>
      url.endsWith("frames.bin") ? binary(synthetic_frames()) : json(partial),
    );
    const field = await loadField({ ra: 10, dec: 20, fov: 6 }, options);
    expect(field.manifest.status).toBe("partial");
    expect(field.manifest.warnings).toEqual(["detector 3 missing"]);
    expect(field.frames?.byteLength).toBe(8);
  });

  it.each<[number, FieldErrorCode]>([
    [400, "bad_request"],
    [404, "not_found"],
    [429, "busy"],
    [503, "upstream_unavailable"],
    [500, "internal"],
  ])("turns HTTP %i into a FieldError with code %s", async (status, code) => {
    const { options } = harness(() => apiError(status, code, `the API said ${code}`));
    const error = await failure(loadField({ ra: 10, dec: 20, fov: 6 }, options));
    expect(error.code).toBe(code);
    expect(error.message).toBe(`the API said ${code}`);
  });

  it("reports how long to wait when the API is busy", async () => {
    const { options } = harness(() => apiError(429, "busy", "queue full", { "Retry-After": "7" }));
    const error = await failure(loadField({ ra: 10, dec: 20, fov: 6 }, options));
    expect(error.code).toBe("busy");
    expect(error.retryAfterS).toBe(7);
  });

  it("falls back on the HTTP status when the error body has no known code", async () => {
    const { options } = harness(() => json({ contract: "1.0", status: "error" }, 503));
    const error = await failure(loadField({ ra: 10, dec: 20, fov: 6 }, options));
    expect(error.code).toBe("upstream_unavailable");
    expect(error.message).toMatch(/archive/);
  });

  it("rejects a frame file whose length differs from the manifest", async () => {
    const { options } = harness((url) =>
      url.endsWith("frames.bin") ? binary(new ArrayBuffer(6)) : json(synthetic_manifest),
    );
    const error = await failure(loadField({ ra: 10, dec: 20, fov: 6 }, options));
    expect(error.code).toBe("bad_frames");
    expect(error.message).toMatch(/6 bytes/);
  });

  it("rejects a manifest from a contract it does not understand", async () => {
    const { options } = harness(() => json({ ...synthetic_manifest, contract: "2.0" }));
    const error = await failure(loadField({ ra: 10, dec: 20, fov: 6 }, options));
    expect(error.code).toBe("bad_response");
  });

  it("rejects a grid that is not north-up and east-left", async () => {
    const flipped = { ...synthetic_manifest, grid: { ...synthetic_manifest.grid, row0: "south" } };
    const { options } = harness(() => json(flipped));
    const error = await failure(loadField({ ra: 10, dec: 20, fov: 6 }, options));
    expect(error.code).toBe("bad_response");
  });

  it("says the API is unreachable for a position, after three attempts", async () => {
    const { urls, sleeps, options } = harness(offline);
    const error = await failure(loadField({ ra: 10, dec: 20, fov: 6 }, options));
    expect(error.code).toBe("unreachable");
    expect(urls).toHaveLength(3);
    expect(sleeps).toEqual([300, 900]);
  });

  it("tells the site proxy's own 503 from the API's: the first means unreachable", async () => {
    const viaProxy = harness(() => proxyError("origin_unreachable"));
    const proxyFailure = await failure(loadField({ ra: 10, dec: 20, fov: 6 }, viaProxy.options));
    expect(proxyFailure.code).toBe("unreachable");

    const fromApi = harness(() => apiError(503, "upstream_unavailable", "IRSA is down"));
    const apiFailure = await failure(loadField({ ra: 10, dec: 20, fov: 6 }, fromApi.options));
    expect(apiFailure.code).toBe("upstream_unavailable");
    expect(apiFailure.message).toBe("IRSA is down");
  });

  it("recovers when only the first attempt fails to connect", async () => {
    const { urls, options } = harness((url, call) => {
      if (call === 1) throw new TypeError("connection reset");
      return url.endsWith("frames.bin") ? binary(synthetic_frames()) : json(synthetic_manifest);
    });
    const field = await loadField({ ra: 10, dec: 20, fov: 6 }, options);
    expect(field.source).toBe("api");
    expect(urls).toHaveLength(3);
  });

  it("stops at once when aborted, without falling back", async () => {
    const controller = new AbortController();
    const { urls, options } = harness(() => {
      controller.abort();
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(
      loadField({ fixture: "wise0855" }, { ...options, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(urls).toHaveLength(1);
  });
});

describe("loadField for a recorded field", () => {
  const bundledManifest = "/fixtures/wise0855/manifest.json";
  const bundledFrames = "/fixtures/wise0855/frames.bin";

  it("uses the API when it answers", async () => {
    const { urls, options } = harness((url) =>
      url.endsWith("frames.bin") ? binary(synthetic_frames()) : json(synthetic_manifest),
    );
    const field = await loadField({ fixture: "wise0855" }, options);
    expect(field.source).toBe("api");
    expect(urls).toEqual([
      "/api/fields?fixture=wise0855",
      "/api/fields/0123456789abcdef/frames.bin",
    ]);
  });

  it("falls back to the bundled copy when the API cannot be reached", async () => {
    const { urls, options } = harness((url) => {
      if (url.startsWith("/api/")) throw new TypeError("fetch failed");
      return url === bundledManifest ? json(synthetic_manifest) : binary(synthetic_frames());
    });
    const field = await loadField({ fixture: "wise0855" }, options);
    expect(field.source).toBe("bundled");
    expect(field.frames?.byteLength).toBe(8);
    // Three attempts at the API, then the bundled manifest and the bundled frame file,
    // not the API URL written inside the recorded manifest.
    expect(urls.slice(3)).toEqual([bundledManifest, bundledFrames]);
  });

  it.each<[string, () => Response]>([
    ["an HTML page with status 200 (static host)", () => html(200)],
    ["a 404 page (static host)", () => html(404)],
    ["a proxy error (no back end running)", () => new Response("ECONNREFUSED", { status: 500 })],
    ["the site's own proxy saying the API does not answer", () => proxyError("origin_unreachable")],
    ["the site's own proxy with no API address", () => proxyError("origin_not_configured")],
  ])("treats %s on /api as an unreachable API", async (_what, answer) => {
    const { options } = harness((url) => {
      if (url.startsWith("/api/")) return answer();
      return url === bundledManifest ? json(synthetic_manifest) : binary(synthetic_frames());
    });
    const field = await loadField({ fixture: "wise0855" }, options);
    expect(field.source).toBe("bundled");
  });

  it("says so when the recorded field is not bundled either", async () => {
    const { options } = harness((url) => (url.startsWith("/api/") ? html(404) : html(200)));
    const error = await failure(loadField({ fixture: "barnard" }, options));
    expect(error.code).toBe("fixture_missing");
    expect(error.message).toMatch(/barnard/);
  });

  it("says so when nothing answers at all", async () => {
    const { options } = harness(offline);
    const error = await failure(loadField({ fixture: "barnard" }, options));
    expect(error.code).toBe("fixture_missing");
  });

  it("does not fall back when the API itself says the fixture is unknown", async () => {
    const { urls, options } = harness(() => apiError(404, "not_found", "unknown fixture"));
    const error = await failure(loadField({ fixture: "nosuchfield" }, options));
    expect(error.code).toBe("not_found");
    expect(urls).toEqual(["/api/fields?fixture=nosuchfield"]);
  });

  it("checks the bundled frame file against its manifest too", async () => {
    const { options } = harness((url) => {
      if (url.startsWith("/api/")) return html(404);
      return url === bundledManifest ? json(synthetic_manifest) : binary(new ArrayBuffer(4));
    });
    const error = await failure(loadField({ fixture: "wise0855" }, options));
    expect(error.code).toBe("bad_frames");
  });
});

describe("checkFrames", () => {
  it("accepts a file of exactly planes x ny x nx x 2 bytes", () => {
    expect(() => checkFrames(synthetic_manifest, new ArrayBuffer(8))).not.toThrow();
  });

  it("rejects a manifest whose byte count disagrees with its planes", () => {
    const inconsistent: Manifest = {
      ...synthetic_manifest,
      frames: { url: "", dtype: "float16", byteorder: "little", nbytes: 16, sha256: "" },
    };
    expect(() => checkFrames(inconsistent, new ArrayBuffer(16))).toThrow(/1 planes of 2 x 2/);
  });
});
