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
import { classifyMoveCategory, formatPlayer } from "./shared.js";

const HOOK_SECONDS = 1.0;
const LEAD_IN_PLY_SECONDS = 0.4;
const FREEZE_SECONDS = 1.0;
const YOU_ARE_SECONDS = 1.5;
const PROMPT_SECONDS = 1.5;
const REVEAL_SECONDS = 1.0;
const MOVE_SECONDS = 1.5;
const COMPARISON_SECONDS = 2.5;
const CONTINUATION_BUDGET_SECONDS = 6.0;
const MIN_CONTINUATION_PLY_SECONDS = 1.0;
const PAYOFF_SECONDS = 3.0;
const DEFAULT_LEAD_IN_PLIES = 4;
/** Real game plies, so unlike puzzle/brilliant this is never a forced/only line. */
const MAX_CONTINUATION_PLIES = 4;
/** Slack for "the played move matched the engine's top line's value" — same reasoning as brilliant's tie tolerance. */
const TOP_MOVE_TOLERANCE_CP = 5;

export interface GuessCandidate {
  /** 0-based index into game.plies. */
  plyIndex: number;
  ply: Ply;
  beforeAnalysis: PositionAnalysis;
  afterAnalysis: PositionAnalysis;
}

export interface GuessDetectionOptions {
  moveOverride?: number;
}

/**
 * Picks the move to guess: an explicit 1-based `moveOverride` wins outright
 * (BLUEPRINT.md §21's "input PGN + selected move"), otherwise the single
 * most decisive moment in the game — largest mover-relative |swing|, via
 * the same classification blunder/replay/game60 already share. Unlike
 * those templates, there's no minimum-severity threshold and this never
 * throws for lack of a "qualifying" candidate: every ply is a fair
 * "what would you have played?" prompt, not just an extreme one, and
 * resolvePgnGame() already guarantees at least one ply exists.
 */
export function selectGuessMove(
  game: ChessGame,
  analyses: PositionAnalysis[],
  options: GuessDetectionOptions = {},
): GuessCandidate {
  if (options.moveOverride !== undefined) {
    const plyIndex = options.moveOverride - 1;
    const ply = game.plies[plyIndex];
    if (!ply) {
      throw new StoryConstructionError(
        `--move ${options.moveOverride} is out of range for a ${game.plies.length}-ply game`,
      );
    }
    return {
      plyIndex,
      ply,
      beforeAnalysis: analyses[plyIndex]!,
      afterAnalysis: analyses[plyIndex + 1]!,
    };
  }

  let best: GuessCandidate | undefined;
  let bestMagnitude = -Infinity;
  for (let i = 0; i < game.plies.length; i++) {
    const ply = game.plies[i]!;
    const before = analyses[i]!;
    const after = analyses[i + 1]!;
    const { swing } = classifyMoveCategory(ply, before, after);
    const magnitude = Math.abs(swing);
    if (magnitude > bestMagnitude) {
      bestMagnitude = magnitude;
      best = { plyIndex: i, ply, beforeAnalysis: before, afterAnalysis: after };
    }
  }
  return best!;
}

export interface GuessOptions {
  countdownSeconds: number;
  showEval: boolean;
  /** Defaults to the guessed move's own mover — "You are White/Black" already tells you which. */
  orientation?: Side;
  leadInPlies?: number;
  /** Draw file/rank labels in the board's outer margin. Default false. */
  coordinates?: boolean;
}

function replayUciMove(fen: string, uci: string): Ply {
  return applyUciMove(new Chess(fen), uci, 0);
}

/**
 * Builds the guess-the-move timeline (BLUEPRINT.md §21): hook -> quick
 * lead-in -> freeze -> "You are [player]" -> "what do you play?" ->
 * countdown -> reveal -> the actual move animates -> an honest engine
 * comparison ("matches Stockfish's top choice" or "Stockfish preferred X
 * instead" — never implying the historical move was objectively best
 * unless the engine actually agrees) -> a short continuation of what
 * really happened next -> payoff.
 */
export function buildGuessStory(
  game: ChessGame,
  analyses: PositionAnalysis[],
  candidate: GuessCandidate,
  options: GuessOptions,
): SceneTimeline {
  const orientation = options.orientation ?? candidate.ply.side;
  const leadInPlies = options.leadInPlies ?? DEFAULT_LEAD_IN_PLIES;
  const leadInStart = Math.max(0, candidate.plyIndex - leadInPlies);
  const leadIn = game.plies.slice(leadInStart, candidate.plyIndex);
  const leadInStartFen =
    leadInStart === 0 ? game.initialFen : game.plies[leadInStart - 1]!.fenAfter;

  const mover = candidate.ply.side;
  const playerLabel =
    mover === "white"
      ? formatPlayer(game.metadata.white, game.metadata.whiteElo, "White")
      : formatPlayer(game.metadata.black, game.metadata.blackElo, "Black");

  const rank1 = candidate.beforeAnalysis.multipv.find((line) => line.rank === 1);
  const playedValue = moverComparableValue(candidate.afterAnalysis.score, mover);
  const matchesTopChoice =
    rank1 !== undefined &&
    playedValue >= moverComparableValue(rank1.score, mover) - TOP_MOVE_TOLERANCE_CP;
  const engineChoice =
    !matchesTopChoice && rank1
      ? replayUciMove(candidate.ply.fenBefore, rank1.moves[0]!)
      : undefined;
  const comparisonText = matchesTopChoice
    ? "Matches Stockfish's top choice"
    : engineChoice
      ? `Stockfish preferred ${engineChoice.san} instead`
      : "No engine comparison available";

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
    title: { text: "CAN YOU GUESS THE MOVE?" },
  });

  // LEAD-IN — quick, no commentary.
  for (const ply of leadIn) {
    push(LEAD_IN_PLY_SECONDS, {
      position: { fen: ply.fenBefore, orientation },
      moveAnimation: toMoveAnimation(ply, { start: t, end: t + LEAD_IN_PLY_SECONDS }),
    });
    cues.push({ time: t, type: cueForPly(ply) });
  }

  // FREEZE — the position holds before any question appears.
  push(FREEZE_SECONDS, {
    position: { fen: candidate.ply.fenBefore, orientation },
  });

  // "YOU ARE [PLAYER]" — personalizes the prompt to the actual mover.
  push(YOU_ARE_SECONDS, {
    position: { fen: candidate.ply.fenBefore, orientation },
    title: { text: `YOU ARE ${playerLabel.toUpperCase()}` },
  });

  // "WHAT DO YOU PLAY?"
  push(PROMPT_SECONDS, {
    position: { fen: candidate.ply.fenBefore, orientation },
    subtitle: { text: "WHAT DO YOU PLAY?" },
  });

  // COUNTDOWN — structurally no arrows/highlights/eval, same guarantee as puzzle.
  for (let remaining = options.countdownSeconds; remaining >= 1; remaining--) {
    cues.push({ time: t, type: "countdown-tick" });
    push(1, {
      position: { fen: candidate.ply.fenBefore, orientation },
      subtitle: { text: "WHAT DO YOU PLAY?" },
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

  // MOVE — the actual played move animates.
  push(MOVE_SECONDS, {
    position: { fen: candidate.ply.fenBefore, orientation },
    moveAnimation: toMoveAnimation(candidate.ply, { start: t, end: t + MOVE_SECONDS }),
    highlights,
    arrows,
    moveLabel: { text: candidate.ply.san },
  });
  cues.push({ time: t, type: cueForPly(candidate.ply) });

  // ENGINE COMPARISON — honest either way; never claims the move was best
  // unless Stockfish's own top line actually agrees (BLUEPRINT.md §21).
  const comparisonEvaluation: SceneDescriptor["evaluation"] = options.showEval
    ? {
        display: formatEvaluation(candidate.afterAnalysis.score),
        perspective: "white",
        barFraction: evaluationBarFraction(candidate.afterAnalysis.score),
      }
    : undefined;
  push(COMPARISON_SECONDS, {
    position: { fen: candidate.ply.fenAfter, orientation },
    prompt: { text: comparisonText.toUpperCase(), emphasis: matchesTopChoice },
    moveLabel: { text: candidate.ply.san },
    evaluation: comparisonEvaluation,
  });

  // CONTINUATION — the real game's own next moves (already-legal Ply
  // objects from the loaded PGN, not an engine PV replay).
  const continuation = game.plies.slice(
    candidate.plyIndex + 1,
    candidate.plyIndex + 1 + MAX_CONTINUATION_PLIES,
  );
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

  // PAYOFF — final position holds. Evaluation here reflects the position
  // after the real continuation actually played out, not just the guessed
  // move's own immediate eval (already shown at the comparison phase).
  const finalPly = continuation.length > 0 ? continuation[continuation.length - 1]! : candidate.ply;
  const finalAnalysis = analyses[candidate.plyIndex + 1 + continuation.length]!;
  const payoff: SceneDescriptor = {
    position: { fen: finalPly.fenAfter, orientation },
    moveLabel: { text: finalPly.san, emphasis: true },
  };
  if (options.showEval) {
    payoff.evaluation = {
      display: formatEvaluation(finalAnalysis.score),
      perspective: "white",
      barFraction: evaluationBarFraction(finalAnalysis.score),
    };
  }
  push(PAYOFF_SECONDS, payoff);

  return createTimeline(segments, { showCoordinates: options.coordinates, audioCues: cues });
}
