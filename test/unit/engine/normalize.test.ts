import { describe, expect, it } from "vitest";
import {
  formatEvaluation,
  moverComparableValue,
  normalizeScore,
} from "../../../src/engine/normalize.js";

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

describe("moverComparableValue", () => {
  it("returns the plain cp value for the mover on a White-perspective score", () => {
    expect(moverComparableValue({ type: "cp", value: 50, perspective: "white" }, "white")).toBe(50);
    expect(moverComparableValue({ type: "cp", value: 50, perspective: "white" }, "black")).toBe(
      -50,
    );
  });

  it("maps mate scores to a magnitude that always dominates any realistic cp value", () => {
    const whiteMatesSoon = moverComparableValue(
      { type: "mate", value: 3, perspective: "white" },
      "white",
    );
    const hugeCpAdvantage = moverComparableValue(
      { type: "cp", value: 2000, perspective: "white" },
      "white",
    );
    expect(whiteMatesSoon).toBeGreaterThan(hugeCpAdvantage);

    const whiteGetsMated = moverComparableValue(
      { type: "mate", value: -3, perspective: "white" },
      "white",
    );
    expect(whiteGetsMated).toBeLessThan(-hugeCpAdvantage);
  });

  it("is symmetric: mover being mated is exactly as bad as the opponent mating being good for them", () => {
    const forMoverWhite = moverComparableValue(
      { type: "mate", value: -3, perspective: "white" },
      "white",
    );
    const forMoverBlack = moverComparableValue(
      { type: "mate", value: -3, perspective: "white" },
      "black",
    );
    expect(forMoverBlack).toBe(-forMoverWhite);
  });
});
