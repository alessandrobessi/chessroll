import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadFen } from "../../../src/chess/fen.js";
import { InvalidChessInputError } from "../../../src/utils/errors.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8").trim();
}

describe("loadFen", () => {
  it("accepts a valid FEN and reports white to move", () => {
    const result = loadFen(fixture("puzzle.fen"));
    expect(result.sideToMove).toBe("white");
  });

  it("accepts a valid FEN and reports black to move", () => {
    const result = loadFen(fixture("mate.fen"));
    expect(result.sideToMove).toBe("black");
  });

  it("rejects a malformed FEN", () => {
    expect(() => loadFen("not-a-fen")).toThrow(InvalidChessInputError);
  });

  it("rejects a FEN missing a king", () => {
    expect(() => loadFen("8/8/8/8/8/8/8/4K3 w - - 0 1")).toThrow(InvalidChessInputError);
  });

  it("rejects a FEN where the side not on move is already in check", () => {
    // White rook on e2 checks the black king on e8 down the open e-file,
    // but it is White to move — this position could never arise legally.
    expect(() => loadFen("4k3/8/8/8/8/8/4R3/4K3 w - - 0 1")).toThrow(InvalidChessInputError);
  });
});
