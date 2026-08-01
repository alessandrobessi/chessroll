import { describe, expect, it } from "vitest";
import { applyUciMove } from "../../../src/chess/game.js";
import { toMoveAnimation } from "../../../src/board/moves.js";
import { createBoardGeometry } from "../../../src/board/geometry.js";
import { renderBoardSvg, renderOverlayHtml } from "../../../src/board/render.js";
import type { SceneDescriptor } from "../../../src/scene/types.js";
import { Chess } from "chess.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const geometry = createBoardGeometry({ x: 0, y: 0, size: 800, orientation: "white" });

function baseDescriptor(fen: string): SceneDescriptor {
  return { position: { fen, orientation: "white" } };
}

/** Counts board-square rects specifically (piece shapes use rects/polygons too). */
function countSquareRects(svg: string): number {
  return (svg.match(/fill="#(EDEAE1|8B8372)"/g) ?? []).length;
}

/** Counts rendered pieces specifically, via the <g> wrapper renderPiece always emits. */
function countPieceGroups(svg: string): number {
  return (svg.match(/<g transform=/g) ?? []).length;
}

describe("renderBoardSvg", () => {
  it("renders 64 squares and 32 static pieces for the start position", () => {
    const svg = renderBoardSvg(baseDescriptor(START_FEN), { geometry, t: 0 });
    expect(countSquareRects(svg)).toBe(64);
    expect(countPieceGroups(svg)).toBe(32);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
  });

  it("skips the animating piece's source square from the static layer", () => {
    const chess = new Chess(START_FEN);
    const ply = applyUciMove(chess, "e2e4", 0);
    const descriptor: SceneDescriptor = {
      position: { fen: ply.fenBefore, orientation: "white" },
      moveAnimation: toMoveAnimation(ply, { start: 0, end: 1 }),
    };
    // Rendered at the animation midpoint: 32 static pieces minus the one
    // animating (e2) = 31, plus the moving piece drawn separately = 32 total.
    const svg = renderBoardSvg(descriptor, { geometry, t: 0.5 });
    expect(countPieceGroups(svg)).toBe(32);
  });

  it("removes a captured piece from the very start of the capture animation", () => {
    const chess = new Chess("6k1/8/8/8/4b3/8/8/K3R3 w - - 0 1");
    const ply = applyUciMove(chess, "e1e4", 0);
    const descriptor: SceneDescriptor = {
      position: { fen: ply.fenBefore, orientation: "white" },
      moveAnimation: toMoveAnimation(ply, { start: 0, end: 1 }),
    };
    // Before: white rook e1, white king a1, black king g8, black bishop e4 = 4 pieces.
    // At t=0 the rook starts moving and the captured bishop is already gone:
    // static layer has king a1 + king g8 = 2, plus the moving rook = 3.
    const svg = renderBoardSvg(descriptor, { geometry, t: 0 });
    expect(countPieceGroups(svg)).toBe(3);
  });

  it("renders a highlight rect and an arrow when present", () => {
    const descriptor: SceneDescriptor = {
      ...baseDescriptor(START_FEN),
      highlights: [{ square: "e4", style: "destination" }],
      arrows: [{ from: "e2", to: "e4", color: "#6B1F2A", opacity: 0.9 }],
    };
    const svg = renderBoardSvg(descriptor, { geometry, t: 0 });
    expect(svg).toContain('opacity="0.35"');
    // Arrow shafts are the only <line> elements with an explicit stroke color.
    expect(svg).toMatch(/<line[^>]*\sstroke="#6B1F2A"/);
  });

  it("never renders a highlight overlay or an arrow shaft when the descriptor omits them", () => {
    const svg = renderBoardSvg(baseDescriptor(START_FEN), { geometry, t: 0 });
    expect(svg).not.toContain('opacity="0.35"');
    expect(svg).not.toMatch(/<line[^>]*\sstroke="/);
  });
});

describe("renderOverlayHtml", () => {
  it("renders title/subtitle/prompt/countdown/evaluation/moveLabel when present", () => {
    const descriptor: SceneDescriptor = {
      ...baseDescriptor(START_FEN),
      title: { text: "FIND THE BEST MOVE" },
      subtitle: { text: "WHITE TO MOVE" },
      countdown: { value: 3 },
      evaluation: { display: "M3", perspective: "white" },
      moveLabel: { text: "Rh8#" },
    };
    const html = renderOverlayHtml(descriptor);
    expect(html).toContain("FIND THE BEST MOVE");
    expect(html).toContain("WHITE TO MOVE");
    expect(html).toContain('class="countdown">3<');
    expect(html).toContain("M3");
    expect(html).toContain("Rh8#");
  });

  it("renders nothing for absent optional fields", () => {
    const html = renderOverlayHtml(baseDescriptor(START_FEN));
    expect(html.trim()).toBe("");
  });

  it("escapes HTML-significant characters in text", () => {
    const descriptor: SceneDescriptor = {
      ...baseDescriptor(START_FEN),
      title: { text: "<script>a & b</script>" },
    };
    const html = renderOverlayHtml(descriptor);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});
