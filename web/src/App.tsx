import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  checkRequest,
  FieldError,
  type FieldErrorCode,
  type FieldRequest,
  type FieldSource,
  type LoadProgress,
  loadField,
} from "./api";
import { DEFAULT_FOV_ARCMIN, FIXTURE_NAMES, FOV_CHOICES_ARCMIN, type Manifest } from "./contract";
import { decodeFloat16 } from "./player/float16";
import { keepFocus } from "./player/hooks";
import { Player } from "./player/Player";
import { FieldSynth } from "./player/synth";

/** Button text for the recorded fields of Contract v1.0 section 8. */
const FIXTURE_LABELS: Record<(typeof FIXTURE_NAMES)[number], string> = {
  wise0855: "WISE 0855−0714",
  barnard: "Barnard's Star",
};

type LoadState =
  | { phase: "idle" }
  | { phase: "loading"; label: string; progress: LoadProgress | null }
  | { phase: "failed"; label: string; code: FieldErrorCode | "unexpected"; message: string }
  | { phase: "empty"; label: string; manifest: Manifest }
  | { phase: "ready"; label: string; synth: FieldSynth; source: FieldSource; fixture: boolean };

const ERROR_TITLES: Record<FieldErrorCode | "unexpected", string> = {
  bad_request: "That position cannot be used",
  not_found: "Field not found",
  busy: "The API is busy",
  upstream_unavailable: "The SPHEREx archive cannot be reached",
  internal: "The API failed",
  unreachable: "The API cannot be reached",
  fixture_missing: "This recorded field is not available here yet",
  bad_response: "Unexpected answer from the API",
  bad_frames: "The frame file does not match its manifest",
  timeout: "The build took too long",
  unexpected: "Something went wrong",
};

const STAGE_TEXT: Record<LoadProgress["stage"], string> = {
  discover: "Finding exposures",
  fetch: "Reading exposures",
  stack: "Stacking",
  frames: "Downloading frames",
};

/** An empty box is not zero degrees. */
const parseDegrees = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));

/** Stages whose `done` and `total` count exposures; the others are shown without numbers. */
const COUNTED_STAGES: readonly LoadProgress["stage"][] = ["fetch", "stack"];

function Progress({ progress }: { progress: LoadProgress | null }) {
  if (!progress) return <progress aria-label="Loading" />;
  const { stage, done, total } = progress;
  const counted = COUNTED_STAGES.includes(stage) && done !== null && total !== null && total > 0;
  return (
    <>
      {counted ? (
        <progress aria-label={STAGE_TEXT[stage]} value={done} max={total} />
      ) : (
        <progress aria-label={STAGE_TEXT[stage]} />
      )}
      <p className="muted num">
        {STAGE_TEXT[stage]}
        {counted ? `: ${done} of ${total}` : "…"}
      </p>
    </>
  );
}

interface DataNotesProps {
  manifest: Manifest;
  source: FieldSource;
  /** True for a recorded field: fixtures are always labelled as such. */
  fixture: boolean;
}

/** Says when a field is partial and lists the manifest's warnings; nothing when all is well. */
function FieldWarnings({ manifest }: { manifest: Manifest }) {
  const { warnings, status } = manifest;
  if (status !== "partial" && warnings.length === 0) return null;
  return (
    <div className="notice" role="status">
      {status === "partial" && (
        <p>Partial field: the build stopped at its deadline, so some data is missing.</p>
      )}
      {warnings.length > 0 && (
        <ul>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Where the data came from and what went into it, straight from the manifest. */
function DataNotes({ manifest, source, fixture }: DataNotesProps) {
  const { exposures, provenance } = manifest;
  return (
    <p className="muted">
      {fixture && "Recorded field (real SPHEREx data, saved by the pipeline). "}
      {source === "bundled" && "Served from the copy bundled with this page: no API in use. "}
      <span className="num">
        {exposures.used} of {exposures.found}
      </span>{" "}
      exposures used{exposures.sampled ? " (sampled)" : ""}; newest{" "}
      <span className="num">{exposures.newest_date}</span>; pipeline{" "}
      <span className="num">{provenance.pipeline_version}</span>.
    </p>
  );
}

/** The area below the controls: one of the empty, loading, error, no-data or player states. */
function FieldView({ state }: { state: LoadState }) {
  switch (state.phase) {
    case "idle":
      return (
        <div className="state">
          <h2>No field loaded</h2>
          <p className="muted">
            Choose a recorded field or enter a position above. Nothing plays until you press Play.
          </p>
        </div>
      );
    case "loading":
      return (
        <div className="state" role="status">
          <h2>Loading {state.label}</h2>
          <Progress progress={state.progress} />
        </div>
      );
    case "failed":
      return (
        <div className="state" role="alert">
          <h2>{ERROR_TITLES[state.code]}</h2>
          <p>{state.message}</p>
          <p className="muted num">
            {state.label} &middot; {state.code}
          </p>
        </div>
      );
    case "empty":
      return (
        <div className="state" role="status">
          <h2>No SPHEREx data here</h2>
          <p>
            No public SPHEREx exposure covers {state.label}. That is the archive&rsquo;s answer for
            this position, not an error.
          </p>
        </div>
      );
    case "ready":
      return (
        <div className="stack">
          <h2>{state.label}</h2>
          <FieldWarnings manifest={state.synth.manifest} />
          <Player key={state.synth.manifest.key} synth={state.synth} />
          <DataNotes
            manifest={state.synth.manifest}
            source={state.source}
            fixture={state.fixture}
          />
        </div>
      );
  }
}

export function App() {
  const [state, setState] = useState<LoadState>({ phase: "idle" });
  const [ra, setRa] = useState("");
  const [dec, setDec] = useState("");
  const [fov, setFov] = useState<number>(DEFAULT_FOV_ARCMIN);
  const [formError, setFormError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const fieldArea = useRef<HTMLElement>(null);

  const load = useCallback(async (request: FieldRequest, label: string) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const { signal } = controller;
    setFormError(null);
    setState({ phase: "loading", label, progress: null });
    // Focus follows the action to the field. Left on the Load button or in a position box,
    // Space would load the field again (or type a blank) instead of playing it.
    fieldArea.current?.focus({ preventScroll: true });
    try {
      const field = await loadField(request, {
        signal,
        onProgress: (progress) => {
          if (!signal.aborted) setState({ phase: "loading", label, progress });
        },
      });
      if (signal.aborted) return;
      if (field.frames === null) {
        setState({ phase: "empty", label, manifest: field.manifest });
        return;
      }
      // Decoding and indexing can fail on a damaged file: keep that inside this try.
      const synth = new FieldSynth(field.manifest, decodeFloat16(field.frames));
      setState({
        phase: "ready",
        label,
        synth,
        source: field.source,
        fixture: "fixture" in request,
      });
    } catch (error) {
      if (signal.aborted) return;
      const code = error instanceof FieldError ? error.code : "unexpected";
      const text = error instanceof Error ? error.message : String(error);
      const wait = error instanceof FieldError ? error.retryAfterS : undefined;
      const message = wait ? `${text} Try again in ${Math.ceil(wait)} s.` : text;
      setState({ phase: "failed", label, code, message });
    }
  }, []);

  useEffect(() => () => inFlight.current?.abort(), []);

  // A field that has just loaded goes to the top of the window. The picture is most of a window
  // tall: left below the form it starts half off the screen, with its controls further down.
  const loadedKey = state.phase === "ready" ? state.synth.manifest.key : null;
  useEffect(() => {
    if (loadedKey !== null) fieldArea.current?.scrollIntoView({ block: "start" });
  }, [loadedKey]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = { ra: parseDegrees(ra), dec: parseDegrees(dec), fov };
    try {
      checkRequest(request);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
      return;
    }
    setFormError(null);
    const sign = request.dec < 0 ? "−" : "+";
    void load(request, `RA ${request.ra}°, Dec ${sign}${Math.abs(request.dec)}°`);
  }

  return (
    <div className="app">
      <header className="stack">
        <h1>Tombaugh</h1>
        <p className="muted">
          A blink comparator for NASA&rsquo;s SPHEREx infrared sky survey: flip between visits of
          the same patch of sky to see what moved or changed.
        </p>
      </header>

      <section className="stack" aria-labelledby="choose-heading">
        <h2 id="choose-heading">Choose a field</h2>
        <div className="row">
          <span className="muted">Recorded fields</span>
          {FIXTURE_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => void load({ fixture: name }, FIXTURE_LABELS[name])}
            >
              {FIXTURE_LABELS[name]}
            </button>
          ))}
        </div>
        <form className="row" onSubmit={submit} noValidate>
          <label>
            RA (deg)
            <input
              className="num"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0 to 360"
              value={ra}
              onChange={(event) => setRa(event.target.value)}
            />
          </label>
          <label>
            Dec (deg)
            <input
              className="num"
              inputMode="decimal"
              autoComplete="off"
              placeholder="-90 to 90"
              value={dec}
              onChange={(event) => setDec(event.target.value)}
            />
          </label>
          <label>
            Field of view
            <select value={fov} onChange={(event) => setFov(Number(event.target.value))}>
              {FOV_CHOICES_ARCMIN.map((choice) => (
                <option key={choice} value={choice}>
                  {choice} arcmin
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Load</button>
        </form>
        {formError && (
          <p className="notice" role="alert">
            {formError}
          </p>
        )}
      </section>

      <main ref={fieldArea} tabIndex={-1}>
        <FieldView state={state} />
      </main>
    </div>
  );
}
