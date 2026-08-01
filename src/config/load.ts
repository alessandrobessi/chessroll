import { extname } from "node:path";
import { readFile } from "node:fs/promises";
import { loadFen } from "../chess/fen.js";
import type { Side } from "../chess/types.js";
import { CliArgumentError, InputNotFoundError } from "../utils/errors.js";
import { defaultOutputPath } from "../utils/paths.js";
import { DEFAULTS } from "./defaults.js";

export interface CliFlags {
  input?: string;
  fen?: string;
  output?: string;
  template?: string;
  orientation?: "white" | "black" | "auto";
  fps?: number;
  width?: number;
  height?: number;
  engine?: string;
  depth?: number;
  nodes?: number;
  threads?: number;
  hash?: number;
  multipv?: number;
  countdown?: number;
  showEval?: boolean;
  coordinates?: boolean;
  keepTemp?: boolean;
  cache?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface RenderOptions {
  fen: string;
  sideToMove: Side;
  template: "puzzle";
  output: string;
  orientation: "white" | "black" | "auto";
  width: number;
  height: number;
  fps: number;
  engine?: string;
  depth?: number;
  nodes?: number;
  threads: number;
  hashMb: number;
  multiPv: number;
  countdownSeconds: number;
  showEval: boolean;
  coordinates: boolean;
  keepTemp: boolean;
  cache: boolean;
  verbose: boolean;
  quiet: boolean;
}

async function resolveFenSource(flags: CliFlags): Promise<{ raw: string; sourcePath?: string }> {
  if (flags.fen !== undefined && flags.input !== undefined) {
    throw new CliArgumentError("Specify either an input file or --fen, not both");
  }
  if (flags.fen !== undefined) {
    return { raw: flags.fen };
  }
  if (flags.input === undefined) {
    throw new CliArgumentError('Missing input: pass a .fen file path or --fen "<FEN>"');
  }

  const ext = extname(flags.input).toLowerCase();
  if (ext === ".pgn") {
    throw new CliArgumentError(
      "The puzzle template takes a FEN position, not a PGN game. Pass a .fen file or --fen.",
    );
  }

  let raw: string;
  try {
    raw = await readFile(flags.input, "utf8");
  } catch (cause) {
    throw new InputNotFoundError(`Could not read input file "${flags.input}"`, { cause });
  }
  return { raw, sourcePath: flags.input };
}

/** Merges CLI flags with defaults, validating cross-field constraints. */
export async function resolveOptions(flags: CliFlags): Promise<RenderOptions> {
  if (flags.template !== undefined && flags.template !== "puzzle") {
    throw new CliArgumentError(
      `--template ${flags.template} is not implemented in this build yet. Only "puzzle" is available.`,
    );
  }
  if (flags.depth !== undefined && flags.nodes !== undefined) {
    throw new CliArgumentError("Specify only one of --depth or --nodes, not both");
  }

  const { raw, sourcePath } = await resolveFenSource(flags);
  const { fen, sideToMove } = loadFen(raw);

  const output = flags.output ?? defaultOutputPath(sourcePath ?? "position.fen");

  return {
    fen,
    sideToMove,
    template: "puzzle",
    output,
    orientation: flags.orientation ?? DEFAULTS.orientation,
    width: flags.width ?? DEFAULTS.width,
    height: flags.height ?? DEFAULTS.height,
    fps: flags.fps ?? DEFAULTS.fps,
    engine: flags.engine,
    depth: flags.nodes === undefined ? (flags.depth ?? DEFAULTS.depth) : undefined,
    nodes: flags.nodes,
    threads: flags.threads ?? DEFAULTS.threads,
    hashMb: flags.hash ?? DEFAULTS.hashMb,
    multiPv: flags.multipv ?? DEFAULTS.multiPv,
    countdownSeconds: flags.countdown ?? DEFAULTS.countdownSeconds,
    showEval: flags.showEval ?? DEFAULTS.showEval,
    coordinates: flags.coordinates ?? DEFAULTS.coordinates,
    keepTemp: flags.keepTemp ?? DEFAULTS.keepTemp,
    cache: flags.cache ?? DEFAULTS.cache,
    verbose: flags.verbose ?? DEFAULTS.verbose,
    quiet: flags.quiet ?? DEFAULTS.quiet,
  };
}
