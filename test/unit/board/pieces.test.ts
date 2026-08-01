import { describe, expect, it } from "vitest";
import {
  PIECE_SHAPES,
  pieceTypeFromSymbol,
  renderPiece,
  type PieceType,
} from "../../../src/board/pieces.js";

const ALL_TYPES: PieceType[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];

describe("PIECE_SHAPES", () => {
  it("defines a non-empty shape list for all 6 piece types", () => {
    for (const type of ALL_TYPES) {
      expect(PIECE_SHAPES[type].length).toBeGreaterThan(0);
    }
  });
});

describe("pieceTypeFromSymbol", () => {
  it("maps every chess.js piece symbol to a PieceType", () => {
    expect(pieceTypeFromSymbol("p")).toBe("pawn");
    expect(pieceTypeFromSymbol("n")).toBe("knight");
    expect(pieceTypeFromSymbol("b")).toBe("bishop");
    expect(pieceTypeFromSymbol("r")).toBe("rook");
    expect(pieceTypeFromSymbol("q")).toBe("queen");
    expect(pieceTypeFromSymbol("k")).toBe("king");
  });
});

describe("renderPiece", () => {
  it("renders a positioned, scaled, non-empty SVG group for every type/color", () => {
    for (const type of ALL_TYPES) {
      for (const color of ["white", "black"] as const) {
        const markup = renderPiece({ type, color }, { x: 10, y: 20, size: 50 });
        expect(markup).toContain("<g");
        expect(markup).toContain("translate(10 20) scale(0.5)");
        expect(markup).not.toContain("undefined");
        expect(markup).not.toContain("NaN");
      }
    }
  });

  it("gives white pieces a stroke and black pieces none", () => {
    const white = renderPiece({ type: "king", color: "white" }, { x: 0, y: 0, size: 100 });
    const black = renderPiece({ type: "king", color: "black" }, { x: 0, y: 0, size: 100 });
    expect(white).toContain('stroke-width="3"');
    expect(black).toContain('stroke-width="0"');
  });
});
