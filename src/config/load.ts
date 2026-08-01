import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { loadFen } from "../chess/fen.js";
import { loadPgn } from "../chess/pgn.js";
import type { ChessGame, Side } from "../chess/types.js";
import { CliArgumentError, InputNotFoundError } from "../utils/errors.js";
import { defaultOutputPath } from "../utils/paths.js";
import { DEFAULTS } from "./defaults.js";

export type TemplateName = "puzzle" | "blunder" | "brilliant" | "replay";

const IMPLEMENTED_TEMPLATES: readonly TemplateName[] = ["puzzle", "blunder", "brilliant", "replay"];

export interface CliFlags {
  input?: string;
  fen?: string;
  output?: string;
  template?: string;
  move?: number;
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
  sound?: boolean;
  keepTemp?: boolean;
  cache?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

interface CommonRenderOptions {
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
  sound: boolean;
  keepTemp: boolean;
  cache: boolean;
  verbose: boolean;
  quiet: boolean;
}

export interface PuzzleRenderOptions extends CommonRenderOptions {
  template: "puzzle";
  fen: string;
  sideToMove: Side;
}

export interface BlunderRenderOptions extends CommonRenderOptions {
  template: "blunder";
  game: ChessGame;
  /** 1-based ply index forcing which move is treated as the blunder, if given. */
  moveOverride?: number;
}

export interface BrilliantRenderOptions extends CommonRenderOptions {
  template: "brilliant";
  game: ChessGame;
  /** 1-based ply index forcing which move is treated as the standout move, if given. */
  moveOverride?: number;
}

export interface ReplayRenderOptions extends CommonRenderOptions {
  template: "replay";
  game: ChessGame;
}

export type RenderOptions =
  PuzzleRenderOptions | BlunderRenderOptions | BrilliantRenderOptions | ReplayRenderOptions;

function resolveTemplate(flags: CliFlags): TemplateName {
  const template = flags.template ?? "puzzle";
  if (!IMPLEMENTED_TEMPLATES.includes(template as TemplateName)) {
    throw new CliArgumentError(
      `--template ${template} is not implemented in this build yet. Available: ${IMPLEMENTED_TEMPLATES.join(", ")}.`,
    );
  }
  return template as TemplateName;
}

async function readInputFile(inputPath: string): Promise<string> {
  try {
    return await readFile(inputPath, "utf8");
  } catch (cause) {
    throw new InputNotFoundError(`Could not read input file "${inputPath}"`, { cause });
  }
}

async function resolveSource(flags: CliFlags): Promise<{ raw: string; sourcePath?: string }> {
  if (flags.fen !== undefined && flags.input !== undefined) {
    throw new CliArgumentError("Specify either an input file or --fen, not both");
  }
  if (flags.fen !== undefined) {
    return { raw: flags.fen };
  }
  if (flags.input === undefined) {
    throw new CliArgumentError('Missing input: pass a .pgn/.fen file path or --fen "<FEN>"');
  }
  return { raw: await readInputFile(flags.input), sourcePath: flags.input };
}

function commonOptions(flags: CliFlags, output: string): CommonRenderOptions {
  return {
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
    sound: flags.sound ?? DEFAULTS.sound,
    keepTemp: flags.keepTemp ?? DEFAULTS.keepTemp,
    cache: flags.cache ?? DEFAULTS.cache,
    verbose: flags.verbose ?? DEFAULTS.verbose,
    quiet: flags.quiet ?? DEFAULTS.quiet,
  };
}

async function resolvePuzzleOptions(flags: CliFlags): Promise<PuzzleRenderOptions> {
  if (flags.input !== undefined && extname(flags.input).toLowerCase() === ".pgn") {
    throw new CliArgumentError(
      "The puzzle template takes a FEN position, not a PGN game. Pass a .fen file or --fen.",
    );
  }
  const { raw, sourcePath } = await resolveSource(flags);
  const { fen, sideToMove } = loadFen(raw);
  const output = flags.output ?? defaultOutputPath(sourcePath ?? "position.fen");
  return { ...commonOptions(flags, output), template: "puzzle", fen, sideToMove };
}

/** Shared input resolution for every PGN-based template (blunder, brilliant, ...). */
async function resolvePgnGame(
  flags: CliFlags,
  templateLabel: string,
): Promise<{ game: ChessGame; output: string }> {
  if (flags.fen !== undefined) {
    throw new CliArgumentError(`The ${templateLabel} template takes a PGN game, not --fen.`);
  }
  if (flags.input === undefined) {
    throw new CliArgumentError("Missing input: pass a .pgn file path");
  }
  if (extname(flags.input).toLowerCase() !== ".pgn") {
    throw new CliArgumentError(`The ${templateLabel} template takes a PGN game (a .pgn file).`);
  }
  const raw = await readInputFile(flags.input);
  const game = loadPgn(raw);
  if (game.plies.length === 0) {
    throw new CliArgumentError(
      `"${flags.input}" contains no moves to analyze for ${templateLabel}.`,
    );
  }
  const output = flags.output ?? defaultOutputPath(flags.input);
  return { game, output };
}

async function resolveBlunderOptions(flags: CliFlags): Promise<BlunderRenderOptions> {
  const { game, output } = await resolvePgnGame(flags, "blunder");
  return { ...commonOptions(flags, output), template: "blunder", game, moveOverride: flags.move };
}

async function resolveBrilliantOptions(flags: CliFlags): Promise<BrilliantRenderOptions> {
  const { game, output } = await resolvePgnGame(flags, "brilliant");
  return {
    ...commonOptions(flags, output),
    template: "brilliant",
    game,
    moveOverride: flags.move,
  };
}

async function resolveReplayOptions(flags: CliFlags): Promise<ReplayRenderOptions> {
  const { game, output } = await resolvePgnGame(flags, "replay");
  return { ...commonOptions(flags, output), template: "replay", game };
}

/** Merges CLI flags with defaults, validating cross-field constraints. */
export async function resolveOptions(flags: CliFlags): Promise<RenderOptions> {
  const template = resolveTemplate(flags);
  if (flags.depth !== undefined && flags.nodes !== undefined) {
    throw new CliArgumentError("Specify only one of --depth or --nodes, not both");
  }

  switch (template) {
    case "puzzle":
      return resolvePuzzleOptions(flags);
    case "blunder":
      return resolveBlunderOptions(flags);
    case "brilliant":
      return resolveBrilliantOptions(flags);
    case "replay":
      return resolveReplayOptions(flags);
  }
}
