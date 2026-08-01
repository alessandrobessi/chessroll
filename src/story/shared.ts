import type { GameMetadata, Ply } from "../chess/types.js";
import type { PositionAnalysis } from "../engine/analysis.js";
import { moverComparableValue } from "../engine/normalize.js";

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
/** "Critical move" — matches blunder's own severity threshold. */
const CRITICAL_THRESHOLD_CP = 300;

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
