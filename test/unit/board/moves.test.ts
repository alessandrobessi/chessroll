import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toMoveAnimation } from "../../../src/board/moves.js";
import { applyUciMove } from "../../../src/chess/game.js";
import { loadPgn } from "../../../src/chess/pgn.js";
import { Chess } from "chess.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8");
}

describe("toMoveAnimation", () => {
  it("carries piece/capture info for a plain move", () => {
    const game = loadPgn(fixture("simple.pgn"));
    const firstMove = game.plies[0]!; // 1. e4
    const anim = toMoveAnimation(firstMove);
    expect(anim.from).toBe("e2");
    expect(anim.to).toBe("e4");
    expect(anim.piece).toEqual({ type: "pawn", color: "white" });
    expect(anim.capturedPiece).toBeUndefined();
    expect(anim.secondaryMove).toBeUndefined();
  });

  it("attaches a secondaryMove for kingside castling", () => {
    const game = loadPgn(fixture("castle-kingside.pgn"));
    const castlePly = game.plies.find((p) => p.flags.castle)!;
    const anim = toMoveAnimation(castlePly);
    expect(anim.from).toBe("e1");
    expect(anim.to).toBe("g1");
    expect(anim.secondaryMove).toEqual({
      from: "h1",
      to: "f1",
      piece: { type: "rook", color: "white" },
    });
  });

  it("attaches a secondaryMove for queenside castling", () => {
    const game = loadPgn(fixture("castle-queenside.pgn"));
    const castlePly = game.plies.find((p) => p.flags.castle)!;
    const anim = toMoveAnimation(castlePly);
    expect(anim.from).toBe("e1");
    expect(anim.to).toBe("c1");
    expect(anim.secondaryMove).toEqual({
      from: "a1",
      to: "d1",
      piece: { type: "rook", color: "white" },
    });
  });

  it("sets promotion piece type", () => {
    const game = loadPgn(fixture("promotion.pgn"));
    const anim = toMoveAnimation(game.plies[0]!);
    expect(anim.promotion).toBe("queen");
    expect(anim.piece.type).toBe("pawn");
  });

  it("distinguishes capturedSquare from `to` for en passant", () => {
    const chess = new Chess();
    applyUciMove(chess, "e2e4", 0);
    applyUciMove(chess, "a7a6", 1);
    applyUciMove(chess, "e4e5", 2);
    applyUciMove(chess, "d7d5", 3);
    const ep = applyUciMove(chess, "e5d6", 4);
    const anim = toMoveAnimation(ep);
    expect(anim.to).toBe("d6");
    expect(anim.capturedSquare).toBe("d5");
    expect(anim.capturedPiece).toEqual({ type: "pawn", color: "black" });
  });
});
