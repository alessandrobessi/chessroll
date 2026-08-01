import { describe, expect, it } from "vitest";
import { clamp, easeInOutCubic, lerp, progressOf } from "../../../src/scene/interpolation.js";

describe("clamp", () => {
  it("clamps to the range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe("lerp", () => {
  it("interpolates linearly", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe("progressOf", () => {
  it("is 0 at start and 1 at end, clamped outside", () => {
    expect(progressOf(1, 1, 3)).toBe(0);
    expect(progressOf(3, 1, 3)).toBe(1);
    expect(progressOf(2, 1, 3)).toBe(0.5);
    expect(progressOf(0, 1, 3)).toBe(0);
    expect(progressOf(10, 1, 3)).toBe(1);
  });

  it("degenerates to instant progress when end <= start", () => {
    expect(progressOf(5, 5, 5)).toBe(1);
    expect(progressOf(4, 5, 5)).toBe(0);
  });
});

describe("easeInOutCubic", () => {
  it("is a pure function of progress alone", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
    // symmetry
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75), 5);
  });

  it("clamps out-of-range progress", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});
