import { CliArgumentError, EngineAnalysisError } from "../utils/errors.js";
import { UciProcess } from "./uci.js";

export interface StockfishStartOptions {
  binaryPath: string;
  threads?: number;
  hashMb?: number;
  multiPv?: number;
}

export interface AnalyzeOptions {
  fen: string;
  depth?: number;
  nodes?: number;
}

export interface RawScore {
  type: "cp" | "mate";
  value: number;
}

interface RawInfoLine {
  multipv?: number;
  score: RawScore;
  pv: string[];
}

export interface RawAnalysis {
  engineVersion: string;
  bestMove: string;
  ponderMove?: string;
  /** Final info line per MultiPV rank, still side-to-move-relative. */
  lines: RawInfoLine[];
}

function parseInfoLine(line: string): RawInfoLine | undefined {
  const tokens = line.split(/\s+/);
  let multipv: number | undefined;
  let score: RawScore | undefined;
  let pv: string[] | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "multipv") {
      multipv = Number(tokens[++i]);
    } else if (token === "score") {
      const type = tokens[++i];
      const value = Number(tokens[++i]);
      if (type === "cp" || type === "mate") score = { type, value };
    } else if (token === "pv") {
      pv = tokens.slice(i + 1);
      break;
    }
  }

  if (!score || !pv || pv.length === 0) return undefined;
  return { multipv, score, pv };
}

/**
 * A running Stockfish process implementing the UCI lifecycle from
 * BLUEPRINT.md §5: uci/uciok -> setoption -> isready/readyok, then repeated
 * position/go/info/bestmove analysis requests.
 */
export class StockfishEngine {
  private constructor(
    private readonly proc: UciProcess,
    readonly engineVersion: string,
    readonly multiPv: number,
  ) {}

  static async start(options: StockfishStartOptions): Promise<StockfishEngine> {
    const proc = await UciProcess.spawn(options.binaryPath);

    let engineVersion = "unknown";
    const unsubscribe = proc.onLine((line) => {
      const match = /^id name (.+)$/.exec(line);
      if (match) engineVersion = match[1]!;
    });
    proc.send("uci");
    await proc.waitForLine((line) => line === "uciok", 10_000);
    unsubscribe();

    if (options.threads) {
      proc.send(`setoption name Threads value ${options.threads}`);
    }
    if (options.hashMb) {
      proc.send(`setoption name Hash value ${options.hashMb}`);
    }
    const multiPv = options.multiPv ?? 1;
    proc.send(`setoption name MultiPV value ${multiPv}`);

    proc.send("isready");
    await proc.waitForLine((line) => line === "readyok", 10_000);

    return new StockfishEngine(proc, engineVersion, multiPv);
  }

  async analyze(options: AnalyzeOptions): Promise<RawAnalysis> {
    if ((options.depth === undefined) === (options.nodes === undefined)) {
      throw new CliArgumentError("Specify exactly one of depth or nodes for analysis");
    }

    this.proc.send(`position fen ${options.fen}`);
    const goCommand =
      options.depth !== undefined ? `go depth ${options.depth}` : `go nodes ${options.nodes}`;

    const latestByRank = new Map<number, RawInfoLine>();
    const unsubscribe = this.proc.onLine((line) => {
      if (!line.startsWith("info ")) return;
      const parsed = parseInfoLine(line);
      if (parsed) latestByRank.set(parsed.multipv ?? 1, parsed);
    });

    this.proc.send(goCommand);
    let bestMoveLine: string;
    try {
      bestMoveLine = await this.proc.waitForLine((line) => line.startsWith("bestmove"), 120_000);
    } finally {
      unsubscribe();
    }

    const match = /^bestmove (\S+)(?: ponder (\S+))?/.exec(bestMoveLine);
    if (!match) {
      throw new EngineAnalysisError(`Malformed bestmove line: "${bestMoveLine}"`);
    }

    const lines = [...latestByRank.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
    if (lines.length === 0) {
      throw new EngineAnalysisError(
        `Engine produced no usable info lines before bestmove for FEN "${options.fen}"`,
      );
    }

    return {
      engineVersion: this.engineVersion,
      bestMove: match[1]!,
      ponderMove: match[2],
      lines,
    };
  }

  async quit(): Promise<void> {
    await this.proc.quit();
  }
}
