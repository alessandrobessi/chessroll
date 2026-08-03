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

  it("keeps a captured piece visible until the capturing piece actually arrives", () => {
    const chess = new Chess("6k1/8/8/8/4b3/8/8/K3R3 w - - 0 1");
    const ply = applyUciMove(chess, "e1e4", 0);
    const descriptor: SceneDescriptor = {
      position: { fen: ply.fenBefore, orientation: "white" },
      moveAnimation: toMoveAnimation(ply, { start: 0, end: 1 }),
    };
    // Before: white rook e1, white king a1, black king g8, black bishop e4 = 4 pieces.
    // The captured bishop must stay on screen for the whole animation — it
    // should never disappear before the rook (visually) reaches it, so all
    // 4 groups are present at the start, middle, and end of the animation.
    for (const t of [0, 0.5, 1]) {
      const svg = renderBoardSvg(descriptor, { geometry, t });
      expect(countPieceGroups(svg)).toBe(4);
    }
  });

  it("draws the moving piece after (on top of) the static captured piece it lands on", () => {
    const chess = new Chess("6k1/8/8/8/4b3/8/8/K3R3 w - - 0 1");
    const ply = applyUciMove(chess, "e1e4", 0);
    const descriptor: SceneDescriptor = {
      position: { fen: ply.fenBefore, orientation: "white" },
      moveAnimation: toMoveAnimation(ply, { start: 0, end: 1 }),
    };
    const svg = renderBoardSvg(descriptor, { geometry, t: 1 });
    // Distinctive substrings from the cburnett black-bishop and
    // white-rook path data (src/board/pieces.ts) — the bishop (static,
    // captured) must appear before the rook (moving, capturing) in
    // document order, so the rook is painted on top once they coincide.
    const bishopIndex = svg.indexOf("M9 36c3.4-1 10.1.4");
    const rookIndex = svg.indexOf("M9 39h27v-3H9zm3-3v-4h21v4zm-1-22V9h4v2h5V9h5v2h5V9h4v5");
    expect(bishopIndex).toBeGreaterThan(-1);
    expect(rookIndex).toBeGreaterThan(bishopIndex);
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

  it("omits coordinate labels by default and when explicitly false", () => {
    expect(renderBoardSvg(baseDescriptor(START_FEN), { geometry, t: 0 })).not.toContain("<text");
    expect(
      renderBoardSvg(baseDescriptor(START_FEN), { geometry, t: 0, coordinates: false }),
    ).not.toContain("<text");
  });

  it("draws 8 rank labels and 8 file labels outside the board when coordinates: true", () => {
    const svg = renderBoardSvg(baseDescriptor(START_FEN), { geometry, t: 0, coordinates: true });
    const labels = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
    expect(labels).toHaveLength(16);
    expect(labels.filter((l) => /^[1-8]$/.test(l!))).toHaveLength(8);
    expect(labels.filter((l) => /^[a-h]$/.test(l!))).toHaveLength(8);
  });

  it("flips coordinate label order with orientation, matching the flipped board", () => {
    const whiteGeometry = createBoardGeometry({ x: 0, y: 0, size: 800, orientation: "white" });
    const blackGeometry = createBoardGeometry({ x: 0, y: 0, size: 800, orientation: "black" });
    const descriptor: SceneDescriptor = { position: { fen: START_FEN, orientation: "white" } };

    const whiteSvg = renderBoardSvg(descriptor, {
      geometry: whiteGeometry,
      t: 0,
      coordinates: true,
    });
    const blackSvg = renderBoardSvg(descriptor, {
      geometry: blackGeometry,
      t: 0,
      coordinates: true,
    });

    // Labels are emitted in a fixed rank/file loop order regardless of
    // orientation — only their x/y position changes — so sort by visual
    // position (y for ranks top-to-bottom, x for files left-to-right)
    // rather than relying on document order.
    const labelsByPosition = (svg: string, pattern: RegExp, axis: "x" | "y"): string[] =>
      [...svg.matchAll(pattern)]
        .map((m) => ({ label: m[3]!, pos: Number(m[axis === "x" ? 1 : 2]) }))
        .sort((a, b) => a.pos - b.pos)
        .map((entry) => entry.label);

    const rankPattern = /<text x="([-\d.]+)" y="([-\d.]+)"[^>]*>([1-8])<\/text>/g;
    const filePattern = /<text x="([-\d.]+)" y="([-\d.]+)"[^>]*>([a-h])<\/text>/g;

    // White orientation: rank 8 at the top going down to rank 1; files a->h
    // left to right. Black orientation flips both.
    expect(labelsByPosition(whiteSvg, rankPattern, "y")).toEqual([
      "8",
      "7",
      "6",
      "5",
      "4",
      "3",
      "2",
      "1",
    ]);
    expect(labelsByPosition(whiteSvg, filePattern, "x")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
    ]);
    expect(labelsByPosition(blackSvg, rankPattern, "y")).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
    expect(labelsByPosition(blackSvg, filePattern, "x")).toEqual([
      "h",
      "g",
      "f",
      "e",
      "d",
      "c",
      "b",
      "a",
    ]);
  });

  it("keeps coordinate labels outside the board's own bounding box", () => {
    const svg = renderBoardSvg(baseDescriptor(START_FEN), { geometry, t: 0, coordinates: true });
    // geometry here is { x: 0, y: 0, size: 800 } — rank labels (digits) sit
    // left of x=0, file labels (letters) sit below y=800.
    const rankLabelXs = [
      ...svg.matchAll(/<text x="([-\d.]+)" y="[-\d.]+"[^>]*>[1-8]<\/text>/g),
    ].map((m) => Number(m[1]));
    const fileLabelYs = [
      ...svg.matchAll(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>[a-h]<\/text>/g),
    ].map((m) => Number(m[1]));
    expect(rankLabelXs).toHaveLength(8);
    expect(fileLabelYs).toHaveLength(8);
    expect(rankLabelXs.every((x) => x < 0)).toBe(true);
    expect(fileLabelYs.every((y) => y > 800)).toBe(true);
  });

  it("renders no evaluation bar when evaluation is absent", () => {
    const svg = renderBoardSvg(baseDescriptor(START_FEN), { geometry, t: 0 });
    expect(svg).not.toContain('width="16"');
  });

  it("renders an evaluation bar flush against the board's left edge when evaluation is present", () => {
    const descriptor: SceneDescriptor = {
      ...baseDescriptor(START_FEN),
      evaluation: { display: "+3.0", perspective: "white", barFraction: 0.9 },
    };
    const svg = renderBoardSvg(descriptor, { geometry, t: 0 });
    // geometry is { x: 0, y: 0, size: 800 } — the bar sits entirely left of x=0.
    const barRects = [...svg.matchAll(/<rect x="(-[\d.]+)" y="[-\d.]+" width="16"/g)];
    expect(barRects.length).toBeGreaterThanOrEqual(2); // top + bottom fill segments
    expect(barRects.every((m) => Number(m[1]) < 0)).toBe(true);
  });

  it("fills the bottom of the bar for whichever side sits at the board's bottom", () => {
    const evaluation = { display: "+5.0", perspective: "white" as const, barFraction: 0.95 };

    // White orientation: White sits at the bottom -> mostly white winning
    // shows a tall WHITE rect anchored at the bar's bottom.
    const whiteGeometry = createBoardGeometry({ x: 0, y: 0, size: 800, orientation: "white" });
    const whiteSvg = renderBoardSvg(
      { ...baseDescriptor(START_FEN), evaluation },
      { geometry: whiteGeometry, t: 0 },
    );
    const whiteBottomRect = [
      ...whiteSvg.matchAll(
        /<rect x="[-\d.]+" y="([\d.]+)" width="16" height="([\d.]+)" fill="#FFFFFF"/g,
      ),
    ][0]!;
    expect(Number(whiteBottomRect[2])).toBeGreaterThan(800 * 0.9); // tall — 95% white

    // Black orientation: Black sits at the bottom now, so the SAME
    // White-favoring evaluation instead fills the bar's TOP with white.
    const blackGeometry = createBoardGeometry({ x: 0, y: 0, size: 800, orientation: "black" });
    const blackSvg = renderBoardSvg(
      {
        ...baseDescriptor(START_FEN),
        evaluation,
        position: { fen: START_FEN, orientation: "black" },
      },
      { geometry: blackGeometry, t: 0 },
    );
    const blackTopRect = [
      ...blackSvg.matchAll(
        /<rect x="[-\d.]+" y="([\d.]+)" width="16" height="([\d.]+)" fill="#FFFFFF"/g,
      ),
    ][0]!;
    expect(Number(blackTopRect[1])).toBeCloseTo(0, 5); // starts at the very top
    expect(Number(blackTopRect[2])).toBeGreaterThan(800 * 0.9);
  });

  // The cburnett piece set already draws its own <circle> elements (knight
  // eyes, etc.), so badge presence is checked via its own distinctive
  // stroke (COLORS.background), not bare "<circle" presence.
  const BADGE_STROKE_PATTERN = /<circle[^>]*stroke="#F6F3EC"/;

  it("renders no move-quality badge when absent", () => {
    const svg = renderBoardSvg(baseDescriptor(START_FEN), { geometry, t: 0 });
    expect(svg).not.toMatch(BADGE_STROKE_PATTERN);
  });

  it("renders a move-quality badge circle+glyph at the destination square when present", () => {
    const descriptor: SceneDescriptor = {
      ...baseDescriptor(START_FEN),
      moveQualityBadge: { square: "e4", tier: "blunder", glyph: "??" },
    };
    const svg = renderBoardSvg(descriptor, { geometry, t: 0 });
    expect(svg).toMatch(BADGE_STROKE_PATTERN);
    expect(svg).toContain(">??</text>");
  });

  it("colors the badge differently per quality tier", () => {
    const colorFor = (
      tier: "blunder" | "mistake" | "inaccuracy" | "great" | "brilliant",
    ): string => {
      const svg = renderBoardSvg(
        { ...baseDescriptor(START_FEN), moveQualityBadge: { square: "e4", tier, glyph: "x" } },
        { geometry, t: 0 },
      );
      return /<circle[^>]*fill="(#[0-9A-Fa-f]{6})"[^>]*stroke="#F6F3EC"/.exec(svg)![1]!;
    };
    const colors = new Set(
      (["blunder", "mistake", "inaccuracy", "great", "brilliant"] as const).map((tier) =>
        colorFor(tier),
      ),
    );
    expect(colors.size).toBe(5); // all five tiers get a visually distinct color
  });

  it("shifts rank coordinate labels further left to avoid the evaluation bar when both are shown", () => {
    const withoutBar = renderBoardSvg(baseDescriptor(START_FEN), {
      geometry,
      t: 0,
      coordinates: true,
    });
    const withBar = renderBoardSvg(
      {
        ...baseDescriptor(START_FEN),
        evaluation: { display: "+1.0", perspective: "white", barFraction: 0.6 },
      },
      { geometry, t: 0, coordinates: true },
    );
    const rankLabelX = (svg: string): number =>
      Number(/<text x="(-?[\d.]+)" y="[-\d.]+"[^>]*>1<\/text>/.exec(svg)![1]);
    // Further left (more negative) once the bar reserves its own space.
    expect(rankLabelX(withBar)).toBeLessThan(rankLabelX(withoutBar));
  });
});

describe("renderOverlayHtml", () => {
  it("renders title/subtitle/prompt/countdown/evaluation/moveLabel when present", () => {
    const descriptor: SceneDescriptor = {
      ...baseDescriptor(START_FEN),
      title: { text: "FIND THE BEST MOVE" },
      subtitle: { text: "WHITE TO MOVE" },
      countdown: { value: 3 },
      evaluation: { display: "M3", perspective: "white", barFraction: 1 },
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
