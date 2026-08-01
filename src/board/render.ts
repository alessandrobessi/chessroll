import { Chess, type Square } from "chess.js";
import { easeInOutCubic, lerp, progressOf } from "../scene/interpolation.js";
import type {
  EvaluationElement,
  HighlightElement,
  SceneDescriptor,
  TextElement,
} from "../scene/types.js";
import { renderArrow, type ArrowElement } from "./arrows.js";
import { squareColor, squareToPoint, squareToRect, type BoardGeometry } from "./geometry.js";
import type { MoveAnimation } from "./moves.js";
import { pieceTypeFromSymbol, renderPiece, type Piece } from "./pieces.js";
import { COLORS, FONT_FAMILY } from "./theme.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/** Width the evaluation bar (+ its gap to the board) reserves in the left margin, when shown. */
const EVAL_BAR_RESERVED_WIDTH = 29;

/**
 * Rank/file labels drawn outside the 8x8 grid (in the board's own margin,
 * never overlapping a square) — "external" coordinates, as opposed to the
 * small in-corner style some sites draw on the edge squares themselves.
 * Positions are derived from squareToRect/squareToPoint rather than
 * re-deriving orientation logic here, so flipping the board (black
 * orientation) automatically flips the labels too.
 *
 * `leftReserve` shifts the rank labels further left, out of the way of the
 * evaluation bar (also left-of-board) when one is present — both features
 * fit in the board's existing left margin without moving the board itself.
 */
function renderCoordinates(geometry: BoardGeometry, leftReserve: number): string {
  const fontSize = Math.round(geometry.squareSize * 0.22);
  const rankLabelX = geometry.x - leftReserve - fontSize * 0.9;
  const fileLabelY = geometry.y + geometry.size + fontSize * 1.1;

  let out = "";
  for (let rank = 1; rank <= 8; rank++) {
    const square = `a${rank}` as Square;
    const y = squareToPoint(square, geometry).y;
    out +=
      `<text x="${rankLabelX}" y="${y}" font-family="${FONT_FAMILY}" font-size="${fontSize}" ` +
      `font-weight="600" fill="${COLORS.secondary}" text-anchor="middle" dominant-baseline="central">${rank}</text>`;
  }
  for (const file of FILES) {
    const square = `${file}1` as Square;
    const x = squareToPoint(square, geometry).x;
    out +=
      `<text x="${x}" y="${fileLabelY}" font-family="${FONT_FAMILY}" font-size="${fontSize}" ` +
      `font-weight="600" fill="${COLORS.secondary}" text-anchor="middle" dominant-baseline="hanging">${file}</text>`;
  }
  return out;
}

const EVAL_BAR_WIDTH = 16;
const EVAL_BAR_GAP = 5;

/**
 * A vertical eval bar in the board's left margin, flush against the board
 * edge — automatically shown whenever `descriptor.evaluation` is set, the
 * same gating every template already uses for the numeric evaluation text,
 * so this never leaks an answer during puzzle/blunder/brilliant's
 * countdown (those templates simply never populate `evaluation` that
 * early — see each builder's own SOLVE/COUNTDOWN phase).
 *
 * The portion representing whichever side sits at the *bottom* of the
 * current board orientation grows from the bar's own bottom — matching
 * the board's own visual "down is toward you" convention rather than
 * always keying off White regardless of a flipped board.
 */
function renderEvaluationBar(
  evaluation: EvaluationElement | undefined,
  geometry: BoardGeometry,
): string {
  if (!evaluation) return "";
  const x = geometry.x - EVAL_BAR_GAP - EVAL_BAR_WIDTH;
  const y = geometry.y;
  const height = geometry.size;

  const bottomIsWhite = geometry.orientation === "white";
  const bottomFraction = bottomIsWhite ? evaluation.barFraction : 1 - evaluation.barFraction;
  const bottomHeight = height * bottomFraction;
  const topHeight = height - bottomHeight;
  const bottomColor = bottomIsWhite ? "#FFFFFF" : COLORS.primary;
  const topColor = bottomIsWhite ? COLORS.primary : "#FFFFFF";

  return (
    `<rect x="${x}" y="${y}" width="${EVAL_BAR_WIDTH}" height="${topHeight}" fill="${topColor}" />` +
    `<rect x="${x}" y="${y + topHeight}" width="${EVAL_BAR_WIDTH}" height="${bottomHeight}" fill="${bottomColor}" />` +
    `<rect x="${x}" y="${y}" width="${EVAL_BAR_WIDTH}" height="${height}" fill="none" stroke="${COLORS.secondary}" stroke-width="1.5" />` +
    `<line x1="${x}" y1="${y + height / 2}" x2="${x + EVAL_BAR_WIDTH}" y2="${y + height / 2}" stroke="${COLORS.secondary}" stroke-width="1" opacity="0.5" />`
  );
}

function renderSquares(geometry: BoardGeometry): string {
  let out = "";
  for (const file of FILES) {
    for (let rank = 1; rank <= 8; rank++) {
      const square = `${file}${rank}` as Square;
      const rect = squareToRect(square, geometry);
      const fill = squareColor(square) === "light" ? COLORS.boardLight : COLORS.boardDark;
      out += `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${fill}" />`;
    }
  }
  return out;
}

const HIGHLIGHT_COLOR: Record<HighlightElement["style"], string> = {
  origin: COLORS.accent,
  destination: COLORS.accent,
  critical: COLORS.accent,
};

function renderHighlights(
  highlights: HighlightElement[] | undefined,
  geometry: BoardGeometry,
): string {
  if (!highlights) return "";
  return highlights
    .map((highlight) => {
      const rect = squareToRect(highlight.square, geometry);
      const fill = HIGHLIGHT_COLOR[highlight.style];
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${fill}" opacity="0.35" />`;
    })
    .join("");
}

/**
 * Squares that must NOT be drawn from the static position, because a
 * MoveAnimation is currently animating a piece out of them. A captured
 * piece is deliberately NOT included here: it stays visible at its square
 * for the whole animation and is only visually covered once the capturing
 * piece actually arrives there (renderMovingPieces draws after — i.e. on
 * top of — renderStaticPieces, see renderBoardSvg). For a normal capture
 * that square is the same as `to`, so the two pieces only overlap in the
 * final moments of the animation, exactly when the capture "lands." The
 * alternative — hiding it from t=start — makes the captured piece vanish
 * while the capturing piece is still elsewhere on the board, which reads
 * as a bug, not a capture (this is what BLUEPRINT.md §12's "captured
 * piece handling is deterministic" actually calls for: deterministic, not
 * instantaneous).
 */
function squaresToSkip(moveAnimation: MoveAnimation | undefined): Set<Square> {
  const skip = new Set<Square>();
  if (!moveAnimation) return skip;
  skip.add(moveAnimation.from);
  if (moveAnimation.secondaryMove) skip.add(moveAnimation.secondaryMove.from);
  return skip;
}

/**
 * Renders every piece from `fen` except squares in `skip`. For a segment
 * carrying a MoveAnimation, `fen` is expected to be the position BEFORE
 * that move (the moving/animating pieces are drawn separately, on top).
 */
function renderStaticPieces(fen: string, geometry: BoardGeometry, skip: Set<Square>): string {
  const board = new Chess(fen).board();
  let out = "";
  for (const row of board) {
    for (const cell of row) {
      if (!cell || skip.has(cell.square)) continue;
      const rect = squareToRect(cell.square, geometry);
      const piece: Piece = {
        type: pieceTypeFromSymbol(cell.type),
        color: cell.color === "w" ? "white" : "black",
      };
      out += renderPiece(piece, { x: rect.x, y: rect.y, size: rect.width });
    }
  }
  return out;
}

function interpolatedCenter(
  from: Square,
  to: Square,
  progress: number,
  geometry: BoardGeometry,
): { x: number; y: number } {
  const a = squareToPoint(from, geometry);
  const b = squareToPoint(to, geometry);
  return { x: lerp(a.x, b.x, progress), y: lerp(a.y, b.y, progress) };
}

function renderMovingPieces(
  moveAnimation: MoveAnimation | undefined,
  t: number,
  geometry: BoardGeometry,
): string {
  if (!moveAnimation) return "";
  const progress = easeInOutCubic(progressOf(t, moveAnimation.start, moveAnimation.end));
  const size = geometry.squareSize;

  const primaryCenter = interpolatedCenter(
    moveAnimation.from,
    moveAnimation.to,
    progress,
    geometry,
  );
  let out = renderPiece(moveAnimation.piece, {
    x: primaryCenter.x - size / 2,
    y: primaryCenter.y - size / 2,
    size,
  });

  if (moveAnimation.secondaryMove) {
    const secondaryCenter = interpolatedCenter(
      moveAnimation.secondaryMove.from,
      moveAnimation.secondaryMove.to,
      progress,
      geometry,
    );
    out += renderPiece(moveAnimation.secondaryMove.piece, {
      x: secondaryCenter.x - size / 2,
      y: secondaryCenter.y - size / 2,
      size,
    });
  }

  return out;
}

function renderArrows(arrows: ArrowElement[] | undefined, geometry: BoardGeometry): string {
  if (!arrows) return "";
  return arrows.map((arrow) => renderArrow(arrow, geometry)).join("");
}

export interface RenderOptions {
  geometry: BoardGeometry;
  /** Current timeline timestamp, used only to interpolate moveAnimation progress. */
  t: number;
  /** Draw file/rank labels in the board's outer margin. Default false. */
  coordinates?: boolean;
}

/** Assembles the full board SVG fragment (squares, highlights, pieces, arrows). */
export function renderBoardSvg(descriptor: SceneDescriptor, options: RenderOptions): string {
  const { geometry, t, coordinates } = options;
  const skip = squaresToSkip(descriptor.moveAnimation);
  const coordinatesReserve = descriptor.evaluation ? EVAL_BAR_RESERVED_WIDTH : 0;
  return (
    renderSquares(geometry) +
    renderHighlights(descriptor.highlights, geometry) +
    renderStaticPieces(descriptor.position.fen, geometry, skip) +
    renderMovingPieces(descriptor.moveAnimation, t, geometry) +
    renderArrows(descriptor.arrows, geometry) +
    (coordinates ? renderCoordinates(geometry, coordinatesReserve) : "") +
    renderEvaluationBar(descriptor.evaluation, geometry)
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textBlock(className: string, element: TextElement | undefined): string {
  if (!element) return "";
  const emphasisClass = element.emphasis ? ` ${className}--emphasis` : "";
  const compactClass = element.compact ? ` ${className}--compact` : "";
  return `<div class="${className}${emphasisClass}${compactClass}">${escapeHtml(element.text)}</div>`;
}

/** Assembles the non-board overlay (title/prompt/countdown/evaluation/move label). */
export function renderOverlayHtml(descriptor: SceneDescriptor): string {
  const parts: string[] = [
    textBlock("title", descriptor.title),
    textBlock("subtitle", descriptor.subtitle),
    textBlock("prompt", descriptor.prompt),
  ];
  if (descriptor.countdown) {
    parts.push(`<div class="countdown">${descriptor.countdown.value}</div>`);
  }
  if (descriptor.evaluation) {
    parts.push(`<div class="evaluation">${escapeHtml(descriptor.evaluation.display)}</div>`);
  }
  parts.push(textBlock("move-label", descriptor.moveLabel));
  return parts.join("");
}
