import { toMoveAnimation } from "../board/moves.js";
import { cueForPly, type AudioCue } from "../audio/timeline.js";
import type { ChessGame, Ply, Side } from "../chess/types.js";
import type { PositionAnalysis } from "../engine/analysis.js";
import { evaluationBarFraction, formatEvaluation } from "../engine/normalize.js";
import { createTimeline, phase } from "../scene/timeline.js";
import type { SceneDescriptor, SceneSegment, SceneTimeline } from "../scene/types.js";
import {
  classifyMoveCategory,
  classifyMoveQuality,
  detectMiss,
  formatAccuracySummary,
  gameAccuracy,
  headerFor,
  moveNumberLabel,
  moveQualityGlyph,
  type MoveCategory,
} from "./shared.js";

const INTRO_SECONDS = 1.5;
const OUTRO_SECONDS = 3.0;

const QUIET_SECONDS = 0.35;
const CAPTURE_SECONDS = 0.5;
const CHECK_SECONDS = 0.6;
const SWING_SECONDS = 0.9;
const SWING_PAUSE_SECONDS = 0.6;
const CRITICAL_SECONDS = 1.2;
const CRITICAL_PAUSE_SECONDS = 1.0;

const MOVE_SECONDS_BY_CATEGORY: Record<MoveCategory, number> = {
  quiet: QUIET_SECONDS,
  capture: CAPTURE_SECONDS,
  check: CHECK_SECONDS,
  swing: SWING_SECONDS,
  critical: CRITICAL_SECONDS,
};

const PAUSE_SECONDS_BY_CATEGORY: Record<MoveCategory, number> = {
  quiet: 0,
  capture: 0,
  check: 0,
  swing: SWING_PAUSE_SECONDS,
  critical: CRITICAL_PAUSE_SECONDS,
};

export interface ReplayOptions {
  showEval: boolean;
  /** No single mover to default from (unlike puzzle/blunder/brilliant) — defaults to "white". */
  orientation?: Side;
  /** Draw file/rank labels in the board's outer margin. Default false. */
  coordinates?: boolean;
}

/**
 * Builds a full-game replay timeline (BLUEPRINT.md §19): intro (player
 * header) -> one segment per ply, importance-weighted, with a pause +
 * highlight + annotation for critical moments -> outro (final position +
 * result, only when the PGN actually records one). Unlike puzzle/blunder/
 * brilliant there's no single featured move — every ply in `game` is
 * rendered, in order, so `analyses` must cover the whole game
 * (`analyzeGame()`'s `plies.length + 1` contract).
 */
export function buildReplayStory(
  game: ChessGame,
  analyses: PositionAnalysis[],
  options: ReplayOptions,
): SceneTimeline {
  const orientation = options.orientation ?? "white";
  const header = headerFor(game.metadata);
  const headerText: SceneDescriptor["subtitle"] = header.subtitle
    ? { text: header.subtitle }
    : undefined;

  const segments: SceneSegment[] = [];
  const cues: AudioCue[] = [];
  let t = 0;
  const push = (length: number, state: SceneDescriptor): void => {
    segments.push(phase(t, length, state));
    t += length;
  };

  // INTRO — player header, starting position.
  push(INTRO_SECONDS, {
    position: { fen: game.initialFen, orientation },
    title: { text: header.title, compact: true },
    subtitle: headerText,
  });

  let previousPly: Ply | undefined;
  let previousSwing: number | undefined;

  for (let i = 0; i < game.plies.length; i++) {
    const ply = game.plies[i]!;
    const before = analyses[i]!;
    const after = analyses[i + 1]!;
    const { category, swing } = classifyMoveCategory(ply, before, after);
    const missed = detectMiss(ply, before, after, previousPly, previousSwing);
    const moveSeconds = MOVE_SECONDS_BY_CATEGORY[category];
    // A miss deserves its own pause even on an otherwise-quiet move — it's
    // the biggest story on the board regardless of the mover's own swing.
    const pauseSeconds = missed
      ? Math.max(PAUSE_SECONDS_BY_CATEGORY[category], CRITICAL_PAUSE_SECONDS)
      : PAUSE_SECONDS_BY_CATEGORY[category];
    const label = `${moveNumberLabel(ply)} ${ply.san}`;
    const evaluation: SceneDescriptor["evaluation"] = options.showEval
      ? {
          display: formatEvaluation(after.score),
          perspective: "white",
          barFraction: evaluationBarFraction(after.score),
        }
      : undefined;

    // THE MOVE — always the ordinary label; the annotation (if any)
    // appears in the pause below, once the swing is fully "landed".
    push(moveSeconds, {
      position: { fen: ply.fenBefore, orientation },
      moveAnimation: toMoveAnimation(ply, { start: t, end: t + moveSeconds }),
      title: { text: header.title, compact: true },
      subtitle: headerText,
      moveLabel: { text: label },
      evaluation,
    });
    cues.push({ time: t, type: cueForPly(ply) });

    if (pauseSeconds > 0) {
      const quality = missed ? "miss" : classifyMoveQuality(ply, swing);
      const glyph = quality ? moveQualityGlyph(quality) : "";
      push(pauseSeconds, {
        position: { fen: ply.fenAfter, orientation },
        title: { text: header.title, compact: true },
        subtitle: headerText,
        moveLabel: { text: `${label}${glyph}`, emphasis: quality !== undefined },
        evaluation,
        highlights: quality
          ? [
              { square: ply.from, style: quality },
              { square: ply.to, style: quality },
            ]
          : undefined,
        moveQualityBadge: quality ? { square: ply.to, tier: quality, glyph } : undefined,
      });
    }

    previousPly = ply;
    previousSwing = swing;
  }

  // OUTRO — final position holds; the result only if the PGN actually
  // recorded a decisive/drawn one (never invent a claim "*" doesn't support),
  // plus each player's own accuracy (always safe to reveal here — the whole
  // game has already played out by this point).
  const lastPly = game.plies[game.plies.length - 1];
  const finalFen = lastPly?.fenAfter ?? game.initialFen;
  const validResults = new Set(["1-0", "0-1", "1/2-1/2"]);
  const result = game.metadata.result;
  const accuracySummary = formatAccuracySummary(game.metadata, gameAccuracy(game, analyses));
  push(OUTRO_SECONDS, {
    position: { fen: finalFen, orientation },
    title: result && validResults.has(result) ? { text: result, emphasis: true } : undefined,
    subtitle: accuracySummary ? { text: accuracySummary } : undefined,
    moveLabel: lastPly ? { text: `${moveNumberLabel(lastPly)} ${lastPly.san}` } : undefined,
  });

  return createTimeline(segments, { showCoordinates: options.coordinates, audioCues: cues });
}
