import { useCallback, useEffect, useMemo, useState } from "react";
import { NATIVE_PIXEL_ARCSEC, type TimeBin } from "../contract";
import { gridOf } from "./grid";
import { keepFocus, useFrameClock, usePrefersReducedMotion } from "./hooks";
import { FPS_CHOICES } from "./playback";
import { PRESETS } from "./presets";
import { NO_DATA_CSS, pooledLimits, renderGrey } from "./render";
import type { FieldSynth, Frame } from "./synth";
import { Viewport } from "./Viewport";

/** presets.json writes "um"; show the real unit. */
const microns = (text: string) => text.replaceAll(" um", " µm");

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const dateRange = (start: string, end: string) => (start === end ? start : `${start} to ${end}`);

/** Why a frame is greyed out, or null when it is a full frame. */
function frameCaveat(frame: Frame): string | null {
  if (frame.waveBins.length === 0) return "No data in this band";
  if (frame.thin && frame.partial) return "Thin and partial";
  if (frame.thin) return "Thin";
  if (frame.partial) return "Partial";
  return null;
}

/** Why a frame is greyed out, in full sentences, or null when it is a full frame. */
function caveatSentences(frame: Frame): string | null {
  const caveat = frameCaveat(frame);
  if (caveat === null) return null;
  if (frame.waveBins.length === 0) {
    return `${caveat}. No exposure in this wavelength range was taken during this visit.`;
  }
  const sentences = [`${caveat}.`];
  if (frame.thin) sentences.push("Fewer than 8 exposures went into this frame, so it is noisy.");
  if (frame.partial) {
    sentences.push(
      "Some wavelength bins seen at other visits are missing here, so its colour mix differs.",
    );
  }
  sentences.push("Shown greyed: do not compare its brightness with the other frames.");
  return sentences.join(" ");
}

interface FrameLabelProps {
  frame: Frame;
  bin: TimeBin;
  /** "Frame 2 of 4". */
  position: string;
  /** Arcsec per pixel of the grid. */
  pixscale: number;
  /** Every caveat that occurs in the sequence: room is kept for the tallest of them. */
  caveats: readonly string[];
}

/** Dates, exposure count and wavelength range of the frame shown, and any caveat in words. */
function FrameLabel({ frame, bin, position, pixscale, caveats }: FrameLabelProps) {
  const caveat = caveatSentences(frame);
  const hasData = frame.waveBins.length > 0;
  return (
    <div className="stack">
      <p className="frame-label">
        <span>{position}</span>
        <span className="num">
          {dateRange(frame.dateStart ?? bin.date_start, frame.dateEnd ?? bin.date_end)}
        </span>
        <span className="num">{plural(frame.nExposures, "exposure")}</span>
        {hasData && (
          <span className="num">
            {frame.lamMin.toFixed(2)}&ndash;{frame.lamMax.toFixed(2)} &micro;m
          </span>
        )}
        <span className="frame-note muted">
          resampled to {pixscale} arcsec/px; native pixel {NATIVE_PIXEL_ARCSEC} arcsec
        </span>
      </p>
      {caveats.length > 0 && (
        // The block is as tall as the longest caveat of the sequence whichever frame is shown,
        // so the controls below it stay where they are while the frames change.
        <div className="frame-caveat">
          {caveats.map((text) => (
            <p key={text} className="flag frame-caveat-room" aria-hidden="true">
              {text}
            </p>
          ))}
          {caveat && <p className="flag">{caveat}</p>}
        </div>
      )}
    </div>
  );
}

interface PlayerProps {
  synth: FieldSynth;
}

/**
 * The blink: preset buttons, the image, the frame label, transport controls and the strip of
 * time bins. Playback never starts by itself and is capped at 6 frame changes per second
 * (both rules live in playback.ts).
 */
export function Player({ synth }: PlayerProps) {
  const { manifest } = synth;
  const { nx, ny, pixscale_arcsec: pixscale } = manifest.grid;
  const timeBins = manifest.time_bins;
  const grid = useMemo(() => gridOf(manifest), [manifest]);

  const [presetId, setPresetId] = useState(PRESETS.find((p) => p.kind === "mono")?.id ?? "all");
  const preset = PRESETS.find((candidate) => candidate.id === presetId);

  // One scale for the whole sequence: every frame of a blink is drawn with the same limits.
  const frames = useMemo(() => synth.sequenceFor(presetId), [synth, presetId]);
  const limits = useMemo(() => pooledLimits(frames), [frames]);
  const images = useMemo(
    () => frames.map((frame) => renderGrey(frame.data, nx, ny, limits)),
    [frames, limits, nx, ny],
  );
  const caveats = useMemo(
    () => [...new Set(frames.map(caveatSentences).filter((text) => text !== null))],
    [frames],
  );

  const reducedMotion = usePrefersReducedMotion();
  const [clock, { index, playing, fps }] = useFrameClock(frames.length);
  const count = frames.length;
  const shown = Math.min(index, count - 1);
  const frame = frames[shown];
  const bin = timeBins[shown];

  // Choosing a frame by hand takes over from playback.
  const stepBy = useCallback(
    (delta: number) => {
      clock.pause();
      clock.step(delta);
    },
    [clock],
  );
  const showFrame = useCallback(
    (target: number) => {
      clock.pause();
      clock.show(target);
    },
    [clock],
  );

  useEffect(() => {
    if (reducedMotion) clock.pause();
  }, [reducedMotion, clock]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        stepBy(event.key === "ArrowLeft" ? -1 : 1);
      } else if (event.key === " " && !reducedMotion) {
        // A focused button or link keeps its own Space.
        if (target?.closest("button, a[href], summary")) return;
        event.preventDefault(); // do not scroll the page
        if (!event.repeat) clock.toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clock, reducedMotion, stepBy]);

  if (!frame || !bin) {
    return (
      <div className="state">
        <h2>No frames in this field</h2>
        <p className="muted">The manifest lists no time bins, so there is nothing to blink.</p>
      </div>
    );
  }

  const caveat = frameCaveat(frame);
  const position = `Frame ${shown + 1} of ${count}`;
  const hasRgbPreset = PRESETS.some((candidate) => candidate.kind === "rgb");

  return (
    <section className="stack" aria-label="Blink comparator">
      <div className="stack">
        <fieldset className="row">
          <legend className="muted">Wavelength</legend>
          {PRESETS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={candidate.id === presetId}
              disabled={candidate.kind === "rgb"}
              title={microns(candidate.label)}
              onMouseDown={keepFocus}
              onClick={() => setPresetId(candidate.id)}
            >
              {candidate.short}
            </button>
          ))}
          {hasRgbPreset && <span className="muted">(the three-colour view is not built yet)</span>}
        </fieldset>
        {preset && (
          <p className="muted">
            {microns(preset.label)}
            {preset.note ? `: ${microns(preset.note)}` : ""}
          </p>
        )}
      </div>

      {limits === null && (
        <p className="notice">
          No visit of this field has data in this wavelength range. Try another preset.
        </p>
      )}

      <Viewport
        grid={grid}
        nx={nx}
        ny={ny}
        image={images[shown] ?? null}
        data={frame.data}
        label={`SPHEREx image, ${position}, ${dateRange(bin.date_start, bin.date_end)}. North is up, east is left.`}
        dimmed={caveat !== null}
        badge={caveat}
      />

      <FrameLabel
        frame={frame}
        bin={bin}
        position={position}
        pixscale={pixscale}
        caveats={caveats}
      />

      <div className="row">
        <button
          type="button"
          disabled={count < 2}
          onMouseDown={keepFocus}
          onClick={() => stepBy(-1)}
        >
          &larr; Previous
        </button>
        {!reducedMotion && (
          <button
            type="button"
            disabled={count < 2}
            onMouseDown={keepFocus}
            onClick={() => clock.toggle()}
          >
            {playing ? "Pause" : "Play"}
          </button>
        )}
        <button
          type="button"
          disabled={count < 2}
          onMouseDown={keepFocus}
          onClick={() => stepBy(1)}
        >
          Next &rarr;
        </button>
        {!reducedMotion && (
          <label>
            Speed
            <select value={fps} onChange={(event) => clock.setFps(Number(event.target.value))}>
              {FPS_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice} per second
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="muted">
          {reducedMotion
            ? "Your system asks for reduced motion, so frames change only when you step. Keys: Left and Right."
            : "Keys: Space plays or pauses, Left and Right step."}
        </span>
      </div>

      <ol className="strip" aria-label="Visits">
        {frames.map((candidate, i) => {
          const visit = timeBins[i];
          const note = frameCaveat(candidate);
          return (
            <li key={visit.id}>
              <button
                type="button"
                aria-current={i === shown ? "true" : undefined}
                onMouseDown={keepFocus}
                onClick={() => showFrame(i)}
              >
                <span className="num">{dateRange(visit.date_start, visit.date_end)}</span>
                <span className="strip-meta">
                  {plural(candidate.nExposures, "exposure")}
                  {note ? ` · ${note.toLowerCase()}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="muted">
        <span className="swatch" style={{ background: NO_DATA_CSS }} /> No data (off detector,
        masked or saturated).
        {limits && (
          <>
            {" "}
            Grey scale: asinh stretch from{" "}
            <span className="num">{limits.vmin.toPrecision(3).replace("-", "−")}</span> to{" "}
            <span className="num">{limits.vmax.toPrecision(3)}</span> MJy/sr, the same for every
            frame.
          </>
        )}
      </p>
    </section>
  );
}
