import { toMoveAnimation } from "../board/moves.js";
import { cueForPly, type AudioCue } from "../audio/timeline.js";
import type { ChessGame, Side } from "../chess/types.js";
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
/** Shorter than replay's 1.0s pause — game60 is the punchier, faster-paced format. */
const CRITICAL_PAUSE_SECONDS = 0.8;
/** Never compress a move to literal invisibility — ~2-3 frames at 30fps. */
const MIN_MOVE_SECONDS = 0.08;

/**
 * Relative pacing weights, reusing replay's own fixed seconds verbatim
 * (BLUEPRINT.md §19) — they already encode the right proportions between
 * categories, no need to invent new numbers. Unlike replay, these are a
 * *base* to be uniformly scaled down by the move-time budget below, not
 * the actual on-screen duration.
 */
const BASE_SECONDS_BY_CATEGORY: Record<MoveCategory, number> = {
  quiet: 0.35,
  capture: 0.5,
  check: 0.6,
  swing: 0.9,
  critical: 1.2,
};

export interface Game60Options {
  /** Approximate total video length in seconds — a target, not a hard cap (BLUEPRINT.md §20). */
  targetSeconds: number;
  showEval: boolean;
  /** No single mover to default from (unlike puzzle/blunder/brilliant) — defaults to "white". */
  orientation?: Side;
  /** Draw file/rank labels in the board's outer margin. Default false. */
  coordinates?: boolean;
}

interface PlyPlan {
  category: MoveCategory;
  swing: number;
  missed: boolean;
  moveSeconds: number;
}

/**
 * BLUEPRINT.md §20's move-time budget: reserve time for intro, one pause
 * per critical move (or per missed opportunity — see detectMiss, which
 * gets the same dedicated-pause treatment critical moves do, regardless
 * of its own category), and the outro; whatever's left is the budget for
 * every move's own animation, distributed proportionally to replay's
 * relative category weights and uniformly scaled down to fit.
 *
 * `scale` is capped at 1 — game60 only ever *compresses* relative to
 * replay's natural pace, never pads a short game out to artificially fill
 * the target (a short game finishing well under the target is an honest
 * outcome, not a bug: "do not make every move too fast merely to satisfy
 * exactly 60.000 seconds" cuts both ways). When even the compressed floor
 * (`MIN_MOVE_SECONDS` per move) doesn't fit, the floor wins and the video
 * simply runs a bit over target — "a sensible configurable target window,"
 * not a hard cap.
 */
function planMoves(
  game: ChessGame,
  analyses: PositionAnalysis[],
  targetSeconds: number,
): PlyPlan[] {
  const classifications = game.plies.map((ply, i) =>
    classifyMoveCategory(ply, analyses[i]!, analyses[i + 1]!),
  );
  const misses = game.plies.map((ply, i) =>
    detectMiss(
      ply,
      analyses[i]!,
      analyses[i + 1]!,
      i > 0 ? game.plies[i - 1] : undefined,
      i > 0 ? classifications[i - 1]!.swing : undefined,
    ),
  );

  const pauseCount = classifications.filter(
    (c, i) => c.category === "critical" || misses[i],
  ).length;
  const reserved = INTRO_SECONDS + OUTRO_SECONDS + pauseCount * CRITICAL_PAUSE_SECONDS;
  const baseSum = classifications.reduce((sum, c) => sum + BASE_SECONDS_BY_CATEGORY[c.category], 0);
  const floorSum = MIN_MOVE_SECONDS * classifications.length;
  const moveBudget = Math.max(floorSum, targetSeconds - reserved);
  const scale = baseSum > 0 ? Math.min(1, moveBudget / baseSum) : 1;

  return classifications.map(({ category, swing }, i) => ({
    category,
    swing,
    missed: misses[i]!,
    moveSeconds: Math.max(MIN_MOVE_SECONDS, BASE_SECONDS_BY_CATEGORY[category] * scale),
  }));
}

/**
 * Builds a duration-bounded full-game timeline (BLUEPRINT.md §20/
 * ROADMAP.md §14): intro (player header) -> one budget-scaled segment per
 * ply (only critical moments get a pause + highlight + `!!`/`??`
 * annotation — replay's "swing" pause is dropped here to keep pacing
 * tight) -> outro (final position + result, only when the PGN actually
 * records one). Shares its player-header/result policy and move
 * classification with replay (src/story/shared.ts) but reserves its own
 * duration mapping, since a bounded-duration budget is exactly where the
 * two templates differ.
 */
export function buildGame60Story(
  game: ChessGame,
  analyses: PositionAnalysis[],
  options: Game60Options,
): SceneTimeline {
  const orientation = options.orientation ?? "white";
  const header = headerFor(game.metadata);
  const headerText: SceneDescriptor["subtitle"] = header.subtitle
    ? { text: header.subtitle }
    : undefined;
  const plan = planMoves(game, analyses, options.targetSeconds);

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

  for (let i = 0; i < game.plies.length; i++) {
    const ply = game.plies[i]!;
    const after = analyses[i + 1]!;
    const { category, swing, missed, moveSeconds } = plan[i]!;
    const quality = missed ? "miss" : classifyMoveQuality(ply, swing);
    const label = `${moveNumberLabel(ply)} ${ply.san}`;
    const evaluation: SceneDescriptor["evaluation"] = options.showEval
      ? {
          display: formatEvaluation(after.score),
          perspective: "white",
          barFraction: evaluationBarFraction(after.score),
        }
      : undefined;

    // A "swing"-category tier (inaccuracy/great) has no pause of its own in
    // game60 (unlike replay) to keep pacing tight — it gets marked inline
    // on its own move segment instead, at no extra time cost. "critical"
    // tiers (blunder/brilliant) and a missed opportunity both keep their
    // own dedicated freeze pause below regardless of category.
    const isCriticalPause = category === "critical" || missed;
    const inlineQuality = quality && !isCriticalPause ? quality : undefined;
    const inlineGlyph = inlineQuality ? moveQualityGlyph(inlineQuality) : "";

    push(moveSeconds, {
      position: { fen: ply.fenBefore, orientation },
      moveAnimation: toMoveAnimation(ply, { start: t, end: t + moveSeconds }),
      title: { text: header.title, compact: true },
      subtitle: headerText,
      moveLabel: { text: `${label}${inlineGlyph}`, emphasis: inlineQuality !== undefined },
      evaluation,
      highlights: inlineQuality ? [{ square: ply.to, style: inlineQuality }] : undefined,
      moveQualityBadge: inlineQuality
        ? { square: ply.to, tier: inlineQuality, glyph: inlineGlyph }
        : undefined,
    });
    cues.push({ time: t, type: cueForPly(ply) });

    if (isCriticalPause) {
      const glyph = quality ? moveQualityGlyph(quality) : "";
      push(CRITICAL_PAUSE_SECONDS, {
        position: { fen: ply.fenAfter, orientation },
        title: { text: header.title, compact: true },
        subtitle: headerText,
        moveLabel: { text: `${label}${glyph}`, emphasis: true },
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
