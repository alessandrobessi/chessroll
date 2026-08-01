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

/**
 * Fraction (0-1) of an evaluation bar that should read as White's — a
 * smooth, saturating curve (not linear), so a pawn matters far more near
 * an even position than in an already-decided one. Mate scores saturate
 * fully toward whichever side delivers the mate, matching formatEvaluation
 * never coercing a mate into a plain centipawn number.
 */
export function evaluationBarFraction(score: EngineScore): number {
  if (score.type === "mate") return score.value >= 0 ? 1 : 0;
  const pawns = score.value / 100;
  return 1 / (1 + Math.pow(10, -pawns / 4));
}

/**
 * Mate scores are never treated as ordinary centipawn values for DISPLAY
 * (see formatEvaluation above) — but detectors (blunder, brilliant) need
 * to rank/threshold cp and mate swings on one internal scale. This constant
 * exists only for that ranking arithmetic and must never reach
 * formatEvaluation() or any other display path.
 */
const MATE_COMPARABLE_MAGNITUDE = 100_000;

/**
 * Converts a White-perspective EngineScore into "how good is this for
 * `mover`", on a single scale where mate scores always dominate any
 * realistic cp swing (a mate is at least as significant as any material
 * swing, regardless of "distance" heuristics that don't apply to forced
 * mates). Shared by src/story/blunder.ts and src/story/brilliant.ts.
 */
export function moverComparableValue(score: EngineScore, mover: Side): number {
  const sign = mover === "white" ? 1 : -1;
  const value = score.value * sign;
  if (score.type === "cp") return value;
  return value >= 0 ? MATE_COMPARABLE_MAGNITUDE - value : -MATE_COMPARABLE_MAGNITUDE - value;
}
