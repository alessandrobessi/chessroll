import type { Side } from "../chess/types.js";

export interface PuzzleOptions {
  countdownSeconds: number;
  showEval: boolean;
  /** Defaults to the position's side to move when omitted. */
  orientation?: Side;
}
