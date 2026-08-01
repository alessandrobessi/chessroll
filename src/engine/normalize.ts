import type { Side } from "../chess/types.js";
import type { EngineScore } from "./analysis.js";

/**
 * Raw UCI `score cp`/`score mate` values are always relative to the side to
 * move, never to White. This is the single place that gets flipped —
 * nothing downstream (story/scene/board code) may re-derive perspective.
 */
export function normalizeScore(
  raw: { type: "cp" | "mate"; value: number },
  sideToMove: Side,
): EngineScore {
  const sign = sideToMove === "black" ? -1 : 1;
  return { type: raw.type, value: raw.value * sign, perspective: "white" };
}

/**
 * "cp +34 -> +0.3", "cp -417 -> -4.2", "mate +3 -> M3", "mate -2 -> -M2".
 * Mate scores are never coerced into a centipawn number.
 */
export function formatEvaluation(score: EngineScore): string {
  if (score.type === "mate") {
    return score.value >= 0 ? `M${score.value}` : `-M${Math.abs(score.value)}`;
  }
  const pawns = score.value / 100;
  const sign = pawns >= 0 ? "+" : "";
  return `${sign}${pawns.toFixed(1)}`;
}
