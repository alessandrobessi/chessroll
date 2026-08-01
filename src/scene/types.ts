import type { Square } from "chess.js";
import type { ArrowElement } from "../board/arrows.js";
import type { MoveAnimation } from "../board/moves.js";
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
}

export interface HighlightElement {
  square: Square;
  style: "origin" | "destination" | "critical";
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
}

export interface SceneSegment {
  start: number;
  end: number;
  state: SceneDescriptor;
}

export interface SceneTimeline {
  duration: number;
  segments: SceneSegment[];
}
