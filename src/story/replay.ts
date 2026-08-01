import { toMoveAnimation } from "../board/moves.js";
import { cueForPly, type AudioCue } from "../audio/timeline.js";
import type { ChessGame, GameMetadata, Ply, Side } from "../chess/types.js";
import type { PositionAnalysis } from "../engine/analysis.js";
import { formatEvaluation, moverComparableValue } from "../engine/normalize.js";
import { createTimeline, phase } from "../scene/timeline.js";
import type { SceneDescriptor, SceneSegment, SceneTimeline } from "../scene/types.js";

const INTRO_SECONDS = 1.5;
const OUTRO_SECONDS = 3.0;

const QUIET_SECONDS = 0.35;
const CAPTURE_SECONDS = 0.5;
const CHECK_SECONDS = 0.6;
const SWING_SECONDS = 0.9;
const SWING_PAUSE_SECONDS = 0.6;
const CRITICAL_SECONDS = 1.2;
const CRITICAL_PAUSE_SECONDS = 1.0;

/** "Large eval swing" (BLUEPRINT.md §19) — matches brilliant's own advantage threshold. */
const SWING_THRESHOLD_CP = 150;
/** "Critical move" — matches blunder's own severity threshold. */
const CRITICAL_THRESHOLD_CP = 300;

type MoveCategory = "quiet" | "capture" | "check" | "swing" | "critical";

interface MoveImportance {
  category: MoveCategory;
  moveSeconds: number;
  pauseSeconds: number;
  /** Mover-relative eval delta (positive = good for whoever just moved). Only meaningful for swing/critical. */
  swing: number;
}

/**
 * BLUEPRINT.md §19/ROADMAP.md §14's importance-weighted timing heuristic:
 * quiet < capture < check < large swing (+pause) < critical (+pause,
 * annotated). A mating move is always critical regardless of the computed
 * swing magnitude — chess.js may not report a huge mate-scale delta the
 * same way a cp swing would, but delivering mate is unambiguously the most
 * important thing that can happen on a move.
 */
function classifyMove(ply: Ply, before: PositionAnalysis, after: PositionAnalysis): MoveImportance {
  const swing =
    moverComparableValue(after.score, ply.side) - moverComparableValue(before.score, ply.side);

  if (ply.flags.mate || swing >= CRITICAL_THRESHOLD_CP || swing <= -CRITICAL_THRESHOLD_CP) {
    return {
      category: "critical",
      moveSeconds: CRITICAL_SECONDS,
      pauseSeconds: CRITICAL_PAUSE_SECONDS,
      swing,
    };
  }
  if (Math.abs(swing) >= SWING_THRESHOLD_CP) {
    return {
      category: "swing",
      moveSeconds: SWING_SECONDS,
      pauseSeconds: SWING_PAUSE_SECONDS,
      swing,
    };
  }
  if (ply.flags.check) {
    return { category: "check", moveSeconds: CHECK_SECONDS, pauseSeconds: 0, swing };
  }
  if (ply.flags.capture) {
    return { category: "capture", moveSeconds: CAPTURE_SECONDS, pauseSeconds: 0, swing };
  }
  return { category: "quiet", moveSeconds: QUIET_SECONDS, pauseSeconds: 0, swing };
}

/** chess.js defaults an unset PGN header to the literal string "?" — treat that as absent, same as undefined. */
function formatPlayer(name: string | undefined, elo: number | undefined, fallback: string): string {
  const label = name && name !== "?" ? name : fallback;
  return elo !== undefined ? `${label} (${elo})` : label;
}

function headerFor(metadata: GameMetadata): { title: string; subtitle?: string } {
  const white = formatPlayer(metadata.white, metadata.whiteElo, "White");
  const black = formatPlayer(metadata.black, metadata.blackElo, "Black");
  const subtitle = metadata.event && metadata.event !== "?" ? metadata.event : undefined;
  return { title: `${white} vs ${black}`, subtitle };
}

function moveNumberLabel(ply: Ply): string {
  return ply.side === "white" ? `${ply.moveNumber}.` : `${ply.moveNumber}...`;
}

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
    title: { text: header.title },
    subtitle: headerText,
  });

  for (let i = 0; i < game.plies.length; i++) {
    const ply = game.plies[i]!;
    const before = analyses[i]!;
    const after = analyses[i + 1]!;
    const importance = classifyMove(ply, before, after);
    const label = `${moveNumberLabel(ply)} ${ply.san}`;
    const evaluation: SceneDescriptor["evaluation"] = options.showEval
      ? { display: formatEvaluation(after.score), perspective: "white" }
      : undefined;

    // THE MOVE — always the ordinary label; the annotation (if any)
    // appears in the pause below, once the swing is fully "landed".
    push(importance.moveSeconds, {
      position: { fen: ply.fenBefore, orientation },
      moveAnimation: toMoveAnimation(ply, { start: t, end: t + importance.moveSeconds }),
      title: { text: header.title },
      subtitle: headerText,
      moveLabel: { text: label },
      evaluation,
    });
    cues.push({ time: t, type: cueForPly(ply) });

    if (importance.pauseSeconds > 0) {
      const isCritical = importance.category === "critical";
      const annotation = isCritical ? (importance.swing >= 0 ? "!!" : "??") : "";
      push(importance.pauseSeconds, {
        position: { fen: ply.fenAfter, orientation },
        title: { text: header.title },
        subtitle: headerText,
        moveLabel: { text: `${label}${annotation}`, emphasis: isCritical },
        evaluation,
        highlights: isCritical
          ? [
              { square: ply.from, style: "critical" },
              { square: ply.to, style: "critical" },
            ]
          : undefined,
      });
    }
  }

  // OUTRO — final position holds; the result only if the PGN actually
  // recorded a decisive/drawn one (never invent a claim "*" doesn't support).
  const lastPly = game.plies[game.plies.length - 1];
  const finalFen = lastPly?.fenAfter ?? game.initialFen;
  const validResults = new Set(["1-0", "0-1", "1/2-1/2"]);
  const result = game.metadata.result;
  push(OUTRO_SECONDS, {
    position: { fen: finalFen, orientation },
    title: result && validResults.has(result) ? { text: result, emphasis: true } : undefined,
    moveLabel: lastPly ? { text: `${moveNumberLabel(lastPly)} ${lastPly.san}` } : undefined,
  });

  return createTimeline(segments, { showCoordinates: options.coordinates, audioCues: cues });
}
