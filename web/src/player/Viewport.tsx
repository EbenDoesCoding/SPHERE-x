import {
  type MouseEvent,
  type PointerEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { type PixelPosition, pixelToSky, type SkyGrid, type SkyPosition, skyToPixel } from "./grid";
import { type BoxSize, pixelToScreen, type ScreenPosition, screenToPixel } from "./screen";

export type SkyClickCallback = (sky: SkyPosition, pixel: PixelPosition) => void;

/**
 * What panels use instead of doing their own projection maths (Contract v1.0 section 9).
 * Screen positions are CSS pixels from the top-left corner of the drawn image.
 */
export interface ViewportHandle {
  skyToScreen(ra: number, dec: number): ScreenPosition;
  screenToSky(x: number, y: number): SkyPosition;
  /** Calls `callback` for every click on the image; returns the function that stops it. */
  onSkyClick(callback: SkyClickCallback): () => void;
}

interface ViewportProps {
  grid: SkyGrid;
  /** Plane size in pixels. */
  nx: number;
  ny: number;
  /** The frame to draw, at data resolution; null clears the canvas. */
  image: ImageData | null;
  /** Pixels of the frame shown (MJy/sr), for the readout under the pointer. */
  data: Float32Array | null;
  /** Describes the frame for assistive technology. */
  label: string;
  /** Greys the image out: for thin or partial frames. */
  dimmed?: boolean;
  /** Short text drawn over the image, saying why it is greyed. */
  badge?: string | null;
  ref?: Ref<ViewportHandle>;
}

function boxOf(canvas: HTMLCanvasElement | null, nx: number, ny: number): BoxSize {
  const rect = canvas?.getBoundingClientRect();
  return rect && rect.width > 0 ? rect : { width: nx, height: ny };
}

/** Fixed-point text with a typographic minus sign. */
const fixed = (value: number, digits: number) => value.toFixed(digits).replace("-", "−");

/**
 * The image area: a canvas with exactly one canvas pixel per data pixel, enlarged by CSS with
 * `image-rendering: pixelated`. North is up and east is left, as the contract's grid defines.
 */
export function Viewport({
  grid,
  nx,
  ny,
  image,
  data,
  label,
  dimmed = false,
  badge = null,
  ref,
}: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clickCallbacks = useRef(new Set<SkyClickCallback>());
  const [pointer, setPointer] = useState<PixelPosition | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    // One canvas pixel per data pixel. (Setting a size clears the canvas, so only on change.)
    if (canvas.width !== nx) canvas.width = nx;
    if (canvas.height !== ny) canvas.height = ny;
    if (image) context.putImageData(image, 0, 0);
    else context.clearRect(0, 0, nx, ny);
  }, [image, nx, ny]);

  useImperativeHandle(
    ref,
    () => ({
      skyToScreen: (ra, dec) =>
        pixelToScreen(boxOf(canvasRef.current, nx, ny), nx, ny, skyToPixel(grid, ra, dec)),
      screenToSky: (x, y) => {
        const pixel = screenToPixel(boxOf(canvasRef.current, nx, ny), nx, ny, { x, y });
        return pixelToSky(grid, pixel.x, pixel.y);
      },
      onSkyClick: (callback) => {
        clickCallbacks.current.add(callback);
        return () => {
          clickCallbacks.current.delete(callback);
        };
      },
    }),
    [grid, nx, ny],
  );

  function pixelUnder(event: PointerEvent<HTMLCanvasElement> | MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToPixel(rect, nx, ny, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const pixel = pixelUnder(event);
    const sky = pixelToSky(grid, pixel.x, pixel.y);
    for (const callback of clickCallbacks.current) callback(sky, pixel);
  }

  let readout = "Point at the image to read position and brightness.";
  if (pointer) {
    const sky = pixelToSky(grid, pointer.x, pointer.y);
    const column = Math.round(pointer.x);
    const row = Math.round(pointer.y);
    const inside = column >= 0 && column < nx && row >= 0 && row < ny;
    const value = inside && data ? data[row * nx + column] : Number.NaN;
    const brightness = Number.isFinite(value) ? `${fixed(value, 4)} MJy/sr` : "no data";
    const decSign = sky.dec >= 0 ? "+" : "";
    readout = `RA ${sky.ra.toFixed(5)}°  Dec ${decSign}${fixed(sky.dec, 5)}°  ${brightness}`;
  }

  return (
    <div className="viewport">
      <div className={dimmed ? "viewport-frame is-dimmed" : "viewport-frame"}>
        {/* Reading and picking a sky position need a pointer for now: keyboard access is an open issue. */}
        <canvas
          ref={canvasRef}
          className="viewport-canvas"
          role="img"
          aria-label={label}
          style={{ aspectRatio: `${nx} / ${ny}` }}
          onPointerMove={(event) => setPointer(pixelUnder(event))}
          onPointerLeave={() => setPointer(null)}
          onClick={handleClick}
        />
        {badge && <span className="viewport-badge">{badge}</span>}
        <svg className="compass" viewBox="0 0 64 64" aria-hidden="true">
          <title>North is up, east is left</title>
          <path d="M50 50V20M50 50H20" />
          <path d="M50 13l-4.5 8h9z" />
          <path d="M13 50l8-4.5v9z" />
          <text x="50" y="10" textAnchor="middle">
            N
          </text>
          <text x="2" y="54">
            E
          </text>
        </svg>
      </div>
      <p className="readout num">{readout}</p>
    </div>
  );
}
