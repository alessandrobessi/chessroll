import type { Chess, Move } from "chess.js";
import { InvalidChessInputError } from "../utils/errors.js";
import { sideFromColor, type Ply } from "./types.js";

function fullmoveNumberFromFen(fen: string): number {
  const field = fen.trim().split(/\s+/)[5];
  const parsed = field === undefined ? NaN : Number.parseInt(field, 10);
  return Number.isFinite(parsed) ? parsed : 1;
}

export function toPly(move: Move, index: number): Ply {
  return {
    index,
    moveNumber: fullmoveNumberFromFen(move.before),
    side: sideFromColor(move.color),
    san: move.san,
    uci: move.lan,
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    fenBefore: move.before,
    fenAfter: move.after,
    flags: {
      // chess.js's own isCapture() excludes en passant (it uses a separate
      // internal flag bit) — an en passant move is still a capture for our
      // purposes, so combine both.
      capture: move.isCapture() || move.isEnPassant(),
      check: move.san.endsWith("+") || move.san.endsWith("#"),
      mate: move.san.endsWith("#"),
      castle: move.isKingsideCastle() || move.isQueensideCastle(),
      enPassant: move.isEnPassant(),
      promotion: move.isPromotion(),
    },
  };
}

/**
 * Parses a UCI move string (e.g. "e2e4", "a7a8q") and applies it to `chess`,
 * replaying it through chess.js so illegal/malformed engine output can never
 * silently reach the story/scene layers as if it were legal.
 */
export function applyUciMove(chess: Chess, uci: string, index: number): Ply {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!match) {
    throw new InvalidChessInputError(`Malformed UCI move: "${uci}"`);
  }
  const [, from, to, promotion] = match;
  let move: Move;
  try {
    move = chess.move({ from: from!, to: to!, promotion });
  } catch (cause) {
    throw new InvalidChessInputError(`Illegal UCI move "${uci}" in position ${chess.fen()}`, {
      cause,
    });
  }
  return toPly(move, index);
}
