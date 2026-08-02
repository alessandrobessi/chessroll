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
  /** Smaller variant for persistent, potentially-long text (e.g. a "Name (Rating) vs Name (Rating)" header). */
  compact?: boolean;
}

export interface EvaluationElement {
  /** Pre-formatted for display: "+0.3", "-4.2", "M3", "-M2". */
  display: string;
  perspective: "white";
  /** Fraction (0-1) of the evaluation bar that should read as White's — see evaluationBarFraction(). */
  barFraction: number;
}

/** Chess.com/lichess-style per-move annotation tiers, worst to best. */
export type MoveQualityTier = "blunder" | "inaccuracy" | "great" | "brilliant";

export interface HighlightElement {
  square: Square;
  style: "origin" | "destination" | MoveQualityTier;
}

/** A small badge drawn at the destination square, like chess.com/lichess's move-quality icons. */
export interface MoveQualityBadge {
  square: Square;
  tier: MoveQualityTier;
  /** Pre-formatted annotation glyph: "??" | "?!" | "!" | "!!". */
  glyph: string;
}

export interface CountdownElement {
  /** Integer seconds remaining, already rounded for display. */
  value: number;
}

export interface PlayerInfoElement {
  name?: string;
  rating?: number;
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
  playerInfo?: PlayerInfoElement;
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
