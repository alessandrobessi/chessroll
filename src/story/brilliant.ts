import { Chess } from "chess.js";
import { toMoveAnimation } from "../board/moves.js";
import { COLORS } from "../board/theme.js";
import { cueForPly, type AudioCue } from "../audio/timeline.js";
import { applyUciMove } from "../chess/game.js";
import type { ChessGame, Ply, Side } from "../chess/types.js";
import type { PositionAnalysis } from "../engine/analysis.js";
import {
  evaluationBarFraction,
  formatEvaluation,
  moverComparableValue,
} from "../engine/normalize.js";
import { createTimeline, phase } from "../scene/timeline.js";
import type { SceneDescriptor, SceneSegment, SceneTimeline } from "../scene/types.js";
import { StoryConstructionError } from "../utils/errors.js";
import { isSacrifice } from "./shared.js";

const HOOK_SECONDS = 1.0;
const LEAD_IN_PLY_SECONDS = 0.4;
const PROMPT_SECONDS = 1.5;
const REVEAL_SECONDS = 1.0;
const MOVE_SECONDS = 1.5;
const CONTINUATION_BUDGET_SECONDS = 6.0;
const MIN_CONTINUATION_PLY_SECONDS = 1.0;
const PAYOFF_SECONDS = 3.0;
const DEFAULT_LEAD_IN_PLIES = 4;

/** Best move plus up to 3 more plies of forced continuation, same budget as puzzle. */
const MAX_ANIMATED_PLIES = 4;

const DEFAULT_MIN_GAP_CP = 150;
const DEFAULT_MIN_ADVANTAGE_CP = 150;
const DEFAULT_MAX_ALREADY_WINNING_CP = 500;
/** Slack for "the played move matched the engine's top line's value" (see detectBrilliantMoves). */
const TOP_MOVE_TOLERANCE_CP = 5;

export interface BrilliantCandidate {
  /** 0-based index into game.plies. */
  plyIndex: number;
  ply: Ply;
  beforeAnalysis: PositionAnalysis;
  afterAnalysis: PositionAnalysis;
  isSacrifice: boolean;
  /** Internal ranking scale only (see moverComparableValue) — never a display value. */
  severity: number;
}

export interface BrilliantDetectionOptions {
  /** How far ahead of the runner-up alternative the played move must be, in the "near-unique best move" sense. */
  minGapCp?: number;
  /** How good the resulting position must be for the mover. */
  minAdvantageCp?: number;
  /** Skip positions already this crushing before the move — not a meaningful turning point. */
  maxAlreadyWinningCp?: number;
}

/**
 * Scans every played move for a standout one (BLUEPRINT.md §22): it must
 * match the engine's own top choice at that position, the mover's
 * position must not already have been crushing, the result must be
 * clearly good for the mover, and it must be either a near-unique best
 * move (a big gap to the runner-up alternative) or a material sacrifice.
 * `analyses[i]` must be the analysis of the position before
 * `game.plies[i]`, with MultiPV >= 2 (analyzeGame()'s contract, plus the
 * MultiPV requirement this detector specifically needs to measure the gap
 * to the runner-up move).
 */
export function detectBrilliantMoves(
  game: ChessGame,
  analyses: PositionAnalysis[],
  options: BrilliantDetectionOptions = {},
): BrilliantCandidate[] {
  const minGapCp = options.minGapCp ?? DEFAULT_MIN_GAP_CP;
  const minAdvantageCp = options.minAdvantageCp ?? DEFAULT_MIN_ADVANTAGE_CP;
  const maxAlreadyWinningCp = options.maxAlreadyWinningCp ?? DEFAULT_MAX_ALREADY_WINNING_CP;

  const candidates: BrilliantCandidate[] = [];
  for (let i = 0; i < game.plies.length; i++) {
    const ply = game.plies[i]!;
    const before = analyses[i]!;
    const after = analyses[i + 1]!;
    const mover = ply.side;

    const rank1 = before.multipv.find((line) => line.rank === 1);
    if (!rank1) continue; // nothing to compare the played move against

    const beforeValue = moverComparableValue(before.score, mover);
    // Only cp scores get the "already crushing" exclusion. A mate score
    // doesn't mean "any move wins" the way a huge cp score does — it means
    // this precise move (often one of very few) delivers or maintains a
    // forced mate, which is exactly the kind of move this detector exists
    // to find, regardless of whether the position was already mate-scored
    // going in.
    if (before.score.type === "cp" && beforeValue >= maxAlreadyWinningCp) continue;

    const afterValue = moverComparableValue(after.score, mover);
    if (afterValue < minAdvantageCp) continue; // must be clearly good for the mover afterward

    // The played move must have achieved (at least) what the engine's own
    // top line promised for this position. This is deliberately a value
    // comparison, not a UCI move-string match against before.bestMove:
    // when two different moves are genuinely tied for best (e.g. two
    // different mate-in-N lines), Stockfish's choice of which one to
    // report as "bestmove" is not guaranteed stable across engine/hash
    // state, so a strict move-string match would make an otherwise
    // perfectly-played tied-best move flicker in and out of detection.
    const rank1Value = moverComparableValue(rank1.score, mover);
    if (afterValue < rank1Value - TOP_MOVE_TOLERANCE_CP) continue;

    const rank2 = before.multipv.find((line) => line.rank === 2);
    const gap = rank2 ? rank1Value - moverComparableValue(rank2.score, mover) : 0;

    const sacrifice = isSacrifice(ply);
    if (gap < minGapCp && !sacrifice) continue; // neither a near-unique move nor a sacrifice

    // Sacrifices are weighted extra: giving up material and still winning
    // is the more visually/narratively "brilliant" of the two triggers.
    const severity = gap + afterValue + (sacrifice ? 200 : 0);
    candidates.push({
      plyIndex: i,
      ply,
      beforeAnalysis: before,
      afterAnalysis: after,
      isSacrifice: sacrifice,
      severity,
    });
  }

  return candidates.sort((a, b) => b.severity - a.severity);
}

/**
 * Picks the move to feature: an explicit 1-based `moveOverride` wins
 * outright (built directly from the analyses at that ply, bypassing the
 * thresholds — the caller chose it deliberately), otherwise the single
 * most severe detected candidate.
 */
export function selectBrilliantMove(
  game: ChessGame,
  analyses: PositionAnalysis[],
  options: BrilliantDetectionOptions & { moveOverride?: number } = {},
): BrilliantCandidate {
  if (options.moveOverride !== undefined) {
    const plyIndex = options.moveOverride - 1;
    const ply = game.plies[plyIndex];
    if (!ply) {
      throw new StoryConstructionError(
        `--move ${options.moveOverride} is out of range for a ${game.plies.length}-ply game`,
      );
    }
    const before = analyses[plyIndex]!;
    const after = analyses[plyIndex + 1]!;
    return {
      plyIndex,
      ply,
      beforeAnalysis: before,
      afterAnalysis: after,
      isSacrifice: isSacrifice(ply),
      severity:
        moverComparableValue(before.score, ply.side) - moverComparableValue(after.score, ply.side),
    };
  }

  const candidates = detectBrilliantMoves(game, analyses, options);
  const best = candidates[0];
  if (!best) {
    throw new StoryConstructionError(
      "No standout move found in this game. Try --move <n> to force a specific ply, or loosen the detection thresholds.",
    );
  }
  return best;
}

export interface BrilliantOptions {
  countdownSeconds: number;
  showEval: boolean;
  orientation?: Side;
  leadInPlies?: number;
  /** Draw file/rank labels inside the board's own edge squares (lichess/chess.com convention). Default false. */
  coordinates?: boolean;
}

/**
 * Replays the engine's PV from the position right after the standout move,
 * through chess.js, so illegal/malformed output can never reach the
 * timeline as if it were legal.
 */
function replayContinuation(afterFen: string, pv: string[]): Ply[] {
  if (pv.length === 0) return [];
  const chess = new Chess(afterFen);
  const plyCount = Math.min(MAX_ANIMATED_PLIES, pv.length);
  const plies: Ply[] = [];
  for (let i = 0; i < plyCount; i++) {
    plies.push(applyUciMove(chess, pv[i]!, i));
  }
  return plies;
}

/**
 * Builds the brilliant-move timeline: hook -> quick lead-in -> freeze on
 * the position right before the standout move -> prompt ("find the best
 * move?") -> countdown -> reveal (highlight + arrow) -> the move animates
 * -> a short forcing continuation proving the point -> payoff. Shaped
 * like puzzle.ts's timeline (the position is frozen and the question is
 * answerable before anything happens — unlike blunder, there is no
 * "you can't ask before it happens" problem here), with blunder.ts's
 * PGN lead-in grafted on.
 */
export function buildBrilliantStory(
  game: ChessGame,
  candidate: BrilliantCandidate,
  options: BrilliantOptions,
): SceneTimeline {
  const orientation = options.orientation ?? candidate.ply.side;
  const leadInPlies = options.leadInPlies ?? DEFAULT_LEAD_IN_PLIES;
  const leadInStart = Math.max(0, candidate.plyIndex - leadInPlies);
  const leadIn = game.plies.slice(leadInStart, candidate.plyIndex);
  const leadInStartFen =
    leadInStart === 0 ? game.initialFen : game.plies[leadInStart - 1]!.fenAfter;

  const continuation = replayContinuation(candidate.ply.fenAfter, candidate.afterAnalysis.pv);

  const segments: SceneSegment[] = [];
  const cues: AudioCue[] = [];
  let t = 0;
  const push = (length: number, state: SceneDescriptor): void => {
    segments.push(phase(t, length, state));
    t += length;
  };

  // HOOK
  push(HOOK_SECONDS, {
    position: { fen: leadInStartFen, orientation },
    title: { text: "FIND THE BRILLIANT MOVE" },
  });

  // LEAD-IN — quick, no commentary.
  for (const ply of leadIn) {
    push(LEAD_IN_PLY_SECONDS, {
      position: { fen: ply.fenBefore, orientation },
      moveAnimation: toMoveAnimation(ply, { start: t, end: t + LEAD_IN_PLY_SECONDS }),
    });
    cues.push({ time: t, type: cueForPly(ply) });
  }

  // PROMPT — freeze on the position before the move; side-to-move subtitle.
  push(PROMPT_SECONDS, {
    position: { fen: candidate.ply.fenBefore, orientation },
    subtitle: { text: `${candidate.ply.side.toUpperCase()} TO MOVE` },
  });

  // COUNTDOWN — structurally no arrows/highlights/eval, same guarantee as puzzle.
  for (let remaining = options.countdownSeconds; remaining >= 1; remaining--) {
    cues.push({ time: t, type: "countdown-tick" });
    push(1, {
      position: { fen: candidate.ply.fenBefore, orientation },
      subtitle: { text: `${candidate.ply.side.toUpperCase()} TO MOVE` },
      countdown: { value: remaining },
    });
  }

  // REVEAL — highlight + arrow, no motion yet.
  const highlights: SceneDescriptor["highlights"] = [
    { square: candidate.ply.from, style: "origin" },
    { square: candidate.ply.to, style: "destination" },
  ];
  const arrows: SceneDescriptor["arrows"] = [
    { from: candidate.ply.from, to: candidate.ply.to, color: COLORS.accent, opacity: 0.9 },
  ];
  cues.push({ time: t, type: "reveal" });
  push(REVEAL_SECONDS, {
    position: { fen: candidate.ply.fenBefore, orientation },
    highlights,
    arrows,
  });

  // MOVE — the standout move animates; arrow/highlight remain visible.
  push(MOVE_SECONDS, {
    position: { fen: candidate.ply.fenBefore, orientation },
    moveAnimation: toMoveAnimation(candidate.ply, { start: t, end: t + MOVE_SECONDS }),
    highlights,
    arrows,
  });
  cues.push({ time: t, type: cueForPly(candidate.ply) });

  // CONTINUATION — a short forced sequence proving the point.
  if (continuation.length > 0) {
    const perPly = Math.max(
      MIN_CONTINUATION_PLY_SECONDS,
      CONTINUATION_BUDGET_SECONDS / continuation.length,
    );
    for (const ply of continuation) {
      push(perPly, {
        position: { fen: ply.fenBefore, orientation },
        moveAnimation: toMoveAnimation(ply, { start: t, end: t + perPly }),
        highlights: [{ square: ply.to, style: "destination" }],
      });
      cues.push({ time: t, type: cueForPly(ply) });
    }
  }

  // PAYOFF — final position holds. Standard chess annotation convention
  // (not any platform's badge/classification): "!!" for a sacrifice,
  // "!" for a strong near-unique move.
  const finalPosition =
    continuation.length > 0
      ? continuation[continuation.length - 1]!.fenAfter
      : candidate.ply.fenAfter;
  const annotation = candidate.isSacrifice ? "!!" : "!";
  const payoff: SceneDescriptor = {
    position: { fen: finalPosition, orientation },
    moveLabel: { text: `${candidate.ply.san}${annotation}`, emphasis: true },
  };
  if (options.showEval) {
    payoff.evaluation = {
      display: formatEvaluation(candidate.afterAnalysis.score),
      perspective: "white",
      barFraction: evaluationBarFraction(candidate.afterAnalysis.score),
    };
  }
  push(PAYOFF_SECONDS, payoff);

  return createTimeline(segments, { showCoordinates: options.coordinates, audioCues: cues });
}
