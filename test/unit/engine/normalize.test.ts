import { describe, expect, it } from "vitest";
import { formatEvaluation, normalizeScore } from "../../../src/engine/normalize.js";

describe("normalizeScore", () => {
  it("keeps a White-to-move score unchanged", () => {
    expect(normalizeScore({ type: "cp", value: 34 }, "white")).toEqual({
      type: "cp",
      value: 34,
      perspective: "white",
    });
  });

  it("flips a Black-to-move score to White's perspective", () => {
    // Raw score is relative to the mover (Black); Black being +34 for
    // itself means White is actually -34.
    expect(normalizeScore({ type: "cp", value: 34 }, "black")).toEqual({
      type: "cp",
      value: -34,
      perspective: "white",
    });
  });

  it("flips mate scores the same way as centipawn scores", () => {
    expect(normalizeScore({ type: "mate", value: 3 }, "black")).toEqual({
      type: "mate",
      value: -3,
      perspective: "white",
    });
    expect(normalizeScore({ type: "mate", value: -2 }, "black")).toEqual({
      type: "mate",
      value: 2,
      perspective: "white",
    });
  });
});

describe("formatEvaluation", () => {
  it("formats positive and negative centipawn scores to one decimal pawn value", () => {
    expect(formatEvaluation({ type: "cp", value: 34, perspective: "white" })).toBe("+0.3");
    expect(formatEvaluation({ type: "cp", value: -417, perspective: "white" })).toBe("-4.2");
    expect(formatEvaluation({ type: "cp", value: 0, perspective: "white" })).toBe("+0.0");
  });

  it("formats mate scores as M<n> / -M<n>, never as a centipawn number", () => {
    expect(formatEvaluation({ type: "mate", value: 3, perspective: "white" })).toBe("M3");
    expect(formatEvaluation({ type: "mate", value: -2, perspective: "white" })).toBe("-M2");
  });
});
