import type { Square } from "chess.js";
import type { ArrowElement } from "../board/arrows.js";
import type { MoveAnimation } from "../board/moves.js";
import type { AudioCue } from "../audio/timeline.js";
import type { Side } from "../chess/types.js";

export interface BoardPosition {
  fen: string;
  orientation: Side;
}

export interface TextElement {
  text: string;
  emphasis?: boolean;
}

export interface EvaluationElement {
  /** Pre-formatted for display: "+0.3", "-4.2", "M3", "-M2". */
  display: string;
  perspective: "white";
  /** Fraction (0-1) of the evaluation bar that should read as White's — see evaluationBarFraction(). */
  barFraction: number;
}

/**
 * Chess.com/lichess-style per-move annotation tiers. "miss" is a
 * different axis from the rest (it's about failing to punish an
 * opponent's immediately preceding blunder/mistake hard enough, not
 * about the mover's own swing) and takes priority over the others when
 * both would otherwise apply — see classifyMoveQuality()/detectMiss().
 */
export type MoveQualityTier = "blunder" | "mistake" | "inaccuracy" | "great" | "brilliant" | "miss";

export interface HighlightElement {
  square: Square;
  style: "origin" | "destination" | MoveQualityTier;
}

/** A small badge drawn at the destination square, like chess.com/lichess's move-quality icons. */
export interface MoveQualityBadge {
  square: Square;
  tier: MoveQualityTier;
  /** Pre-formatted annotation glyph: "??" | "?" | "?!" | "!" | "!!". */
  glyph: string;
}

export interface CountdownElement {
  /** Integer seconds remaining, already rounded for display. */
  value: number;
}

export interface SceneDescriptor {
  position: BoardPosition;
  moveAnimation?: MoveAnimation;
  title?: TextElement;
  subtitle?: TextElement;
  prompt?: TextElement;
  evaluation?: EvaluationElement;
  arrows?: ArrowElement[];
  highlights?: HighlightElement[];
  countdown?: CountdownElement;
  moveLabel?: TextElement;
  /** Name (+ rating) of whoever sits at the TOP of the board given the current orientation, shown flush left just above it. */
  topPlayer?: TextElement;
  /** Name (+ rating) of whoever sits at the BOTTOM of the board given the current orientation, shown flush left below everything else under the board. */
  bottomPlayer?: TextElement;
  moveQualityBadge?: MoveQualityBadge;
}

export interface SceneSegment {
  start: number;
  end: number;
  state: SceneDescriptor;
}

export interface SceneTimeline {
  duration: number;
  segments: SceneSegment[];
  /** Draw file/rank labels in the board's outer margin. Default false. */
  showCoordinates?: boolean;
  /** Sound cues to mix into the encoded video. Always computed; muting happens at encode time. */
  audioCues?: AudioCue[];
}
