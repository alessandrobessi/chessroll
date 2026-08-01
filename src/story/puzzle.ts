import { Chess } from "chess.js";
import { toMoveAnimation } from "../board/moves.js";
import { COLORS } from "../board/theme.js";
import { applyUciMove } from "../chess/game.js";
import type { Ply, Side } from "../chess/types.js";
import type { PositionAnalysis } from "../engine/analysis.js";
import { formatEvaluation } from "../engine/normalize.js";
import { createTimeline, phase } from "../scene/timeline.js";
import type { SceneDescriptor, SceneSegment, SceneTimeline } from "../scene/types.js";
import { StoryConstructionError } from "../utils/errors.js";
import type { PuzzleOptions } from "./types.js";

const INTRO_SECONDS = 1.0;
const PROMPT_SECONDS = 1.5;
const REVEAL_SECONDS = 1.0;
const MOVE_SECONDS = 1.5;
const CONTINUATION_BUDGET_SECONDS = 6.0;
const MIN_CONTINUATION_PLY_SECONDS = 1.0;
const PAYOFF_SECONDS = 3.0;

/** Best move plus up to 3 more plies of forced continuation. */
const MAX_ANIMATED_PLIES = 4;

/**
 * Replays the engine's PV through chess.js so illegal/malformed output can
 * never reach the timeline as if it were legal — the PV is a list of raw
 * UCI strings, not something to trust blindly.
 */
function replayContinuation(fen: string, pv: string[]): Ply[] {
  if (pv.length === 0) {
    throw new StoryConstructionError(`Engine produced an empty PV for FEN "${fen}"`);
  }
  const chess = new Chess(fen);
  const plyCount = Math.min(MAX_ANIMATED_PLIES, pv.length);
  const plies: Ply[] = [];
  for (let i = 0; i < plyCount; i++) {
    plies.push(applyUciMove(chess, pv[i]!, i));
  }
  return plies;
}

/**
 * Builds the 6-phase puzzle timeline (BLUEPRINT.md §15):
 * INTRO -> PROMPT -> SOLVE -> REVEAL -> MOVE -> CONTINUATION -> PAYOFF.
 *
 * Arrows/highlights/evaluation are structurally absent from every segment
 * before REVEAL — there is no code path here that could populate them
 * earlier, so AGENTS.md's "do not reveal the answer through premature
 * highlighting" holds by construction, not by convention.
 */
export function buildPuzzleStory(
  fen: string,
  sideToMove: Side,
  analysis: PositionAnalysis,
  options: PuzzleOptions,
): SceneTimeline {
  const orientation = options.orientation ?? sideToMove;
  const continuation = replayContinuation(fen, analysis.pv);
  const bestPly = continuation[0]!;
  const extraPlies = continuation.slice(1);

  const segments: SceneSegment[] = [];
  let t = 0;

  const push = (length: number, state: SceneDescriptor): void => {
    segments.push(phase(t, length, state));
    t += length;
  };

  // INTRO — position only, no arrows/eval.
  push(INTRO_SECONDS, { position: { fen, orientation } });

  // PROMPT
  push(PROMPT_SECONDS, {
    position: { fen, orientation },
    title: { text: "FIND THE BEST MOVE" },
    subtitle: { text: `${sideToMove.toUpperCase()} TO MOVE` },
  });

  // SOLVE — one 1-second segment per countdown tick; arrows/highlights/eval
  // are simply never set on these descriptors.
  for (let remaining = options.countdownSeconds; remaining >= 1; remaining--) {
    push(1, { position: { fen, orientation }, countdown: { value: remaining } });
  }

  // REVEAL — highlight + arrow appear, no piece motion yet.
  const highlights: SceneDescriptor["highlights"] = [
    { square: bestPly.from, style: "origin" },
    { square: bestPly.to, style: "destination" },
  ];
  const arrows: SceneDescriptor["arrows"] = [
    { from: bestPly.from, to: bestPly.to, color: COLORS.accent, opacity: 0.9 },
  ];
  push(REVEAL_SECONDS, { position: { fen, orientation }, highlights, arrows });

  // MOVE — animate the best move; arrow/highlight remain visible.
  push(MOVE_SECONDS, {
    position: { fen: bestPly.fenBefore, orientation },
    moveAnimation: toMoveAnimation(bestPly, { start: t, end: t + MOVE_SECONDS }),
    highlights,
    arrows,
  });

  // CONTINUATION — one segment per remaining forced ply. Degrades to
  // nothing for a mate-in-1, where extraPlies is empty.
  if (extraPlies.length > 0) {
    const perPly = Math.max(
      MIN_CONTINUATION_PLY_SECONDS,
      CONTINUATION_BUDGET_SECONDS / extraPlies.length,
    );
    for (const ply of extraPlies) {
      push(perPly, {
        position: { fen: ply.fenBefore, orientation },
        moveAnimation: toMoveAnimation(ply, { start: t, end: t + perPly }),
        highlights: [{ square: ply.to, style: "destination" }],
      });
    }
  }

  // PAYOFF — final position holds, move label, evaluation only if opted in.
  const finalPly = continuation[continuation.length - 1]!;
  const payoff: SceneDescriptor = {
    position: { fen: finalPly.fenAfter, orientation },
    moveLabel: { text: finalPly.san, emphasis: true },
  };
  if (options.showEval) {
    payoff.evaluation = { display: formatEvaluation(analysis.score), perspective: "white" };
  }
  push(PAYOFF_SECONDS, payoff);

  return createTimeline(segments);
}
