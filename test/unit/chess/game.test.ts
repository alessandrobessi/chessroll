import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { applyUciMove } from "../../../src/chess/game.js";
import { InvalidChessInputError } from "../../../src/utils/errors.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8").trim();
}

describe("applyUciMove", () => {
  it("applies a legal UCI move and returns a normalized Ply", () => {
    const chess = new Chess(fixture("puzzle.fen"));
    const ply = applyUciMove(chess, "a2a7", 0);
    expect(ply).toMatchObject({
      san: "Ra7",
      uci: "a2a7",
      from: "a2",
      to: "a7",
      side: "white",
    });
    expect(chess.fen()).toBe(ply.fenAfter);
  });

  it("replays a full forced mate line move by move", () => {
    const chess = new Chess(fixture("puzzle.fen"));
    const p1 = applyUciMove(chess, "a2a7", 0);
    const p2 = applyUciMove(chess, "g8f8", 1);
    const p3 = applyUciMove(chess, "h1h8", 2);
    expect(p1.san).toBe("Ra7");
    expect(p2.san).toBe("Kf8");
    expect(p3.san).toBe("Rh8#");
    expect(p3.flags.mate).toBe(true);
    expect(p3.flags.check).toBe(true);
    expect(chess.isCheckmate()).toBe(true);
  });

  it("applies a promotion UCI move", () => {
    const chess = new Chess("7k/P7/1K6/8/8/8/8/8 w - - 0 1");
    const ply = applyUciMove(chess, "a7a8q", 0);
    expect(ply.promotion).toBe("q");
    expect(ply.flags.promotion).toBe(true);
  });

  it("rejects a malformed UCI string", () => {
    const chess = new Chess(fixture("puzzle.fen"));
    expect(() => applyUciMove(chess, "not-a-move", 0)).toThrow(InvalidChessInputError);
  });

  it("rejects an illegal (but well-formed) UCI move", () => {
    const chess = new Chess(fixture("puzzle.fen"));
    // a1 is the white king; a king cannot move to a8.
    expect(() => applyUciMove(chess, "a1a8", 0)).toThrow(InvalidChessInputError);
  });
});
