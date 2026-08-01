import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import pc from "picocolors";
import { loadFen } from "./chess/fen.js";
import { loadPgn } from "./chess/pgn.js";
import { DEFAULTS } from "./config/defaults.js";
import { AnalysisCache } from "./engine/cache.js";
import { analyzePosition } from "./engine/analysis.js";
import { StockfishEngine } from "./engine/stockfish.js";
import { buildPuzzleStory } from "./story/puzzle.js";
import { ChessrollError, CliArgumentError } from "./utils/errors.js";
import { findExecutable } from "./utils/process.js";
import { launchRenderer } from "./video/browser.js";
import { captureSingleFrame } from "./video/frames.js";

/**
 * Debug tooling reuses the exact same pipeline modules as the full CLI
 * (chess loaders, StockfishEngine, buildPuzzleStory, launchRenderer) —
 * inspecting a scene must not require rendering a complete video
 * (AGENTS.md "Debug tools").
 */

function rendererHtmlPath(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  return resolve(here, "..", "renderer", "dist", "index.html");
}

async function readInput(inputPath: string): Promise<{ kind: "fen" | "pgn"; raw: string }> {
  const kind = extname(inputPath).toLowerCase() === ".pgn" ? "pgn" : "fen";
  const raw = await readFile(inputPath, "utf8");
  return { kind, raw };
}

async function withEngine<T>(
  engineFlag: string | undefined,
  fn: (engine: StockfishEngine) => Promise<T>,
): Promise<T> {
  const binaryPath = await findExecutable("stockfish", {
    explicitPath: engineFlag,
    installHint: "brew install stockfish, or pass --engine <path>",
  });
  const engine = await StockfishEngine.start({ binaryPath });
  try {
    return await fn(engine);
  } finally {
    await engine.quit();
  }
}

interface DebugFlags {
  dumpGame?: string;
  analyze?: boolean;
  story?: string;
  template?: string;
  time?: number;
  output?: string;
  engine?: string;
  depth?: number;
  countdown?: number;
}

async function run(input: string, flags: DebugFlags): Promise<void> {
  const { kind, raw } = await readInput(input);

  if (flags.dumpGame) {
    const game =
      kind === "pgn"
        ? loadPgn(raw)
        : (() => {
            const { fen, sideToMove } = loadFen(raw);
            return { initialFen: fen, sideToMove, plies: [] };
          })();
    await writeFile(flags.dumpGame, JSON.stringify(game, null, 2), "utf8");
    console.log(pc.green(`Wrote ${flags.dumpGame}`));
    return;
  }

  if (kind === "pgn") {
    throw new CliArgumentError(
      "--analyze/--story/--time currently only work on a FEN position (puzzle template scope).",
    );
  }

  const { fen, sideToMove } = loadFen(raw);
  const depth = flags.depth ?? DEFAULTS.depth;

  if (flags.analyze) {
    if (!flags.output) throw new CliArgumentError("--analyze requires --output <path>");
    const analysis = await withEngine(flags.engine, (engine) =>
      analyzePosition(engine, {
        fen,
        sideToMove,
        depth,
        cache: new AnalysisCache(),
      }),
    );
    await writeFile(flags.output, JSON.stringify(analysis, null, 2), "utf8");
    console.log(pc.green(`Wrote ${flags.output}`));
    return;
  }

  if (flags.story) {
    if (flags.story !== "puzzle") {
      throw new CliArgumentError(`--story ${flags.story} is not implemented yet. Only "puzzle".`);
    }
    if (!flags.output) throw new CliArgumentError("--story requires --output <path>");
    const timeline = await withEngine(flags.engine, async (engine) => {
      const analysis = await analyzePosition(engine, {
        fen,
        sideToMove,
        depth,
        cache: new AnalysisCache(),
      });
      return buildPuzzleStory(fen, sideToMove, analysis, {
        countdownSeconds: flags.countdown ?? DEFAULTS.countdownSeconds,
        showEval: true,
      });
    });
    await writeFile(flags.output, JSON.stringify(timeline, null, 2), "utf8");
    console.log(pc.green(`Wrote ${flags.output}`));
    return;
  }

  if (flags.time !== undefined) {
    if (flags.template !== "puzzle") {
      throw new CliArgumentError("--time requires --template puzzle (the only one implemented).");
    }
    if (!flags.output) throw new CliArgumentError("--time requires --output <path.png>");
    const timeline = await withEngine(flags.engine, async (engine) => {
      const analysis = await analyzePosition(engine, {
        fen,
        sideToMove,
        depth,
        cache: new AnalysisCache(),
      });
      return buildPuzzleStory(fen, sideToMove, analysis, {
        countdownSeconds: flags.countdown ?? DEFAULTS.countdownSeconds,
        showEval: true,
      });
    });
    const session = await launchRenderer({
      timeline,
      rendererHtmlPath: rendererHtmlPath(),
      width: DEFAULTS.width,
      height: DEFAULTS.height,
    });
    try {
      await captureSingleFrame({ session, t: flags.time, outPath: flags.output });
    } finally {
      await session.close();
    }
    console.log(pc.green(`Wrote ${flags.output}`));
    return;
  }

  throw new CliArgumentError(
    "Specify one of --dump-game <path>, --analyze --output <path>, --story puzzle --output <path>, or --template puzzle --time <t> --output <path.png>",
  );
}

const program = new Command();
program.exitOverride();

program
  .name("chessroll-debug")
  .description("Inspect parsed games, engine analysis, story timelines, or a single rendered frame")
  .argument("<input>", "path to a .pgn or .fen file")
  .option("--dump-game <output>", "dump the normalized chess model as JSON")
  .option("--analyze", "run Stockfish analysis")
  .option("--story <template>", 'build a story timeline JSON (only "puzzle")')
  .option("--template <template>", 'template to use with --time (only "puzzle")')
  .option("--time <seconds>", "render a single frame at this timestamp", (v) =>
    Number.parseFloat(v),
  )
  .option("--output <path>", "output path for the requested artifact")
  .option("--engine <path>", "path to the Stockfish binary")
  .option("--depth <n>", "search depth", (v) => Number.parseInt(v, 10))
  .option("--countdown <n>", "puzzle countdown seconds", (v) => Number.parseInt(v, 10))
  .action(run);

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        process.exit(0);
      }
      console.error(pc.red(error.message));
      process.exit(2);
    }
    if (error instanceof ChessrollError) {
      console.error(pc.red(`Error: ${error.message}`));
      process.exit(error.exitCode);
    }
    console.error(
      pc.red(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`),
    );
    process.exit(1);
  }
}

await main();
