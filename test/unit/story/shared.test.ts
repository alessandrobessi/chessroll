import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { applyUciMove } from "../../../src/chess/game.js";
import {
  classifyMoveCategory,
  formatPlayer,
  headerFor,
  moveNumberLabel,
} from "../../../src/story/shared.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";

function analysis(fen: string, whitePerspectiveCp: number): PositionAnalysis {
  return {
    fen,
    engineVersion: "test",
    depth: 12,
    bestMove: "",
    score: { type: "cp", value: whitePerspectiveCp, perspective: "white" },
    pv: [],
    multipv: [],
  };
}

describe("formatPlayer", () => {
  it("uses the name as-is when present, with Elo appended if given", () => {
    expect(formatPlayer("Carlsen", 2850, "White")).toBe("Carlsen (2850)");
    expect(formatPlayer("Carlsen", undefined, "White")).toBe("Carlsen");
  });

  it("falls back when the name is undefined or chess.js's '?' placeholder", () => {
    expect(formatPlayer(undefined, undefined, "White")).toBe("White");
    expect(formatPlayer("?", undefined, "White")).toBe("White");
    expect(formatPlayer("?", 2000, "White")).toBe("White (2000)");
  });
});

describe("headerFor", () => {
  it("builds a 'White vs Black' title and omits subtitle when there's no event", () => {
    const header = headerFor({ white: "Carlsen", black: "Nepo" });
    expect(header.title).toBe("Carlsen vs Nepo");
    expect(header.subtitle).toBeUndefined();
  });

  it("includes the event as subtitle when present and not the '?' placeholder", () => {
    expect(headerFor({ event: "World Championship" }).subtitle).toBe("World Championship");
    expect(headerFor({ event: "?" }).subtitle).toBeUndefined();
  });
});

describe("moveNumberLabel", () => {
  it("formats white as 'N.' and black as 'N...'", () => {
    const chess = new Chess();
    const white = applyUciMove(chess, "e2e4", 0);
    const black = applyUciMove(chess, "e7e5", 1);
    expect(moveNumberLabel(white)).toBe("1.");
    expect(moveNumberLabel(black)).toBe("1...");
  });
});

describe("classifyMoveCategory", () => {
  const chess = new Chess();
  const quietPly = applyUciMove(chess, "e2e4", 0);

  it("classifies a small swing as quiet", () => {
    const result = classifyMoveCategory(
      quietPly,
      analysis(quietPly.fenBefore, 0),
      analysis(quietPly.fenAfter, 10),
    );
    expect(result.category).toBe("quiet");
    expect(result.swing).toBeCloseTo(10, 5);
  });

  it("classifies a >=150cp swing as 'swing'", () => {
    const result = classifyMoveCategory(
      quietPly,
      analysis(quietPly.fenBefore, 0),
      analysis(quietPly.fenAfter, 200),
    );
    expect(result.category).toBe("swing");
  });

  it("classifies a >=300cp swing as 'critical', with the correct sign", () => {
    const good = classifyMoveCategory(
      quietPly,
      analysis(quietPly.fenBefore, 0),
      analysis(quietPly.fenAfter, 400),
    );
    expect(good.category).toBe("critical");
    expect(good.swing).toBeGreaterThan(0);

    const bad = classifyMoveCategory(
      quietPly,
      analysis(quietPly.fenBefore, 400),
      analysis(quietPly.fenAfter, 0),
    );
    expect(bad.category).toBe("critical");
    expect(bad.swing).toBeLessThan(0);
  });

  it("treats a mate as critical even with a tiny/negative computed swing", () => {
    const mateChess = new Chess("6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1");
    const matePly = applyUciMove(mateChess, "e1e8", 0);
    const result = classifyMoveCategory(
      matePly,
      analysis(matePly.fenBefore, 50),
      analysis(matePly.fenAfter, 40),
    );
    expect(result.category).toBe("critical");
  });
});
