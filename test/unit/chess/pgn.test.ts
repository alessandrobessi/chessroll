import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPgn } from "../../../src/chess/pgn.js";
import { InvalidChessInputError } from "../../../src/utils/errors.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8");
}

describe("loadPgn", () => {
  it("normalizes captures and a non-mating check", () => {
    const game = loadPgn(fixture("simple.pgn"));
    const captures = game.plies.filter((p) => p.flags.capture);
    const checks = game.plies.filter((p) => p.flags.check && !p.flags.mate);
    expect(captures.length).toBeGreaterThan(0);
    expect(checks.map((p) => p.san)).toContain("Qxd8+");
    expect(game.plies.every((p) => !p.flags.mate)).toBe(true);
  });

  it("flags a kingside castle", () => {
    const game = loadPgn(fixture("castle-kingside.pgn"));
    const castled = game.plies.find((p) => p.flags.castle);
    expect(castled?.san).toBe("O-O");
  });

  it("flags a queenside castle", () => {
    const game = loadPgn(fixture("castle-queenside.pgn"));
    const castled = game.plies.find((p) => p.flags.castle);
    expect(castled?.san).toBe("O-O-O");
  });

  it("flags a queen promotion with check, from a custom FEN header", () => {
    const game = loadPgn(fixture("promotion.pgn"));
    expect(game.initialFen).toBe("7k/P7/1K6/8/8/8/8/8 w - - 0 1");
    const promo = game.plies[0];
    expect(promo?.flags.promotion).toBe(true);
    expect(promo?.flags.check).toBe(true);
    expect(promo?.promotion).toBe("q");
    expect(promo?.uci).toBe("a7a8q");
  });

  it("flags an underpromotion", () => {
    const game = loadPgn(fixture("promotion-underpromotion.pgn"));
    const promo = game.plies[0];
    expect(promo?.flags.promotion).toBe(true);
    expect(promo?.promotion).toBe("n");
    expect(promo?.uci).toBe("a7a8n");
  });

  it("flags an en passant capture", () => {
    const game = loadPgn(fixture("en-passant.pgn"));
    const ep = game.plies.find((p) => p.flags.enPassant);
    expect(ep?.san).toBe("exd6");
    expect(ep?.flags.capture).toBe(true);
  });

  it("assigns correct move numbers and sides", () => {
    const game = loadPgn(fixture("simple.pgn"));
    expect(game.plies[0]).toMatchObject({ moveNumber: 1, side: "white", san: "e4" });
    expect(game.plies[1]).toMatchObject({ moveNumber: 1, side: "black", san: "e5" });
    expect(game.plies[2]).toMatchObject({ moveNumber: 2, side: "white", san: "Nf3" });
  });

  it("rejects invalid PGN", () => {
    expect(() => loadPgn("this is not a pgn { }")).toThrow(InvalidChessInputError);
  });
});
