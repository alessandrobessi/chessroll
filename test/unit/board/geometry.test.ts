import { describe, expect, it } from "vitest";
import {
  createBoardGeometry,
  squareColor,
  squareToPoint,
  squareToRect,
} from "../../../src/board/geometry.js";

describe("board geometry", () => {
  const white = createBoardGeometry({ x: 100, y: 200, size: 800, orientation: "white" });
  const black = createBoardGeometry({ x: 100, y: 200, size: 800, orientation: "black" });

  it("computes squareSize from size", () => {
    expect(white.squareSize).toBe(100);
  });

  it("places a1 at the bottom-left for white orientation", () => {
    const rect = squareToRect("a1", white);
    expect(rect).toEqual({ x: 100, y: 900, width: 100, height: 100 });
  });

  it("places h8 at the top-right for white orientation", () => {
    const rect = squareToRect("h8", white);
    expect(rect).toEqual({ x: 800, y: 200, width: 100, height: 100 });
  });

  it("places a1 at the top-right for black orientation", () => {
    const rect = squareToRect("a1", black);
    expect(rect).toEqual({ x: 800, y: 200, width: 100, height: 100 });
  });

  it("places h8 at the bottom-left for black orientation", () => {
    const rect = squareToRect("h8", black);
    expect(rect).toEqual({ x: 100, y: 900, width: 100, height: 100 });
  });

  it("computes the center point of a square", () => {
    expect(squareToPoint("a1", white)).toEqual({ x: 150, y: 950 });
  });

  it("colors a1 dark and h1 light, matching a real board", () => {
    expect(squareColor("a1")).toBe("dark");
    expect(squareColor("h1")).toBe("light");
    expect(squareColor("d4")).toBe("dark");
    expect(squareColor("e4")).toBe("light");
  });
});
