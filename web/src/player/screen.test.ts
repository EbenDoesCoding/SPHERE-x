import { describe, expect, it } from "vitest";
import { pixelToScreen, screenToPixel } from "./screen";

// A 119 x 119 plane drawn 595 CSS pixels wide: every plane pixel covers 5 x 5 CSS pixels.
const box = { width: 595, height: 595 };
const n = 119;

function expectPoint(actual: { x: number; y: number }, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
}

describe("screenToPixel", () => {
  it("puts pixel centres at integer coordinates", () => {
    expectPoint(screenToPixel(box, n, n, { x: 2.5, y: 2.5 }), 0, 0);
    expectPoint(screenToPixel(box, n, n, { x: 297.5, y: 297.5 }), 59, 59);
    expectPoint(screenToPixel(box, n, n, { x: 592.5, y: 2.5 }), 118, 0);
  });

  it("maps the corners of the box to half a pixel outside the outer centres", () => {
    expectPoint(screenToPixel(box, n, n, { x: 0, y: 0 }), -0.5, -0.5);
    expectPoint(screenToPixel(box, n, n, { x: 595, y: 595 }), 118.5, 118.5);
  });

  it("handles a box that is not square", () => {
    expectPoint(screenToPixel({ width: 200, height: 100 }, 4, 2, { x: 125, y: 75 }), 2, 1);
  });
});

describe("pixelToScreen", () => {
  it("is the inverse of screenToPixel", () => {
    for (const screen of [
      { x: 0, y: 0 },
      { x: 13.25, y: 480.5 },
      { x: 595, y: 301 },
    ]) {
      const back = pixelToScreen(box, n, n, screenToPixel(box, n, n, screen));
      expectPoint(back, screen.x, screen.y);
    }
  });

  it("puts the centre pixel in the middle of the box", () => {
    expectPoint(pixelToScreen(box, n, n, { x: 59, y: 59 }), 297.5, 297.5);
  });
});
