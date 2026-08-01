import { Chess } from "chess.js";
import { toMoveAnimation } from "../board/moves.js";
import { cueForPly, type AudioCue } from "../audio/timeline.js";
import { applyUciMove } from "../chess/game.js";
import type { ChessGame, Ply, Side } from "../chess/types.js";
import type { PositionAnalysis } from "../engine/analysis.js";
import { formatEvaluation, moverComparableValue } from "../engine/normalize.js";
import { createTimeline, phase } from "../scene/timeline.js";
import type {
  HighlightElement,
  SceneDescriptor,
  SceneSegment,
  SceneTimeline,
} from "../scene/types.js";
import { StoryConstructionError } from "../utils/errors.js";

const HOOK_SECONDS = 1.0;
const LEAD_IN_PLY_SECONDS = 0.4;
const BLUNDER_PLAY_SECONDS = 1.2;
const FREEZE_SECONDS = 1.0;
const SWING_SECONDS = 1.5;
const PUNISHMENT_SECONDS = 1.2;
const PAYOFF_SECONDS = 3.0;
const DEFAULT_LEAD_IN_PLIES = 4;

const DEFAULT_MIN_LOSS_CP = 300;
const DEFAULT_MAX_ALREADY_LOST_CP = 700;

export interface BlunderCandidate {
  /** 0-based index into game.plies. */
  plyIndex: number;
  ply: Ply;
  beforeAnalysis: PositionAnalysis;
  afterAnalysis: PositionAnalysis;
  /** Internal ranking scale only (see MATE_COMPARABLE_MAGNITUDE) — never a display value. */
  severity: number;
}

export interface BlunderDetectionOptions {
  minLossCp?: number;
  maxAlreadyLostCp?: number;
}

/**
 * Scans every played move for a severe, understandable mistake
 * (BLUEPRINT.md §17): a large swing in the mover's own favor-adjusted
 * evaluation, skipping moves where the mover's position was already
 * essentially lost (a further loss there isn't an interesting "blunder").
 * `analyses[i]` must be the analysis of the position before `game.plies[i]`
 * (analyzeGame()'s contract).
 */
export function detectBlunders(
  game: ChessGame,
  analyses: PositionAnalysis[],
  options: BlunderDetectionOptions = {},
): BlunderCandidate[] {
  const minLossCp = options.minLossCp ?? DEFAULT_MIN_LOSS_CP;
  const maxAlreadyLostCp = options.maxAlreadyLostCp ?? DEFAULT_MAX_ALREADY_LOST_CP;

  const candidates: BlunderCandidate[] = [];
  for (let i = 0; i < game.plies.length; i++) {
    const ply = game.plies[i]!;
    const before = analyses[i]!;
    const after = analyses[i + 1]!;
    const mover = ply.side;

    const beforeValue = moverComparableValue(before.score, mover);
    if (beforeValue < -maxAlreadyLostCp) continue; // already essentially lost

    const afterValue = moverComparableValue(after.score, mover);
    const severity = beforeValue - afterValue;
    if (severity < minLossCp) continue;

    candidates.push({ plyIndex: i, ply, beforeAnalysis: before, afterAnalysis: after, severity });
  }

  return candidates.sort((a, b) => b.severity - a.severity);
}

/**
 * Picks the blunder to feature: an explicit 1-based `moveOverride` wins
 * outright (built directly from the analyses at that ply, bypassing the
 * severity thresholds — the caller chose it deliberately), otherwise the
 * single most severe detected candidate.
 */
export function selectBlunder(
  game: ChessGame,
  analyses: PositionAnalysis[],
  options: BlunderDetectionOptions & { moveOverride?: number } = {},
): BlunderCandidate {
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
    const severity =
      moverComparableValue(before.score, ply.side) - moverComparableValue(after.score, ply.side);
    return { plyIndex, ply, beforeAnalysis: before, afterAnalysis: after, severity };
  }

  const candidates = detectBlunders(game, analyses, options);
  const best = candidates[0];
  if (!best) {
    throw new StoryConstructionError(
      "No qualifying blunder found in this game. Try --move <n> to force a specific ply, or loosen the detection thresholds.",
    );
  }
  return best;
}

export interface BlunderOptions {
  countdownSeconds: number;
  showEval: boolean;
  orientation?: Side;
  leadInPlies?: number;
  /** Draw file/rank labels in the board's outer margin. Default false. */
  coordinates?: boolean;
}

function replayTopPvMove(fen: string, pv: string[]): Ply {
  const move = pv[0];
  if (!move) {
    throw new StoryConstructionError(`No PV move available to build the punishment from "${fen}"`);
  }
  return applyUciMove(new Chess(fen), move, 0);
}

/**
 * Builds the blunder timeline: hook -> quick lead-in -> the blunder move
 * itself plays, presented like any other move (no flag, no emphasis) ->
 * freeze on the resulting position -> "spot the mistake?" -> countdown ->
 * reveal (the blunder's squares highlighted + evaluation swing) ->
 * punishment -> payoff.
 *
 * This deliberately departs from a literal reading of BLUEPRINT.md §18's
 * phase list ("freeze before blunder" / "blunder animation" as two
 * separate later steps) — asking "can you spot the mistake?" before the
 * mistake has even been played leaves nothing for the viewer to spot. The
 * blunder has to be visible on screen before the question is asked.
 */
export function buildBlunderStory(
  game: ChessGame,
  candidate: BlunderCandidate,
  options: BlunderOptions,
): SceneTimeline {
  const orientation = options.orientation ?? candidate.ply.side;
  const leadInPlies = options.leadInPlies ?? DEFAULT_LEAD_IN_PLIES;
  const leadInStart = Math.max(0, candidate.plyIndex - leadInPlies);
  const leadIn = game.plies.slice(leadInStart, candidate.plyIndex);
  const leadInStartFen =
    leadInStart === 0 ? game.initialFen : game.plies[leadInStart - 1]!.fenAfter;

  const punishment = replayTopPvMove(candidate.ply.fenAfter, candidate.afterAnalysis.pv);
  const swingEvaluation = options.showEval
    ? { display: formatEvaluation(candidate.afterAnalysis.score), perspective: "white" as const }
    : undefined;

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
    title: { text: "ONE MOVE THROWS IT AWAY" },
  });

  // LEAD-IN — quick, no commentary.
  for (const ply of leadIn) {
    push(LEAD_IN_PLY_SECONDS, {
      position: { fen: ply.fenBefore, orientation },
      moveAnimation: toMoveAnimation(ply, { start: t, end: t + LEAD_IN_PLY_SECONDS }),
    });
    cues.push({ time: t, type: cueForPly(ply) });
  }

  // THE BLUNDER PLAYS — an ordinary-looking move, no highlight, no eval.
  // The viewer watches it happen without knowing yet that it's a mistake.
  // Its sound is equally ordinary — cueForPly, not a special "wrong move"
  // sting — matching the visual "no flag, no emphasis" design above.
  push(BLUNDER_PLAY_SECONDS, {
    position: { fen: candidate.ply.fenBefore, orientation },
    moveAnimation: toMoveAnimation(candidate.ply, { start: t, end: t + BLUNDER_PLAY_SECONDS }),
  });
  cues.push({ time: t, type: cueForPly(candidate.ply) });

  // FREEZE — the resulting position holds; now ask the question.
  push(FREEZE_SECONDS, {
    position: { fen: candidate.ply.fenAfter, orientation },
    subtitle: { text: "CAN YOU SPOT THE MISTAKE?" },
  });

  // COUNTDOWN — structurally no arrows/highlights/eval, same guarantee as puzzle.
  for (let remaining = options.countdownSeconds; remaining >= 1; remaining--) {
    cues.push({ time: t, type: "countdown-tick" });
    push(1, {
      position: { fen: candidate.ply.fenAfter, orientation },
      countdown: { value: remaining },
    });
  }

  // REVEAL — highlight exactly which move it was, evaluation swing dramatized.
  const revealHighlights: HighlightElement[] = [
    { square: candidate.ply.from, style: "origin" },
    { square: candidate.ply.to, style: "critical" },
  ];
  cues.push({ time: t, type: "reveal" });
  push(SWING_SECONDS, {
    position: { fen: candidate.ply.fenAfter, orientation },
    highlights: revealHighlights,
    prompt: { text: "THE EVALUATION SWINGS", emphasis: true },
    evaluation: swingEvaluation,
  });

  // PUNISHMENT — the engine's actual best response, replayed through chess.js.
  push(PUNISHMENT_SECONDS, {
    position: { fen: punishment.fenBefore, orientation },
    moveAnimation: toMoveAnimation(punishment, { start: t, end: t + PUNISHMENT_SECONDS }),
    evaluation: swingEvaluation,
  });
  cues.push({ time: t, type: cueForPly(punishment) });

  // PAYOFF
  push(PAYOFF_SECONDS, {
    position: { fen: punishment.fenAfter, orientation },
    moveLabel: { text: punishment.san, emphasis: true },
    evaluation: swingEvaluation,
  });

  return createTimeline(segments, { showCoordinates: options.coordinates, audioCues: cues });
}
