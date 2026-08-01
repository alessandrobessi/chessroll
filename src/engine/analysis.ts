import { Chess } from "chess.js";
import { sideToMoveFromFen } from "../chess/fen.js";
import type { ChessGame, Side } from "../chess/types.js";
import type { AnalysisCache, CacheKeyParams } from "./cache.js";
import { normalizeScore } from "./normalize.js";
import type { StockfishEngine } from "./stockfish.js";

export interface EngineScore {
  type: "cp" | "mate";
  value: number;
  perspective: "white";
}

export interface CandidateLine {
  rank: number;
  score: EngineScore;
  moves: string[];
}

export interface PositionAnalysis {
  fen: string;
  engineVersion: string;
  depth?: number;
  nodes?: number;
  bestMove: string;
  score: EngineScore;
  pv: string[];
  multipv: CandidateLine[];
}

export interface AnalyzePositionOptions {
  fen: string;
  sideToMove: Side;
  depth?: number;
  nodes?: number;
  cache?: AnalysisCache;
  /** Bypasses both cache read and write (the CLI's --no-cache). Default true. */
  useCache?: boolean;
}

/**
 * A position with no legal moves (checkmate or stalemate) can't be
 * analyzed by Stockfish in the normal sense: `go depth N` there just
 * returns `bestmove (none)` with no PV at all, not a real evaluation (a
 * raw UCI `score mate 0` for this case is ambiguous — it doesn't carry a
 * sign indicating who actually lost). Since chess.js already tells us the
 * outcome unambiguously, short-circuit before ever asking the engine.
 */
function terminalPositionAnalysis(
  fen: string,
  sideToMove: Side,
  engineVersion: string,
): PositionAnalysis | undefined {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    // The side to move has just been mated — decisive and correctly
    // signed via the same normalizeScore() every other score goes through.
    const score = normalizeScore({ type: "mate", value: -1 }, sideToMove);
    return { fen, engineVersion, bestMove: "", score, pv: [], multipv: [] };
  }
  if (chess.isStalemate()) {
    return {
      fen,
      engineVersion,
      bestMove: "",
      score: { type: "cp", value: 0, perspective: "white" },
      pv: [],
      multipv: [],
    };
  }
  return undefined;
}

/**
 * Runs (or reuses a cached) Stockfish analysis and normalizes the raw,
 * side-to-move-relative scores to White's perspective before anything else
 * in the app sees them.
 */
export async function analyzePosition(
  engine: StockfishEngine,
  options: AnalyzePositionOptions,
): Promise<PositionAnalysis> {
  const { fen, sideToMove, depth, nodes, cache, useCache = true } = options;
  const cacheParams: CacheKeyParams = {
    fen,
    engineVersion: engine.engineVersion,
    depth,
    nodes,
    multiPv: engine.multiPv,
  };

  if (cache && useCache) {
    const cached = await cache.get(cacheParams);
    if (cached) return cached;
  }

  const terminal = terminalPositionAnalysis(fen, sideToMove, engine.engineVersion);
  let analysis: PositionAnalysis;
  if (terminal) {
    analysis = terminal;
  } else {
    const raw = await engine.analyze({ fen, depth, nodes });
    const multipv: CandidateLine[] = raw.lines.map((line) => ({
      rank: line.multipv ?? 1,
      score: normalizeScore(line.score, sideToMove),
      moves: line.pv,
    }));
    const best = multipv.find((line) => line.rank === 1) ?? multipv[0]!;
    analysis = {
      fen,
      engineVersion: raw.engineVersion,
      depth,
      nodes,
      bestMove: raw.bestMove,
      score: best.score,
      pv: best.moves,
      multipv,
    };
  }

  if (cache && useCache) {
    await cache.set(cacheParams, analysis);
  }

  return analysis;
}

export interface AnalyzeGameOptions {
  depth?: number;
  nodes?: number;
  cache?: AnalysisCache;
  useCache?: boolean;
}

/**
 * Analyzes every position along a game: `result[i]` is the analysis of the
 * position BEFORE `game.plies[i]`, so `result.length === game.plies.length
 * + 1` (the last entry is the final position, after the last ply).
 * Positions are analyzed sequentially and each one is independently
 * cacheable, so re-running against the same game/engine/depth is cheap.
 */
export async function analyzeGame(
  engine: StockfishEngine,
  game: ChessGame,
  options: AnalyzeGameOptions,
): Promise<PositionAnalysis[]> {
  const fens = [game.initialFen, ...game.plies.map((ply) => ply.fenAfter)];
  const results: PositionAnalysis[] = [];
  for (const fen of fens) {
    results.push(
      await analyzePosition(engine, {
        fen,
        sideToMove: sideToMoveFromFen(fen),
        depth: options.depth,
        nodes: options.nodes,
        cache: options.cache,
        useCache: options.useCache,
      }),
    );
  }
  return results;
}
