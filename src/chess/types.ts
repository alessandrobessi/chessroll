import type { Color, PieceSymbol, Square } from "chess.js";

export type Side = "white" | "black";

export interface GameMetadata {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  result?: string;
  whiteElo?: number;
  blackElo?: number;
}

export interface PlyFlags {
  capture: boolean;
  check: boolean;
  mate: boolean;
  castle: boolean;
  enPassant: boolean;
  promotion: boolean;
}

export interface Ply {
  index: number;
  moveNumber: number;
  side: Side;
  san: string;
  uci: string;
  from: Square;
  to: Square;
  /** Type of the piece that moved, before promotion resolves. */
  piece: PieceSymbol;
  /** Type of the captured piece, if any (including en passant). */
  captured?: PieceSymbol;
  /**
   * Square the captured piece occupied before the capture. Equal to `to`
   * for every capture except en passant, where the captured pawn sits on
   * the same file as `to` but the same rank as `from`.
   */
  capturedSquare?: Square;
  promotion?: PieceSymbol;
  fenBefore: string;
  fenAfter: string;
  flags: PlyFlags;
}

export interface ChessGame {
  metadata: GameMetadata;
  initialFen: string;
  plies: Ply[];
}

export function sideFromColor(color: Color): Side {
  return color === "w" ? "white" : "black";
}
