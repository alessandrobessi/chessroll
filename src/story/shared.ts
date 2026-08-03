import { Chess, type Color, type PieceSymbol } from "chess.js";
import type { ChessGame, GameMetadata, Ply, Side } from "../chess/types.js";
import type { EngineScore, PositionAnalysis } from "../engine/analysis.js";
import { evaluationBarFraction, moverComparableValue } from "../engine/normalize.js";
import type { MoveQualityTier } from "../scene/types.js";

/**
 * Shared, template-agnostic pieces used by every full-game template
 * (currently replay, game60) — player/header formatting and "what kind of
 * move is this" classification. Per-template duration/pause mapping stays
 * local to each story builder, since that's where the two templates
 * genuinely differ (replay's fixed seconds vs. game60's budget-scaled ones).
 */

/** chess.js defaults an unset PGN header to the literal string "?" — treat that as absent, same as undefined. */
export function formatPlayer(
  name: string | undefined,
  elo: number | undefined,
  fallback: string,
): string {
  const label = name && name !== "?" ? name : fallback;
  return elo !== undefined ? `${label} (${elo})` : label;
}

/** PGN dates are "YYYY.MM.DD", with "?" in place of any unknown component — extract a real year, if any. */
function extractYear(date: string | undefined): string | undefined {
  const year = date?.split(".")[0];
  return year && /^\d{4}$/.test(year) ? year : undefined;
}

export function headerFor(metadata: GameMetadata): { title: string; subtitle?: string } {
  const white = formatPlayer(metadata.white, metadata.whiteElo, "White");
  const black = formatPlayer(metadata.black, metadata.blackElo, "Black");
  const event = metadata.event && metadata.event !== "?" ? metadata.event : undefined;
  const year = extractYear(metadata.date);
  const subtitle = [event, year].filter((part) => part !== undefined).join(", ") || undefined;
  return { title: `${white} vs ${black}`, subtitle };
}

export function moveNumberLabel(ply: Ply): string {
  return ply.side === "white" ? `${ply.moveNumber}.` : `${ply.moveNumber}...`;
}

export type MoveCategory = "quiet" | "capture" | "check" | "swing" | "critical";

export interface MoveClassification {
  category: MoveCategory;
  /** Mover-relative eval delta (positive = good for whoever just moved). */
  swing: number;
}

/** "Large eval swing" (BLUEPRINT.md §19) — matches brilliant's own advantage threshold. */
const SWING_THRESHOLD_CP = 150;
/** Between inaccuracy and blunder — classifyMoveQuality-only, doesn't affect classifyMoveCategory's own pacing bands. */
const MISTAKE_THRESHOLD_CP = 200;
/** "Critical move" — matches blunder's own severity threshold. */
const CRITICAL_THRESHOLD_CP = 300;
/** How far short of the engine's own best line counts as failing to punish a gifted opportunity (see detectMiss). */
const MISS_THRESHOLD_CP = 200;

/**
 * BLUEPRINT.md §14/§19's importance ladder: quiet < capture < check < large
 * swing < critical. A mating move is always critical regardless of the
 * computed swing magnitude — chess.js may not report a huge mate-scale
 * delta the same way a cp swing would, but delivering mate is unambiguously
 * the most important thing that can happen on a move.
 */
export function classifyMoveCategory(
  ply: Ply,
  before: PositionAnalysis,
  after: PositionAnalysis,
): MoveClassification {
  const swing =
    moverComparableValue(after.score, ply.side) - moverComparableValue(before.score, ply.side);

  if (ply.flags.mate || swing >= CRITICAL_THRESHOLD_CP || swing <= -CRITICAL_THRESHOLD_CP) {
    return { category: "critical", swing };
  }
  if (Math.abs(swing) >= SWING_THRESHOLD_CP) {
    return { category: "swing", swing };
  }
  if (ply.flags.check) {
    return { category: "check", swing };
  }
  if (ply.flags.capture) {
    return { category: "capture", swing };
  }
  return { category: "quiet", swing };
}

/**
 * Chessroll's own transparent (not a SEE) sacrifice heuristic, per
 * BLUEPRINT.md §22's explicit instruction not to copy any proprietary
 * "brilliant move" classifier: a move counts as a sacrifice if the piece
 * that just moved is attacked on its new square, and its own value
 * exceeds whatever it captured in this move (so an opponent recapture
 * would net the mover a material loss on this exchange alone). Shared by
 * brilliant.ts's own detector and classifyMoveQuality's "brilliant" tier
 * below, so a "brilliant" badge and the brilliant template's own "!!"
 * always mean the same thing.
 */
const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function isSacrifice(ply: Ply): boolean {
  const chess = new Chess(ply.fenAfter);
  const opponentColor: Color = ply.side === "white" ? "b" : "w";
  if (!chess.isAttacked(ply.to, opponentColor)) return false;
  const movedValue = PIECE_VALUE[ply.promotion ?? ply.piece];
  const capturedValue = ply.captured ? PIECE_VALUE[ply.captured] : 0;
  return movedValue > capturedValue;
}

const QUALITY_GLYPH: Record<MoveQualityTier, string> = {
  blunder: "??",
  mistake: "?",
  inaccuracy: "?!",
  great: "!",
  brilliant: "!!",
  miss: "⨯",
};

export function moveQualityGlyph(tier: MoveQualityTier): string {
  return QUALITY_GLYPH[tier];
}

/**
 * Chess.com/lichess-style per-move annotation tier. The bad-move ladder
 * (inaccuracy < mistake < blunder) subdivides classifyMoveCategory's own
 * "swing"/"critical" bands via MISTAKE_THRESHOLD_CP so every one of those
 * categories still gets a tier (and quiet/capture/check never do); the
 * good-move side reuses the same isSacrifice heuristic brilliant.ts uses
 * to distinguish "!!" from "!". A move that delivers checkmate is always
 * "brilliant" regardless of its computed swing — delivering mate can
 * never be a mistake for the mover, the same reasoning classifyMoveCategory
 * already applies for pacing.
 */
export function classifyMoveQuality(ply: Ply, swing: number): MoveQualityTier | undefined {
  if (ply.flags.mate) return "brilliant";
  if (swing <= -CRITICAL_THRESHOLD_CP) return "blunder";
  if (swing <= -MISTAKE_THRESHOLD_CP) return "mistake";
  if (swing <= -SWING_THRESHOLD_CP) return "inaccuracy";
  if (swing >= SWING_THRESHOLD_CP) return isSacrifice(ply) ? "brilliant" : "great";
  return undefined;
}

/**
 * A different axis from classifyMoveQuality above: not "how good was this
 * move on its own," but "the opponent just handed you a golden
 * opportunity (their previous move was a blunder/mistake) — did you take
 * it?" `before`/`after` are the analyses straddling `ply` (before is the
 * same position `previousPly`'s own "after" analysis would be); `rank1`
 * is the engine's own best line at `before`, for `ply`'s own mover. A
 * move that falls MISS_THRESHOLD_CP short of that best line, right after
 * the opponent's own mistake, is a miss — takes priority over
 * classifyMoveQuality's own tier when both apply (see callers).
 */
export function detectMiss(
  ply: Ply,
  before: PositionAnalysis,
  after: PositionAnalysis,
  previousPly: Ply | undefined,
  previousSwing: number | undefined,
): boolean {
  if (!previousPly || previousSwing === undefined) return false;
  const previousQuality = classifyMoveQuality(previousPly, previousSwing);
  if (previousQuality !== "blunder" && previousQuality !== "mistake") return false;

  const mover = ply.side;
  const rank1 = before.multipv.find((line) => line.rank === 1);
  if (!rank1) return false;

  const rank1Value = moverComparableValue(rank1.score, mover);
  const actualValue = moverComparableValue(after.score, mover);
  return rank1Value - actualValue >= MISS_THRESHOLD_CP;
}

/**
 * White's win% (0-100), reusing evaluationBarFraction's own saturating
 * curve rather than inventing a second one — same shape lichess's own
 * accuracy formula assumes, just not lichess's exact constant.
 */
function winPercentForMover(score: EngineScore, mover: Side): number {
  const whiteWinPercent = evaluationBarFraction(score) * 100;
  return mover === "white" ? whiteWinPercent : 100 - whiteWinPercent;
}

/**
 * Lichess's own published accuracy-per-move formula: a win% curve fit,
 * not a linear centipawn-loss average, so accuracy degrades sharply once a
 * position starts slipping away and only gently in already-decided
 * positions (BLUEPRINT.md §36-style "don't overreact to depth-variance"
 * spirit — cp swings deep in a lost/won position shouldn't move the needle
 * much). A move that improves the mover's win% is never penalized.
 */
export function moveAccuracy(before: EngineScore, after: EngineScore, mover: Side): number {
  const drop = Math.max(0, winPercentForMover(before, mover) - winPercentForMover(after, mover));
  const accuracy = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.min(100, Math.max(0, accuracy));
}

export interface GameAccuracy {
  white?: number;
  black?: number;
}

/**
 * Per-player accuracy: the mean of moveAccuracy() over each side's own
 * moves. `analyses[i]`/`analyses[i+1]` must be the before/after analysis
 * of `game.plies[i]`, matching analyzeGame()'s plies.length+1 contract
 * (same as classifyMoveCategory's callers).
 */
export function gameAccuracy(game: ChessGame, analyses: PositionAnalysis[]): GameAccuracy {
  let whiteSum = 0;
  let whiteCount = 0;
  let blackSum = 0;
  let blackCount = 0;
  for (let i = 0; i < game.plies.length; i++) {
    const ply = game.plies[i]!;
    const accuracy = moveAccuracy(analyses[i]!.score, analyses[i + 1]!.score, ply.side);
    if (ply.side === "white") {
      whiteSum += accuracy;
      whiteCount += 1;
    } else {
      blackSum += accuracy;
      blackCount += 1;
    }
  }
  return {
    white: whiteCount > 0 ? whiteSum / whiteCount : undefined,
    black: blackCount > 0 ? blackSum / blackCount : undefined,
  };
}

/** "A. Rowan 94.2%   B. Voss 88.7%" — omits a side with no moves of its own (e.g. a FEN-started fragment). */
export function formatAccuracySummary(
  metadata: GameMetadata,
  accuracy: GameAccuracy,
): string | undefined {
  const parts: string[] = [];
  if (accuracy.white !== undefined) {
    parts.push(`${formatPlayer(metadata.white, undefined, "White")} ${accuracy.white.toFixed(1)}%`);
  }
  if (accuracy.black !== undefined) {
    parts.push(`${formatPlayer(metadata.black, undefined, "Black")} ${accuracy.black.toFixed(1)}%`);
  }
  return parts.length > 0 ? parts.join("   ") : undefined;
}
