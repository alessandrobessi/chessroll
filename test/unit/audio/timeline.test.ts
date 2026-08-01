import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { applyUciMove } from "../../../src/chess/game.js";
import { cueForPly } from "../../../src/audio/timeline.js";

/** Every fixture below is played through chess.js/applyUciMove, never hand-derived flags. */
function ply(fen: string, uci: string) {
  return applyUciMove(new Chess(fen), uci, 0);
}

describe("cueForPly", () => {
  it("resolves a mating move to checkmate, not check", () => {
    const move = ply("6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1", "e1e8");
    expect(move.san).toBe("Re8#");
    expect(move.flags.mate).toBe(true);
    expect(move.flags.check).toBe(true); // every mate is also a check
    expect(cueForPly(move)).toBe("checkmate");
  });

  it("resolves a checking, non-mating move to check", () => {
    const move = ply("6k1/8/8/8/8/8/8/4R1K1 w - - 0 1", "e1e8");
    expect(move.san).toBe("Re8+");
    expect(move.flags.mate).toBe(false);
    expect(move.flags.check).toBe(true);
    expect(cueForPly(move)).toBe("check");
  });

  it("resolves a capturing, non-checking move to capture", () => {
    const move = ply("6k1/8/8/4b3/8/8/8/K3R3 w - - 0 1", "e1e5");
    expect(move.san).toBe("Rxe5");
    expect(move.flags.capture).toBe(true);
    expect(move.flags.check).toBe(false);
    expect(cueForPly(move)).toBe("capture");
  });

  it("resolves a quiet move to move", () => {
    const move = ply("6k1/8/8/8/8/8/8/K3R3 w - - 0 1", "e1e4");
    expect(move.san).toBe("Re4");
    expect(move.flags.capture).toBe(false);
    expect(move.flags.check).toBe(false);
    expect(cueForPly(move)).toBe("move");
  });

  it("prioritizes check over capture when a move is both", () => {
    const move = ply("4k3/8/8/4n3/8/8/8/4R2K w - - 0 1", "e1e5");
    expect(move.san).toBe("Rxe5+");
    expect(move.flags.capture).toBe(true);
    expect(move.flags.check).toBe(true);
    expect(cueForPly(move)).toBe("check");
  });
});
