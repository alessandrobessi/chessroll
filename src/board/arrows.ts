import type { Square } from "chess.js";
import type { BoardGeometry } from "./geometry.js";
import { squareToPoint } from "./geometry.js";

export interface ArrowElement {
  from: Square;
  to: Square;
  color: string;
  opacity: number;
  width?: number;
}

/** Renders a single arrow (shaft + triangular head) as an SVG fragment. */
export function renderArrow(arrow: ArrowElement, geometry: BoardGeometry): string {
  const start = squareToPoint(arrow.from, geometry);
  const end = squareToPoint(arrow.to, geometry);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return "";

  const ux = dx / length;
  const uy = dy / length;
  const perpX = -uy;
  const perpY = ux;

  const headLength = geometry.squareSize * 0.35;
  const headWidth = geometry.squareSize * 0.3;
  const shaftWidth = arrow.width ?? geometry.squareSize * 0.12;

  const shaftEnd = { x: end.x - ux * headLength, y: end.y - uy * headLength };
  const headLeft = {
    x: shaftEnd.x + (perpX * headWidth) / 2,
    y: shaftEnd.y + (perpY * headWidth) / 2,
  };
  const headRight = {
    x: shaftEnd.x - (perpX * headWidth) / 2,
    y: shaftEnd.y - (perpY * headWidth) / 2,
  };

  const shaft =
    `<line x1="${start.x}" y1="${start.y}" x2="${shaftEnd.x}" y2="${shaftEnd.y}" ` +
    `stroke="${arrow.color}" stroke-width="${shaftWidth}" stroke-linecap="round" ` +
    `opacity="${arrow.opacity}" />`;
  const head =
    `<polygon points="${end.x},${end.y} ${headLeft.x},${headLeft.y} ${headRight.x},${headRight.y}" ` +
    `fill="${arrow.color}" opacity="${arrow.opacity}" />`;

  return shaft + head;
}
