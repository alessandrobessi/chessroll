import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { applyUciMove } from "../../../src/chess/game.js";
import { loadPgn } from "../../../src/chess/pgn.js";
import {
  classifyMoveCategory,
  classifyMoveQuality,
  detectMiss,
  formatAccuracySummary,
  formatPlayer,
  gameAccuracy,
  headerFor,
  isSacrifice,
  moveAccuracy,
  moveNumberLabel,
  moveQualityGlyph,
} from "../../../src/story/shared.js";
import type { PositionAnalysis } from "../../../src/engine/analysis.js";
import type { EngineScore } from "../../../src/engine/analysis.js";

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

  it("appends the year (extracted from PGN's YYYY.MM.DD date) to the event", () => {
    expect(headerFor({ event: "World Championship", date: "2024.03.15" }).subtitle).toBe(
      "World Championship, 2024",
    );
  });

  it("shows just the year when there's no event, and just the event when the date is unknown", () => {
    expect(headerFor({ date: "2024.03.15" }).subtitle).toBe("2024");
    expect(headerFor({ event: "World Championship", date: "????.??.??" }).subtitle).toBe(
      "World Championship",
    );
  });

  it("omits subtitle entirely when neither a real event nor a real date is present", () => {
    expect(headerFor({ date: "????.??.??" }).subtitle).toBeUndefined();
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

describe("isSacrifice", () => {
  // Same fixtures brilliant.ts's own tests already verify against chess.js.
  const SAC_GAME = loadPgn('[SetUp "1"]\n[FEN "6k1/8/8/2p5/8/8/8/B6K w - - 0 1"]\n\n1. Bd4 *');
  const NON_SAC_GAME = loadPgn('[SetUp "1"]\n[FEN "6k1/8/8/2p5/8/8/8/B6K w - - 0 1"]\n\n1. Bc3 *');

  it("is true when the moved piece lands on a square attacked by a lesser (or no) capture", () => {
    expect(isSacrifice(SAC_GAME.plies[0]!)).toBe(true);
  });

  it("is false when the destination square isn't attacked", () => {
    expect(isSacrifice(NON_SAC_GAME.plies[0]!)).toBe(false);
  });
});

describe("moveQualityGlyph", () => {
  it("maps each tier to its standard chess annotation glyph", () => {
    expect(moveQualityGlyph("blunder")).toBe("??");
    expect(moveQualityGlyph("mistake")).toBe("?");
    expect(moveQualityGlyph("inaccuracy")).toBe("?!");
    expect(moveQualityGlyph("great")).toBe("!");
    expect(moveQualityGlyph("brilliant")).toBe("!!");
    expect(moveQualityGlyph("miss")).toBe("⨯");
  });
});

describe("classifyMoveQuality", () => {
  const chess = new Chess();
  const quietPly = applyUciMove(chess, "e2e4", 0);
  const SAC_GAME = loadPgn('[SetUp "1"]\n[FEN "6k1/8/8/2p5/8/8/8/B6K w - - 0 1"]\n\n1. Bd4 *');
  const NON_SAC_GAME = loadPgn('[SetUp "1"]\n[FEN "6k1/8/8/2p5/8/8/8/B6K w - - 0 1"]\n\n1. Bc3 *');

  it("returns undefined below every threshold (matches classifyMoveCategory's quiet/capture/check bands)", () => {
    expect(classifyMoveQuality(quietPly, 0)).toBeUndefined();
    expect(classifyMoveQuality(quietPly, 149)).toBeUndefined();
    expect(classifyMoveQuality(quietPly, -149)).toBeUndefined();
  });

  it("classifies -150..-199 as inaccuracy, -200..-299 as mistake, and <=-300 as blunder", () => {
    expect(classifyMoveQuality(quietPly, -150)).toBe("inaccuracy");
    expect(classifyMoveQuality(quietPly, -199)).toBe("inaccuracy");
    expect(classifyMoveQuality(quietPly, -200)).toBe("mistake");
    expect(classifyMoveQuality(quietPly, -299)).toBe("mistake");
    expect(classifyMoveQuality(quietPly, -300)).toBe("blunder");
    expect(classifyMoveQuality(quietPly, -1000)).toBe("blunder");
  });

  it("classifies a >=150cp positive swing as great, or brilliant when it's also a sacrifice", () => {
    expect(classifyMoveQuality(NON_SAC_GAME.plies[0]!, 150)).toBe("great");
    expect(classifyMoveQuality(SAC_GAME.plies[0]!, 150)).toBe("brilliant");
  });

  it("always classifies a mate-delivering move as brilliant, regardless of swing sign", () => {
    const mateChess = new Chess("6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1");
    const matePly = applyUciMove(mateChess, "e1e8", 0);
    expect(classifyMoveQuality(matePly, -10)).toBe("brilliant");
  });
});

describe("detectMiss", () => {
  // 6 plies: e4(0) e5(1) Nf3(2) Nc6(3) Bc4(4) Bc5(5).
  const GAME = loadPgn("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *");
  const FENS = [GAME.initialFen, ...GAME.plies.map((p) => p.fenAfter)];
  const NF3 = GAME.plies[2]!; // white, the "blunder" that gifts black an opportunity
  const NC6 = GAME.plies[3]!; // black, either takes it or misses it

  function withMultipv(
    fen: string,
    whitePerspectiveCp: number,
    rank1Cp?: number,
  ): PositionAnalysis {
    return {
      fen,
      engineVersion: "test",
      depth: 12,
      bestMove: "",
      score: { type: "cp", value: whitePerspectiveCp, perspective: "white" },
      pv: [],
      multipv:
        rank1Cp === undefined
          ? []
          : [{ rank: 1, score: { type: "cp", value: rank1Cp, perspective: "white" }, moves: [] }],
    };
  }

  it("flags a miss: opponent just blundered, and the mover fell well short of the engine's best line", () => {
    const before = withMultipv(FENS[3]!, -350, -900); // white just blundered to -350; black's best line promises -900 (i.e. +900 for black)
    const after = withMultipv(FENS[4]!, -400); // black only achieved +400
    expect(detectMiss(NC6, before, after, NF3, -350)).toBe(true);
  });

  it("does not flag a miss when the mover's result is close to the engine's best line", () => {
    const before = withMultipv(FENS[3]!, -350, -900);
    const after = withMultipv(FENS[4]!, -880); // +880 for black, only a 20cp gap to the +900 best line
    expect(detectMiss(NC6, before, after, NF3, -350)).toBe(false);
  });

  it("does not flag a miss when the opponent's previous move wasn't a blunder/mistake", () => {
    const before = withMultipv(FENS[3]!, -50, -900); // white's previous swing (-50) doesn't even reach inaccuracy
    const after = withMultipv(FENS[4]!, -100);
    expect(detectMiss(NC6, before, after, NF3, -50)).toBe(false);
  });

  it("does not flag a miss with no previous ply (start of game), or with no multipv data to compare against", () => {
    const before = withMultipv(FENS[3]!, -350, -900);
    const after = withMultipv(FENS[4]!, -400);
    expect(detectMiss(NC6, before, after, undefined, undefined)).toBe(false);
    expect(detectMiss(NC6, withMultipv(FENS[3]!, -350), after, NF3, -350)).toBe(false); // no rank1 line
  });
});

function score(whitePerspectiveCp: number): EngineScore {
  return { type: "cp", value: whitePerspectiveCp, perspective: "white" };
}

describe("moveAccuracy", () => {
  it("is ~100 (the formula's own ceiling) when the mover's win% doesn't drop at all", () => {
    expect(moveAccuracy(score(0), score(50), "white")).toBeCloseTo(100, 1);
    // Black's win% is 100-white's -- a positive white swing is bad for black,
    // so this should NOT be near 100.
    expect(moveAccuracy(score(0), score(200), "black")).toBeLessThan(90);
  });

  it("drops toward 0 as the mover's win% collapses further", () => {
    const small = moveAccuracy(score(0), score(-50), "white");
    const large = moveAccuracy(score(0), score(-800), "white");
    expect(large).toBeLessThan(small);
    expect(large).toBeGreaterThanOrEqual(0);
    expect(small).toBeLessThanOrEqual(100);
  });
});

describe("gameAccuracy / formatAccuracySummary", () => {
  const GAME = loadPgn("1. e4 e5 2. Nf3 Nc6 *");
  const FENS = [GAME.initialFen, ...GAME.plies.map((p) => p.fenAfter)];

  it("averages each side's own moves independently", () => {
    // White plays flawlessly (win% never drops for White); Black always
    // drops win% by handing White a bigger and bigger edge.
    const analyses: PositionAnalysis[] = [
      analysis(FENS[0]!, 0),
      analysis(FENS[1]!, 50), // e4 (white): improves for white
      analysis(FENS[2]!, 200), // e5 (black): big drop for black
      analysis(FENS[3]!, 250), // Nf3 (white): improves for white
      analysis(FENS[4]!, 800), // Nc6 (black): big drop for black
    ];
    const result = gameAccuracy(GAME, analyses);
    expect(result.white).toBeCloseTo(100, 1);
    expect(result.black).toBeLessThan(90);
  });

  it("omits a side with no moves of its own", () => {
    const shortGame = loadPgn("1. e4 *");
    const analyses = [analysis(GAME.initialFen, 0), analysis(shortGame.plies[0]!.fenAfter, 10)];
    const result = gameAccuracy(shortGame, analyses);
    expect(result.white).toBeDefined();
    expect(result.black).toBeUndefined();
  });

  it("formats a 'Name X.X%' line per side present, falling back to White/Black", () => {
    const line = formatAccuracySummary({ white: "Carlsen" }, { white: 94.16, black: 88.7 });
    expect(line).toBe("Carlsen 94.2%   Black 88.7%");
  });

  it("returns undefined when neither side has an accuracy value", () => {
    expect(formatAccuracySummary({}, {})).toBeUndefined();
  });
});
