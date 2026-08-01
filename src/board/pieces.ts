import type { PieceSymbol } from "chess.js";
import { COLORS } from "./theme.js";

export type PieceType = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
export type PieceColor = "white" | "black";

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

const PIECE_TYPE_BY_SYMBOL: Record<PieceSymbol, PieceType> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export function pieceTypeFromSymbol(symbol: PieceSymbol): PieceType {
  return PIECE_TYPE_BY_SYMBOL[symbol];
}

interface ShapeElement {
  tag: "rect" | "circle" | "polygon" | "line";
  attrs: Record<string, string | number>;
}

const VIEW_BOX_SIZE = 100;

function rect(x: number, y: number, width: number, height: number, rx = 0): ShapeElement {
  return { tag: "rect", attrs: { x, y, width, height, rx } };
}

function circle(cx: number, cy: number, r: number): ShapeElement {
  return { tag: "circle", attrs: { cx, cy, r } };
}

function polygon(points: Array<[number, number]>): ShapeElement {
  return { tag: "polygon", attrs: { points: points.map(([x, y]) => `${x},${y}`).join(" ") } };
}

function line(x1: number, y1: number, x2: number, y2: number, strokeWidth: number): ShapeElement {
  return { tag: "line", attrs: { x1, y1, x2, y2, "stroke-width": strokeWidth } };
}

/** The shared trapezoid base every piece stands on, plus its plinth. */
function base(): ShapeElement[] {
  return [
    rect(20, 84, 60, 8, 2),
    polygon([
      [32, 84],
      [68, 84],
      [74, 70],
      [26, 70],
    ]),
  ];
}

/**
 * Original, minimal, geometric 6-piece silhouette set (100x100 viewBox),
 * built from simple primitives rather than freehand bezier paths so every
 * shape stays a valid, closed, testable outline. Color comes from
 * `renderPiece`; this table only holds shape geometry.
 */
export const PIECE_SHAPES: Record<PieceType, ShapeElement[]> = {
  pawn: [...base(), rect(38, 46, 24, 26, 4), circle(50, 32, 15)],
  rook: [
    ...base(),
    rect(28, 40, 44, 32, 2),
    rect(26, 22, 10, 18),
    rect(45, 22, 10, 18),
    rect(64, 22, 10, 18),
    rect(24, 40, 52, 8),
  ],
  bishop: [
    ...base(),
    polygon([
      [50, 20],
      [66, 46],
      [62, 70],
      [38, 70],
      [34, 46],
    ]),
    circle(50, 16, 6),
    line(38, 40, 58, 58, 4),
  ],
  queen: [
    ...base(),
    rect(32, 50, 36, 22, 3),
    polygon([
      [30, 50],
      [36, 26],
      [43, 42],
      [50, 22],
      [57, 42],
      [64, 26],
      [70, 50],
    ]),
    circle(36, 26, 5),
    circle(50, 22, 5),
    circle(64, 26, 5),
  ],
  king: [...base(), rect(34, 46, 32, 26, 3), rect(46, 18, 8, 22), rect(38, 24, 24, 8)],
  knight: [
    ...base(),
    polygon([
      [34, 70],
      [34, 52],
      [30, 40],
      [38, 26],
      [52, 20],
      [66, 30],
      [70, 44],
      [58, 40],
      [62, 52],
      [66, 70],
    ]),
    circle(56, 32, 3),
  ],
};

function shapeToSvg(shape: ShapeElement): string {
  const attrs = Object.entries(shape.attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  return `<${shape.tag} ${attrs} />`;
}

export interface RenderPieceOptions {
  x: number;
  y: number;
  size: number;
  opacity?: number;
}

/**
 * Renders a piece as a self-contained, positioned SVG `<g>` fragment.
 * `options.x`/`y` is the top-left corner of the square to draw into.
 */
export function renderPiece(piece: Piece, options: RenderPieceOptions): string {
  const shapes = PIECE_SHAPES[piece.type];
  const fill = piece.color === "white" ? COLORS.pieceWhiteFill : COLORS.pieceBlackFill;
  const stroke = piece.color === "white" ? COLORS.pieceWhiteStroke : COLORS.pieceBlackStroke;
  const strokeWidth = piece.color === "white" ? 3 : 0;
  const scale = options.size / VIEW_BOX_SIZE;
  const opacity = options.opacity ?? 1;
  const inner = shapes.map(shapeToSvg).join("");
  return (
    `<g transform="translate(${options.x} ${options.y}) scale(${scale})" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ` +
    `stroke-linejoin="round" opacity="${opacity}">${inner}</g>`
  );
}
