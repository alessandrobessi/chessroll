import type { Square } from "chess.js";
import type { Ply, Side } from "../chess/types.js";
import { pieceTypeFromSymbol, type Piece, type PieceType } from "./pieces.js";

export interface MoveAnimation {
  from: Square;
  to: Square;
  piece: Piece;
  capturedPiece?: Piece;
  /** Differs from `to` only for en passant. */
  capturedSquare?: Square;
  /** Animation window, in seconds, on the scene timeline. */
  start: number;
  end: number;
  promotion?: PieceType;
  secondaryMove?: {
    from: Square;
    to: Square;
    piece: Piece;
  };
}

const KINGSIDE_ROOK_MOVE: Record<Side, { from: Square; to: Square }> = {
  white: { from: "h1", to: "f1" },
  black: { from: "h8", to: "f8" },
};

const QUEENSIDE_ROOK_MOVE: Record<Side, { from: Square; to: Square }> = {
  white: { from: "a1", to: "d1" },
  black: { from: "a8", to: "d8" },
};

function opposite(side: Side): Side {
  return side === "white" ? "black" : "white";
}

/**
 * Converts a normalized chess Ply into a board-domain animation descriptor
 * covering the timeline window [start, end).
 */
export function toMoveAnimation(ply: Ply, window: { start: number; end: number }): MoveAnimation {
  const piece: Piece = { type: pieceTypeFromSymbol(ply.piece), color: ply.side };
  const capturedPiece: Piece | undefined = ply.captured
    ? { type: pieceTypeFromSymbol(ply.captured), color: opposite(ply.side) }
    : undefined;

  let secondaryMove: MoveAnimation["secondaryMove"];
  if (ply.flags.castle) {
    const isKingside = ply.to === "g1" || ply.to === "g8";
    const rookMove = (isKingside ? KINGSIDE_ROOK_MOVE : QUEENSIDE_ROOK_MOVE)[ply.side];
    secondaryMove = { ...rookMove, piece: { type: "rook", color: ply.side } };
  }

  return {
    from: ply.from,
    to: ply.to,
    piece,
    capturedPiece,
    capturedSquare: ply.capturedSquare,
    start: window.start,
    end: window.end,
    promotion: ply.promotion ? pieceTypeFromSymbol(ply.promotion) : undefined,
    secondaryMove,
  };
}
