/**
 * Between the image as drawn on screen and plane pixel coordinates.
 *
 * "Screen" positions are CSS pixels measured from the top-left corner of the drawn image.
 * Plane pixel centres sit at integer coordinates, so pixel (0, 0) covers the first
 * 1/nx by 1/ny of the box and its centre is half a pixel in from the corner.
 */
import type { PixelPosition } from "./grid";

/** Size of the drawn image in CSS pixels. */
export interface BoxSize {
  width: number;
  height: number;
}

/** A point in CSS pixels from the top-left corner of the drawn image. */
export interface ScreenPosition {
  x: number;
  y: number;
}

/** A point on the drawn image to plane pixel coordinates. */
export function screenToPixel(
  box: BoxSize,
  nx: number,
  ny: number,
  screen: ScreenPosition,
): PixelPosition {
  return {
    x: (screen.x / box.width) * nx - 0.5,
    y: (screen.y / box.height) * ny - 0.5,
  };
}

/** Plane pixel coordinates to a point on the drawn image. */
export function pixelToScreen(
  box: BoxSize,
  nx: number,
  ny: number,
  pixel: PixelPosition,
): ScreenPosition {
  return {
    x: ((pixel.x + 0.5) / nx) * box.width,
    y: ((pixel.y + 0.5) / ny) * box.height,
  };
}
