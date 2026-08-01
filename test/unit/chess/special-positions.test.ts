import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8").trim();
}

describe("special positions", () => {
  it("recognizes checkmate", () => {
    const chess = new Chess(fixture("mate.fen"));
    expect(chess.isCheckmate()).toBe(true);
    expect(chess.inCheck()).toBe(true);
  });

  it("recognizes stalemate", () => {
    const chess = new Chess(fixture("stalemate.fen"));
    expect(chess.isStalemate()).toBe(true);
    expect(chess.inCheck()).toBe(false);
  });
});
