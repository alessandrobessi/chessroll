import { Command, CommanderError } from "commander";
import pc from "picocolors";
import { resolveOptions } from "./config/load.js";
import { renderVideo } from "./index.js";
import { ChessrollError } from "./utils/errors.js";

function parseIntArg(flagName: string): (value: string) => number {
  return (value: string): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      throw new CommanderError(2, "commander.invalidArgument", `${flagName} expects an integer`);
    }
    return parsed;
  };
}

const program = new Command();
program.exitOverride();

program
  .name("chessroll")
  .description("Turn PGN/FEN chess content into deterministic short-form videos")
  .version("0.0.0")
  .argument("[input]", "path to a .fen file (puzzle) or .pgn file (blunder, brilliant)")
  .option("--fen <fen>", "inline FEN string, instead of an input file (puzzle only)")
  .option("-o, --output <path>", "output MP4 path")
  .option(
    "--template <name>",
    'content template: "puzzle" (default, needs FEN), "blunder" or "brilliant" (need PGN)',
  )
  .option(
    "--move <n>",
    "1-based ply to force the featured move, instead of auto-detecting (blunder/brilliant only)",
    parseIntArg("--move"),
  )
  .option("--orientation <side>", "white | black | auto")
  .option("--fps <n>", "frames per second", parseIntArg("--fps"))
  .option("--width <px>", "output width", parseIntArg("--width"))
  .option("--height <px>", "output height", parseIntArg("--height"))
  .option("--engine <path>", "path to the Stockfish binary")
  .option("--depth <n>", "search depth", parseIntArg("--depth"))
  .option("--nodes <n>", "search node limit", parseIntArg("--nodes"))
  .option("--threads <n>", "engine threads", parseIntArg("--threads"))
  .option("--hash <mb>", "engine hash size (MB)", parseIntArg("--hash"))
  .option("--multipv <n>", "engine MultiPV", parseIntArg("--multipv"))
  .option("--countdown <seconds>", "puzzle solve countdown", parseIntArg("--countdown"))
  .option("--show-eval", "reveal the evaluation at payoff")
  .option("--no-eval", "never show the evaluation")
  .option("--coordinates", "show board coordinates")
  .option("--no-coordinates", "hide board coordinates")
  .option("--keep-temp", "keep the temporary frame directory")
  .option("--no-cache", "bypass the analysis cache")
  .option("--verbose", "verbose logging")
  .option("--quiet", "suppress non-error output")
  .action(async (input: string | undefined, cliOptions: Record<string, unknown>) => {
    // --show-eval and --no-eval are two independent flags per the CLI
    // contract (not a commander auto-negation pair): --show-eval wins if
    // both are somehow passed, --no-eval forces false, otherwise
    // undefined so DEFAULTS.showEval (false) applies.
    const showEval =
      cliOptions.showEval === true ? true : cliOptions.eval === false ? false : undefined;

    const options = await resolveOptions({
      input,
      fen: cliOptions.fen as string | undefined,
      output: cliOptions.output as string | undefined,
      template: cliOptions.template as string | undefined,
      move: cliOptions.move as number | undefined,
      orientation: cliOptions.orientation as "white" | "black" | "auto" | undefined,
      fps: cliOptions.fps as number | undefined,
      width: cliOptions.width as number | undefined,
      height: cliOptions.height as number | undefined,
      engine: cliOptions.engine as string | undefined,
      depth: cliOptions.depth as number | undefined,
      nodes: cliOptions.nodes as number | undefined,
      threads: cliOptions.threads as number | undefined,
      hash: cliOptions.hash as number | undefined,
      multipv: cliOptions.multipv as number | undefined,
      countdown: cliOptions.countdown as number | undefined,
      showEval,
      coordinates: cliOptions.coordinates as boolean | undefined,
      keepTemp: cliOptions.keepTemp as boolean | undefined,
      cache: cliOptions.cache as boolean | undefined,
      verbose: cliOptions.verbose as boolean | undefined,
      quiet: cliOptions.quiet as boolean | undefined,
    });

    if (!options.quiet) {
      console.log(pc.dim(`Rendering ${options.template} -> ${options.output}`));
    }

    const result = await renderVideo(options);

    if (!options.quiet) {
      console.log(
        pc.green(
          `Wrote ${result.outputPath} (${result.frameCount} frames, ${result.durationSeconds.toFixed(1)}s)`,
        ),
      );
    }
  });

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
