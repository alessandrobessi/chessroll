import type { Side } from "../chess/types.js";

export interface PuzzleOptions {
  countdownSeconds: number;
  showEval: boolean;
  /** Defaults to the position's side to move when omitted. */
  orientation?: Side;
  /** Draw file/rank labels in the board's outer margin. Default false. */
  coordinates?: boolean;
}
