import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveOptions,
  type PuzzleRenderOptions,
  type RenderOptions,
} from "../../../src/config/load.js";
import { CliArgumentError, InputNotFoundError } from "../../../src/utils/errors.js";

const PUZZLE_FEN = "6k1/8/8/8/8/8/R7/K6R w - - 0 1";

function expectPuzzle(options: RenderOptions): asserts options is PuzzleRenderOptions {
  if (options.template !== "puzzle") {
    throw new Error(`expected a puzzle template, got "${options.template}"`);
  }
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "chessroll-load-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("resolveOptions", () => {
  it("resolves a FEN passed inline via --fen, with defaults applied", async () => {
    const options = await resolveOptions({ fen: PUZZLE_FEN });
    expectPuzzle(options);
    expect(options.fen).toBe(PUZZLE_FEN);
    expect(options.sideToMove).toBe("white");
    expect(options.template).toBe("puzzle");
    expect(options.width).toBe(1080);
    expect(options.height).toBe(1920);
    expect(options.fps).toBe(30);
    expect(options.depth).toBe(18);
    expect(options.nodes).toBeUndefined();
    expect(options.output).toBe("position.mp4");
  });

  it("reads a .fen file and derives the default output path from it", async () => {
    const fenPath = join(dir, "mate-in-2.fen");
    await writeFile(fenPath, `${PUZZLE_FEN}\n`, "utf8");
    const options = await resolveOptions({ input: fenPath });
    expectPuzzle(options);
    expect(options.fen).toBe(PUZZLE_FEN);
    expect(options.output).toBe(join(dir, "mate-in-2.mp4"));
  });

  it("rejects specifying both an input file and --fen", async () => {
    await expect(resolveOptions({ input: "x.fen", fen: PUZZLE_FEN })).rejects.toThrow(
      CliArgumentError,
    );
  });

  it("rejects a missing input entirely", async () => {
    await expect(resolveOptions({})).rejects.toThrow(CliArgumentError);
  });

  it("rejects a .pgn input for the puzzle template", async () => {
    await expect(resolveOptions({ input: "game.pgn" })).rejects.toThrow(CliArgumentError);
  });

  it("rejects a nonexistent .fen file with InputNotFoundError", async () => {
    await expect(resolveOptions({ input: join(dir, "missing.fen") })).rejects.toThrow(
      InputNotFoundError,
    );
  });

  it("rejects an unimplemented --template", async () => {
    await expect(resolveOptions({ fen: PUZZLE_FEN, template: "guess" })).rejects.toThrow(
      CliArgumentError,
    );
  });

  it("accepts --template puzzle explicitly", async () => {
    const options = await resolveOptions({ fen: PUZZLE_FEN, template: "puzzle" });
    expect(options.template).toBe("puzzle");
  });

  it("rejects --fen for the blunder template", async () => {
    await expect(resolveOptions({ fen: PUZZLE_FEN, template: "blunder" })).rejects.toThrow(
      CliArgumentError,
    );
  });

  it("rejects a .fen input for the blunder template", async () => {
    await expect(resolveOptions({ input: "position.fen", template: "blunder" })).rejects.toThrow(
      CliArgumentError,
    );
  });

  it("rejects --fen for the replay template", async () => {
    await expect(resolveOptions({ fen: PUZZLE_FEN, template: "replay" })).rejects.toThrow(
      CliArgumentError,
    );
  });

  it("rejects a .fen input for the replay template", async () => {
    await expect(resolveOptions({ input: "position.fen", template: "replay" })).rejects.toThrow(
      CliArgumentError,
    );
  });

  it("resolves a .pgn input for the replay template", async () => {
    const pgnPath = join(dir, "game.pgn");
    await writeFile(pgnPath, "1. e4 e5 2. Nf3 Nc6 *", "utf8");
    const options = await resolveOptions({ input: pgnPath, template: "replay" });
    if (options.template !== "replay") {
      throw new Error(`expected a replay template, got "${options.template}"`);
    }
    expect(options.game.plies).toHaveLength(4);
    expect(options.output).toBe(join(dir, "game.mp4"));
  });

  it("rejects --fen for the game60 template", async () => {
    await expect(resolveOptions({ fen: PUZZLE_FEN, template: "game60" })).rejects.toThrow(
      CliArgumentError,
    );
  });

  it("rejects a .fen input for the game60 template", async () => {
    await expect(resolveOptions({ input: "position.fen", template: "game60" })).rejects.toThrow(
      CliArgumentError,
    );
  });

  it("resolves a .pgn input for the game60 template, defaulting target to 60s", async () => {
    const pgnPath = join(dir, "game.pgn");
    await writeFile(pgnPath, "1. e4 e5 2. Nf3 Nc6 *", "utf8");
    const options = await resolveOptions({ input: pgnPath, template: "game60" });
    if (options.template !== "game60") {
      throw new Error(`expected a game60 template, got "${options.template}"`);
    }
    expect(options.game.plies).toHaveLength(4);
    expect(options.targetSeconds).toBe(60);
  });

  it("propagates a custom --target for game60", async () => {
    const pgnPath = join(dir, "game.pgn");
    await writeFile(pgnPath, "1. e4 e5 2. Nf3 Nc6 *", "utf8");
    const options = await resolveOptions({ input: pgnPath, template: "game60", target: 30 });
    if (options.template !== "game60") {
      throw new Error(`expected a game60 template, got "${options.template}"`);
    }
    expect(options.targetSeconds).toBe(30);
  });

  it("rejects specifying both --depth and --nodes", async () => {
    await expect(resolveOptions({ fen: PUZZLE_FEN, depth: 10, nodes: 1_000_000 })).rejects.toThrow(
      CliArgumentError,
    );
  });

  it("uses --nodes instead of the default depth when given", async () => {
    const options = await resolveOptions({ fen: PUZZLE_FEN, nodes: 1_000_000 });
    expect(options.nodes).toBe(1_000_000);
    expect(options.depth).toBeUndefined();
  });

  it("respects an explicit --output over the derived default", async () => {
    const options = await resolveOptions({ fen: PUZZLE_FEN, output: "custom.mp4" });
    expect(options.output).toBe("custom.mp4");
  });

  it("propagates showEval/countdown/orientation overrides", async () => {
    const options = await resolveOptions({
      fen: PUZZLE_FEN,
      showEval: true,
      countdown: 3,
      orientation: "black",
    });
    expect(options.showEval).toBe(true);
    expect(options.countdownSeconds).toBe(3);
    expect(options.orientation).toBe("black");
  });

  it("defaults sound to true, and --no-sound (sound: false) round-trips", async () => {
    const defaulted = await resolveOptions({ fen: PUZZLE_FEN });
    expect(defaulted.sound).toBe(true);

    const muted = await resolveOptions({ fen: PUZZLE_FEN, sound: false });
    expect(muted.sound).toBe(false);
  });
});
