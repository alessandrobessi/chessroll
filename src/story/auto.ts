import type { ChessGame, Ply } from "../chess/types.js";
import type { PositionAnalysis } from "../engine/analysis.js";
import { detectBlunders, type BlunderCandidate } from "./blunder.js";
import { detectBrilliantMoves, type BrilliantCandidate } from "./brilliant.js";
import { classifyMoveCategory, classifyMoveQuality, moveNumberLabel } from "./shared.js";

/** A significant position not already covered by a blunder/brilliant video, turned into a "find the best move" puzzle. */
export interface PuzzleMoment {
  /** 0-based index into game.plies — the move that follows this position. */
  plyIndex: number;
  ply: Ply;
  /** Analysis of the position BEFORE `ply` — what buildPuzzleStory needs. */
  analysis: PositionAnalysis;
}

export interface AutoPlan {
  blunders: BlunderCandidate[];
  brilliants: BrilliantCandidate[];
  puzzles: PuzzleMoment[];
}

export interface AutoPlanOptions {
  /** Caps each category independently, so one chaotic game can't silently produce dozens of videos. */
  maxPerCategory?: number;
}

const DEFAULT_MAX_PER_CATEGORY = 3;

/**
 * Plans every video --template auto should produce from a single game: a
 * blunder video per detected blunder, a brilliant video per detected
 * standout move, and a puzzle video for every other significant moment
 * (any ply classifyMoveQuality tags, per replay/game60's own per-move
 * annotation logic) that isn't already covered by a blunder/brilliant
 * candidate — avoiding a near-duplicate "what's the best move here?"
 * puzzle for a moment that already has its own dedicated video. The
 * caller is responsible for the always-included full-game replay.
 *
 * `analyses[i]` must be the analysis of the position before
 * `game.plies[i]` (analyzeGame()'s plies.length+1 contract), with
 * MultiPV >= 2 (detectBrilliantMoves' own requirement).
 */
export function planAutoStories(
  game: ChessGame,
  analyses: PositionAnalysis[],
  options: AutoPlanOptions = {},
): AutoPlan {
  const maxPerCategory = options.maxPerCategory ?? DEFAULT_MAX_PER_CATEGORY;

  const blunders = detectBlunders(game, analyses).slice(0, maxPerCategory);
  const brilliants = detectBrilliantMoves(game, analyses).slice(0, maxPerCategory);

  const covered = new Set<number>([
    ...blunders.map((candidate) => candidate.plyIndex),
    ...brilliants.map((candidate) => candidate.plyIndex),
  ]);

  const puzzleCandidates: { plyIndex: number; ply: Ply; magnitude: number }[] = [];
  for (let i = 0; i < game.plies.length; i++) {
    if (covered.has(i)) continue;
    const ply = game.plies[i]!;
    const { swing } = classifyMoveCategory(ply, analyses[i]!, analyses[i + 1]!);
    if (classifyMoveQuality(ply, swing) === undefined) continue;
    puzzleCandidates.push({ plyIndex: i, ply, magnitude: Math.abs(swing) });
  }
  puzzleCandidates.sort((a, b) => b.magnitude - a.magnitude);

  const puzzles: PuzzleMoment[] = puzzleCandidates
    .slice(0, maxPerCategory)
    .map(({ plyIndex, ply }) => ({
      plyIndex,
      ply,
      analysis: analyses[plyIndex]!,
    }));

  return { blunders, brilliants, puzzles };
}

/** "14. Qxb6" -> "14-Qxb6", "22... Rxd8" -> "22-Rxd8" — a filesystem-safe, meaningful basename for one ply. */
export function slugForPly(ply: Ply): string {
  const slug = `${moveNumberLabel(ply)}-${ply.san}`.replace(/[^a-zA-Z0-9]+/g, "-");
  return slug.replace(/^-+|-+$/g, "");
}
