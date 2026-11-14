/**
 * Forms displayed frames in the browser from the planes of a field (Contract v1.0 section 4).
 *
 * The server ships one plane per (time bin, wave bin). A frame is their weighted mean over the
 * wave bins a preset selects:
 *
 *   frame(t) = sum_b w_b P(t, b) / sum_b w_b      per pixel, over bins with a finite pixel
 *   sigma    = sqrt(sum_b w_b^2 sigma_b^2) / sum_b w_b
 *   w_b      = 1 ("uniform")  or  1 / sigma_b^2 ("ivar")
 *
 * Image values are surface brightness in MJy/sr; NaN means no data and stays NaN.
 */
import { type Manifest, type Plane, THIN_EXPOSURES, type WaveBin } from "../contract";
import {
  type BinSelector,
  contractWaveBins,
  DEFAULT_WEIGHTING,
  getPreset,
  type Weighting,
} from "./presets";

/** Wave-bin ids a preset selects: one list, or one per colour channel. */
export type PresetBins =
  | { kind: "mono"; bins: number[] }
  | { kind: "rgb"; r: number[]; g: number[]; b: number[] };

/** One displayed image: a time bin seen through a set of wave bins. */
export interface Frame {
  /** Id of the time bin shown. */
  timeBin: number;
  /** ny * nx pixels, row 0 north, column 0 east, MJy/sr. NaN = no data. */
  data: Float32Array;
  /** Noise of the frame propagated from its planes, MJy/sr. NaN when nothing contributes. */
  sigma: number;
  /** Exposures that went into the frame. */
  nExposures: number;
  /** Blue edge of the contributing wave bins, µm. NaN when nothing contributes. */
  lamMin: number;
  /** Red edge of the contributing wave bins, µm. NaN when nothing contributes. */
  lamMax: number;
  /** Ids of the contributing wave bins, ascending. */
  waveBins: number[];
  /** ISO date of the earliest contributing plane; null when nothing contributes. */
  dateStart: string | null;
  /** ISO date of the latest contributing plane; null when nothing contributes. */
  dateEnd: string | null;
  /** True when some wave bin seen at another time is missing here: the colour mix differs. */
  partial: boolean;
  /** True when fewer than 8 exposures went in. */
  thin: boolean;
}

export interface RgbFrame {
  r: Frame;
  g: Frame;
  b: Frame;
}

/** Pixel-wise difference of two frames, MJy/sr. */
export interface DifferenceFrame {
  /** a - b per pixel; NaN where either frame has no data. */
  data: Float32Array;
  /** sqrt(sigma_a^2 + sigma_b^2), MJy/sr. */
  sigma: number;
  /** Time-bin ids of a and b. */
  timeBins: [number, number];
}

type SciencePlane = Plane & { time_bin: number; wave_bin: number };

/** A SPHEREx stack with a usable noise estimate. Legacy planes are never mixed into frames. */
function isUsableScience(plane: Plane): plane is SciencePlane {
  return (
    plane.kind === "sci" &&
    plane.time_bin !== null &&
    plane.wave_bin !== null &&
    Number.isFinite(plane.sigma) &&
    plane.sigma > 0
  );
}

/**
 * Ids of the wave bins a selector picks. A detector list picks that detector's bins; a
 * wavelength range picks the bins whose centre lies inside it (edges included).
 */
export function selectWaveBins(selector: BinSelector, waveBins: readonly WaveBin[]): number[] {
  const { detectors, lam_min, lam_max } = selector;
  const byRange = lam_min !== undefined && lam_max !== undefined;
  if (!detectors && !byRange) return [];
  return waveBins
    .filter((bin) => {
      if (detectors && !detectors.includes(bin.detector)) return false;
      if (!byRange) return true;
      const centre = (bin.lam_min + bin.lam_max) / 2;
      return centre >= lam_min && centre <= lam_max;
    })
    .map((bin) => bin.id)
    .sort((a, b) => a - b);
}

/** Wave bins selected by a preset of presets.json; the rgb preset gives three lists. */
export function presetWaveBins(
  presetId: string,
  waveBins: readonly WaveBin[] = contractWaveBins(),
): PresetBins {
  const preset = getPreset(presetId);
  if (preset.kind === "rgb") {
    return {
      kind: "rgb",
      r: selectWaveBins(preset.r, waveBins),
      g: selectWaveBins(preset.g, waveBins),
      b: selectWaveBins(preset.b, waveBins),
    };
  }
  return { kind: "mono", bins: selectWaveBins(preset, waveBins) };
}

const planeKey = (timeBin: number, waveBin: number) => `${timeBin}:${waveBin}`;

/** The planes of one field, ready to be combined into frames. */
export class FieldSynth {
  /** Pixels per plane: ny * nx. */
  readonly npix: number;
  private readonly waveBins: readonly WaveBin[];
  private readonly science = new Map<string, SciencePlane>();

  /**
   * @param manifest the field's manifest
   * @param values   frames.bin decoded to float32: every plane, concatenated in index order
   */
  constructor(
    readonly manifest: Manifest,
    private readonly values: Float32Array,
  ) {
    this.npix = manifest.grid.nx * manifest.grid.ny;
    this.waveBins = manifest.wave_bins.length > 0 ? manifest.wave_bins : contractWaveBins();
    for (const plane of manifest.planes) {
      const start = plane.offset / 2;
      if (!Number.isInteger(start) || start < 0 || start + this.npix > values.length) {
        throw new RangeError(`plane ${plane.index} does not fit in the decoded frame file`);
      }
      if (isUsableScience(plane)) {
        this.science.set(planeKey(plane.time_bin, plane.wave_bin), plane);
      }
    }
  }

  /** Pixels of one plane, MJy/sr. A view into the decoded file, not a copy. */
  planeData(plane: Plane): Float32Array {
    const start = plane.offset / 2;
    return this.values.subarray(start, start + this.npix);
  }

  /** Planes of one time bin among the selected wave bins, in wave-bin order. */
  private contributing(timeBinId: number, bins: readonly number[]): SciencePlane[] {
    const planes: SciencePlane[] = [];
    for (const bin of bins) {
      const plane = this.science.get(planeKey(timeBinId, bin));
      if (plane) planes.push(plane);
    }
    return planes;
  }

  /** How many of the selected wave bins have a plane in at least one time bin. */
  private unionSize(bins: readonly number[]): number {
    const timeBins = this.manifest.time_bins;
    return bins.filter((bin) => timeBins.some((t) => this.science.has(planeKey(t.id, bin)))).length;
  }

  /** The frame of one time bin over an explicit list of wave-bin ids. */
  frameForBins(
    timeBinId: number,
    bins: readonly number[],
    weighting: Weighting = DEFAULT_WEIGHTING,
  ): Frame {
    if (!this.manifest.time_bins.some((t) => t.id === timeBinId)) {
      throw new RangeError(`unknown time bin ${timeBinId}`);
    }
    const planes = this.contributing(timeBinId, bins);
    const weights = planes.map((plane) =>
      weighting === "ivar" ? 1 / (plane.sigma * plane.sigma) : 1,
    );

    const weighted = new Float64Array(this.npix);
    const weightAt = new Float64Array(this.npix);
    let weightTotal = 0;
    let varianceTotal = 0;
    planes.forEach((plane, i) => {
      const w = weights[i];
      const pixels = this.planeData(plane);
      for (let p = 0; p < this.npix; p++) {
        const value = pixels[p];
        if (Number.isFinite(value)) {
          weighted[p] += w * value;
          weightAt[p] += w;
        }
      }
      weightTotal += w;
      varianceTotal += w * w * plane.sigma * plane.sigma;
    });

    const data = new Float32Array(this.npix);
    for (let p = 0; p < this.npix; p++) {
      data[p] = weightAt[p] > 0 ? weighted[p] / weightAt[p] : Number.NaN;
    }

    const nExposures = planes.reduce((sum, plane) => sum + plane.n_exposures, 0);
    const some = planes.length > 0;
    return {
      timeBin: timeBinId,
      data,
      sigma: some ? Math.sqrt(varianceTotal) / weightTotal : Number.NaN,
      nExposures,
      lamMin: some ? Math.min(...planes.map((plane) => plane.lam_min)) : Number.NaN,
      lamMax: some ? Math.max(...planes.map((plane) => plane.lam_max)) : Number.NaN,
      waveBins: planes.map((plane) => plane.wave_bin),
      dateStart: some ? planes.map((plane) => plane.date_start).sort()[0] : null,
      dateEnd: some
        ? (planes
            .map((plane) => plane.date_end)
            .sort()
            .at(-1) ?? null)
        : null,
      partial: planes.length !== this.unionSize(bins),
      thin: nExposures < THIN_EXPOSURES,
    };
  }

  /** The frame of one time bin through a single-image preset. */
  frameFor(timeBinId: number, presetId: string, weighting: Weighting = DEFAULT_WEIGHTING): Frame {
    const selection = presetWaveBins(presetId, this.waveBins);
    if (selection.kind !== "mono") {
      throw new TypeError(`preset "${presetId}" has three channels: use rgbFrameFor`);
    }
    return this.frameForBins(timeBinId, selection.bins, weighting);
  }

  /** The three channel frames of one time bin through a three-colour preset. */
  rgbFrameFor(
    timeBinId: number,
    presetId: string,
    weighting: Weighting = DEFAULT_WEIGHTING,
  ): RgbFrame {
    const selection = presetWaveBins(presetId, this.waveBins);
    if (selection.kind !== "rgb") {
      throw new TypeError(`preset "${presetId}" has one channel: use frameFor`);
    }
    return {
      r: this.frameForBins(timeBinId, selection.r, weighting),
      g: this.frameForBins(timeBinId, selection.g, weighting),
      b: this.frameForBins(timeBinId, selection.b, weighting),
    };
  }

  /** The blink sequence of a single-image preset: one frame per time bin, in manifest order. */
  sequenceFor(presetId: string, weighting: Weighting = DEFAULT_WEIGHTING): Frame[] {
    return this.manifest.time_bins.map((t) => this.frameFor(t.id, presetId, weighting));
  }
}

function sameBins(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((bin, i) => bin === b[i]);
}

/**
 * a - b, or null when the pair must not be differenced: a partial or thin frame, a frame with
 * no data, or two frames built from different wave bins (their colour mix differs).
 */
export function differenceFrame(a: Frame, b: Frame): DifferenceFrame | null {
  if (a.partial || a.thin || b.partial || b.thin) return null;
  if (a.waveBins.length === 0 || !sameBins(a.waveBins, b.waveBins)) return null;
  if (a.data.length !== b.data.length) throw new RangeError("frames are on different grids");
  const data = new Float32Array(a.data.length);
  for (let p = 0; p < data.length; p++) data[p] = a.data[p] - b.data[p];
  return { data, sigma: Math.hypot(a.sigma, b.sigma), timeBins: [a.timeBin, b.timeBin] };
}
