import type { Square } from "chess.js";
import type { Side } from "../chess/types.js";
import { CANVAS } from "./theme.js";

export interface BoardGeometry {
  x: number;
  y: number;
  size: number;
  squareSize: number;
  orientation: Side;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function createBoardGeometry(params: {
  x: number;
  y: number;
  size: number;
  orientation: Side;
}): BoardGeometry {
  return {
    x: params.x,
    y: params.y,
    size: params.size,
    squareSize: params.size / 8,
    orientation: params.orientation,
  };
}

function fileIndex(square: Square): number {
  return square.charCodeAt(0) - "a".charCodeAt(0);
}

function rankIndex(square: Square): number {
  return Number(square[1]) - 1;
}

/** Column/row in the 0..7 display grid, top-left origin, for the given orientation. */
function displayCoords(square: Square, orientation: Side): { col: number; row: number } {
  const file = fileIndex(square);
  const rank = rankIndex(square);
  return orientation === "white" ? { col: file, row: 7 - rank } : { col: 7 - file, row: rank };
}

export function squareToRect(square: Square, geometry: BoardGeometry): Rect {
  const { col, row } = displayCoords(square, geometry.orientation);
  return {
    x: geometry.x + col * geometry.squareSize,
    y: geometry.y + row * geometry.squareSize,
    width: geometry.squareSize,
    height: geometry.squareSize,
  };
}

export function squareToPoint(square: Square, geometry: BoardGeometry): Point {
  const rect = squareToRect(square, geometry);
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

export function squareColor(square: Square): "light" | "dark" {
  const file = fileIndex(square);
  const rank = rankIndex(square);
  return (file + rank) % 2 === 0 ? "dark" : "light";
}

/**
 * Default vertical-composition board placement (BLUEPRINT.md §17): centered
 * horizontally, leaving room above for title/prompt and below for
 * countdown/evaluation/move label. Board size/position are visual defaults
 * pending sign-off once real frames render, same as the color tokens.
 */
const DEFAULT_BOARD_SIZE = 940;
const DEFAULT_BOARD_Y = 560;

export function defaultBoardGeometry(orientation: Side): BoardGeometry {
  return createBoardGeometry({
    x: (CANVAS.width - DEFAULT_BOARD_SIZE) / 2,
    y: DEFAULT_BOARD_Y,
    size: DEFAULT_BOARD_SIZE,
    orientation,
  });
}
