import { Chess, type Square } from "chess.js";
import { easeInOutCubic, lerp, progressOf } from "../scene/interpolation.js";
import type {
  EvaluationElement,
  HighlightElement,
  MoveQualityBadge,
  MoveQualityTier,
  SceneDescriptor,
  TextElement,
} from "../scene/types.js";
import { renderArrow, type ArrowElement } from "./arrows.js";
import { squareColor, squareToPoint, squareToRect, type BoardGeometry } from "./geometry.js";
import type { MoveAnimation } from "./moves.js";
import { pieceTypeFromSymbol, renderPiece, type Piece } from "./pieces.js";
import { BADGE_FONT_FAMILY, COLORS, FONT_FAMILY } from "./theme.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/**
 * Rank/file labels drawn INSIDE the board, in the corner of the edge
 * squares — the lichess/chess.com convention (rank number in the
 * top-left corner of the leftmost visible file, file letter in the
 * bottom-right corner of the bottommost visible rank) — rather than
 * external labels in the board's own margin. Each label is colored the
 * OPPOSITE of its own square (a dark label on a light square, a light
 * label on a dark square) for automatic contrast, same as those sites.
 * `squareToRect` already accounts for orientation, so which file ends up
 * on the left / which rank ends up on the bottom both flip automatically
 * with the board — nothing re-derived here.
 */
function renderCoordinates(geometry: BoardGeometry): string {
  const fontSize = Math.round(geometry.squareSize * 0.18);
  const padding = geometry.squareSize * 0.08;
  const leftFile = geometry.orientation === "white" ? "a" : "h";
  const bottomRank = geometry.orientation === "white" ? 1 : 8;
  const labelColor = (square: Square): string =>
    squareColor(square) === "light" ? COLORS.boardDark : COLORS.boardLight;

  let out = "";
  for (let rank = 1; rank <= 8; rank++) {
    const square = `${leftFile}${rank}` as Square;
    const rect = squareToRect(square, geometry);
    out +=
      `<text x="${rect.x + padding}" y="${rect.y + padding}" font-family="${FONT_FAMILY}" font-size="${fontSize}" ` +
      `font-weight="700" fill="${labelColor(square)}" text-anchor="start" dominant-baseline="hanging">${rank}</text>`;
  }
  for (const file of FILES) {
    const square = `${file}${bottomRank}` as Square;
    const rect = squareToRect(square, geometry);
    out +=
      `<text x="${rect.x + rect.width - padding}" y="${rect.y + rect.height - padding}" font-family="${FONT_FAMILY}" font-size="${fontSize}" ` +
      `font-weight="700" fill="${labelColor(square)}" text-anchor="end" dominant-baseline="ideographic">${file}</text>`;
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

/**
 * Square-highlight tint per move-quality tier — muted to fit Chessroll's
 * own paper-and-ink board palette. "blunder" reuses COLORS.accent (the
 * same oxblood already used for origin/destination highlights elsewhere),
 * the other three are new, equally muted, tones distinct enough to read
 * at a glance. The badge circle (below) is deliberately bolder/more
 * saturated than this — the square wash stays quiet, the badge pops.
 */
const MOVE_QUALITY_COLOR: Record<MoveQualityTier, string> = {
  blunder: COLORS.accent,
  mistake: "#8C4A2F",
  inaccuracy: "#A6763A",
  great: "#3D6B2F",
  brilliant: "#1F6B8B",
  miss: "#5C5470",
};

const HIGHLIGHT_COLOR: Record<HighlightElement["style"], string> = {
  origin: COLORS.accent,
  destination: COLORS.accent,
  ...MOVE_QUALITY_COLOR,
};

/** Bold, saturated badge colors — chess.com/lichess-style pop, deliberately more vivid than the muted square tint above. */
const BADGE_COLOR: Record<MoveQualityTier, string> = {
  blunder: "#D32F2F",
  mistake: "#EB5757",
  inaccuracy: "#F2994A",
  great: "#27AE60",
  brilliant: "#17A2B8",
  miss: "#8E44AD",
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
 * A small circular badge in the destination square's top-right corner,
 * carrying the move's annotation glyph ("??"/"?!"/"!"/"!!") — the same
 * chess.com/lichess convention of marking blunders/inaccuracies/great/
 * brilliant moves directly on the board, not just as text underneath it.
 */
function renderMoveQualityBadge(
  badge: MoveQualityBadge | undefined,
  geometry: BoardGeometry,
): string {
  if (!badge) return "";
  const rect = squareToRect(badge.square, geometry);
  const radius = geometry.squareSize * 0.24;
  const cx = rect.x + rect.width - radius * 0.9;
  const cy = rect.y + radius * 0.9;
  const fill = BADGE_COLOR[badge.tier];
  const fontSize = radius * 1.05;
  const strokeWidth = radius * 0.18;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${COLORS.background}" stroke-width="${strokeWidth}" />` +
    `<text x="${cx}" y="${cy}" font-family="${BADGE_FONT_FAMILY}" font-size="${fontSize}" ` +
    `font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${badge.glyph}</text>`
  );
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
  /** Draw file/rank labels inside the board's own edge squares (lichess/chess.com convention). Default false. */
  coordinates?: boolean;
}

/** Assembles the full board SVG fragment (squares, highlights, pieces, arrows). */
export function renderBoardSvg(descriptor: SceneDescriptor, options: RenderOptions): string {
  const { geometry, t, coordinates } = options;
  const skip = squaresToSkip(descriptor.moveAnimation);
  return (
    renderSquares(geometry) +
    (coordinates ? renderCoordinates(geometry) : "") +
    renderHighlights(descriptor.highlights, geometry) +
    renderStaticPieces(descriptor.position.fen, geometry, skip) +
    renderMovingPieces(descriptor.moveAnimation, t, geometry) +
    renderArrows(descriptor.arrows, geometry) +
    renderEvaluationBar(descriptor.evaluation, geometry) +
    renderMoveQualityBadge(descriptor.moveQualityBadge, geometry)
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textBlock(className: string, element: TextElement | undefined): string {
  if (!element) return "";
  const emphasisClass = element.emphasis ? ` ${className}--emphasis` : "";
  return `<div class="${className}${emphasisClass}">${escapeHtml(element.text)}</div>`;
}

/**
 * Player labels only ever need plain text, never emphasis — kept separate
 * from textBlock() above because its `${className}--emphasis` suffix
 * logic doesn't compose with a multi-word className like "player-label
 * player-label--top".
 */
function playerLabelBlock(className: string, element: TextElement | undefined): string {
  if (!element) return "";
  return `<div class="${className}">${escapeHtml(element.text)}</div>`;
}

/** Assembles the non-board overlay (title/prompt/countdown/evaluation/move label/player labels). */
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
  parts.push(playerLabelBlock("player-label player-label--top", descriptor.topPlayer));
  parts.push(playerLabelBlock("player-label player-label--bottom", descriptor.bottomPlayer));
  return parts.join("");
}
