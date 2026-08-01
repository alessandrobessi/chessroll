import { Chess, validateFen } from "chess.js";
import { InvalidChessInputError } from "../utils/errors.js";
import { sideFromColor, type Side } from "./types.js";

export interface LoadedFen {
  fen: string;
  sideToMove: Side;
}

/**
 * Validates a FEN string and reports the side to move.
 *
 * chess.js's own FEN validation does not reject a position where the side
 * NOT on move is in check (an unreachable position in a real game), so that
 * is checked explicitly here.
 */
export function loadFen(fen: string): LoadedFen {
  const trimmed = fen.trim();
  const result = validateFen(trimmed);
  if (!result.ok) {
    throw new InvalidChessInputError(
      `Invalid FEN "${trimmed}": ${result.error ?? "unknown error"}`,
    );
  }

  const chess = new Chess(trimmed);
  const opponentColor = chess.turn() === "w" ? "b" : "w";
  if (chess.isAttacked(chess.findPiece({ type: "k", color: opponentColor })[0]!, chess.turn())) {
    throw new InvalidChessInputError(
      `Invalid FEN "${trimmed}": the side not on move is in check, which is not a reachable position`,
    );
  }

  return { fen: chess.fen(), sideToMove: sideFromColor(chess.turn()) };
}

/**
 * Reads the side to move directly off a FEN's own "w"/"b" field, without
 * the full loadFen() validation pass. For internal use on FENs already
 * known-good (e.g. produced by chess.js itself), not on user input.
 */
export function sideToMoveFromFen(fen: string): Side {
  const field = fen.trim().split(/\s+/)[1];
  return field === "b" ? "black" : "white";
}
