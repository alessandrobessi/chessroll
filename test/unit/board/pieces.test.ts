import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  pieceTypeFromSymbol,
  renderPiece,
  type PieceColor,
  type PieceType,
} from "../../../src/board/pieces.js";

const ALL_TYPES: PieceType[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];
const ALL_COLORS: PieceColor[] = ["white", "black"];

const VENDORED_FILE: Record<PieceType, Record<PieceColor, string>> = {
  pawn: { white: "wP.svg", black: "bP.svg" },
  knight: { white: "wN.svg", black: "bN.svg" },
  bishop: { white: "wB.svg", black: "bB.svg" },
  rook: { white: "wR.svg", black: "bR.svg" },
  queen: { white: "wQ.svg", black: "bQ.svg" },
  king: { white: "wK.svg", black: "bK.svg" },
};

function vendoredInnerMarkup(file: string): string {
  const raw = readFileSync(
    new URL(`../../../renderer/assets/pieces/cburnett/${file}`, import.meta.url),
    "utf8",
  ).trim();
  return raw.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
}

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
  it("renders a positioned, scaled (viewBox 45), non-empty SVG group for every type/color", () => {
    for (const type of ALL_TYPES) {
      for (const color of ALL_COLORS) {
        const markup = renderPiece({ type, color }, { x: 10, y: 20, size: 45 });
        expect(markup).toContain("<g");
        expect(markup).toContain("translate(10 20) scale(1)");
        expect(markup).not.toContain("undefined");
        expect(markup).not.toContain("NaN");
      }
    }
  });

  it("scales relative to the cburnett 45x45 viewBox", () => {
    const markup = renderPiece({ type: "king", color: "white" }, { x: 0, y: 0, size: 90 });
    expect(markup).toContain("scale(2)");
  });

  it("embeds exactly the vendored cburnett SVG markup, unmodified (renderer/assets/pieces/cburnett/)", () => {
    for (const type of ALL_TYPES) {
      for (const color of ALL_COLORS) {
        const expected = vendoredInnerMarkup(VENDORED_FILE[type][color]);
        const markup = renderPiece({ type, color }, { x: 0, y: 0, size: 45 });
        expect(markup).toContain(expected);
      }
    }
  });

  it("white pieces carry an explicit white fill; black pieces rely on the default black fill", () => {
    for (const type of ALL_TYPES) {
      const white = renderPiece({ type, color: "white" }, { x: 0, y: 0, size: 45 });
      const black = renderPiece({ type, color: "black" }, { x: 0, y: 0, size: 45 });
      expect(white).toContain('fill="#fff"');
      expect(black).not.toContain('fill="#fff"');
    }
  });
});
