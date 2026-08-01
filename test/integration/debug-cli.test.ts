import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let workDir: string;
let debugCliPath: string;

beforeAll(async () => {
  // Built inside the project tree (not the OS tmpdir) so Node's module
  // resolution walks up to this project's node_modules — the built file
  // still imports "commander"/"execa"/etc. as external packages, matching
  // scripts/build.mjs's real production build.
  const testTmpRoot = resolve("out", "test-tmp");
  await mkdir(testTmpRoot, { recursive: true });
  workDir = await mkdtemp(join(testTmpRoot, "chessroll-debug-cli-test-"));
  debugCliPath = join(workDir, "debug-cli.js");
  await build({
    entryPoints: [resolve("src/debug-cli.ts")],
    outfile: debugCliPath,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    packages: "external",
  });
}, 30_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("chessroll-debug", () => {
  it("--dump-game on a .fen input dumps a degenerate zero-ply game", async () => {
    const outPath = join(workDir, "game-from-fen.json");
    await execa("node", [
      debugCliPath,
      resolve("test/fixtures/puzzle.fen"),
      "--dump-game",
      outPath,
    ]);
    const dumped = JSON.parse(await readFile(outPath, "utf8")) as {
      initialFen: string;
      sideToMove: string;
      plies: unknown[];
    };
    expect(dumped.initialFen).toBe("6k1/8/8/8/8/8/R7/K6R w - - 0 1");
    expect(dumped.sideToMove).toBe("white");
    expect(dumped.plies).toEqual([]);
  });

  it("--dump-game on a .pgn input dumps the full normalized game", async () => {
    const outPath = join(workDir, "game-from-pgn.json");
    await execa("node", [
      debugCliPath,
      resolve("test/fixtures/simple.pgn"),
      "--dump-game",
      outPath,
    ]);
    const dumped = JSON.parse(await readFile(outPath, "utf8")) as { plies: unknown[] };
    expect(dumped.plies.length).toBeGreaterThan(0);
  });

  it("--analyze runs Stockfish and dumps a normalized PositionAnalysis", async () => {
    const outPath = join(workDir, "analysis.json");
    await execa("node", [
      debugCliPath,
      resolve("test/fixtures/puzzle.fen"),
      "--analyze",
      "--depth",
      "12",
      "--output",
      outPath,
    ]);
    const analysis = JSON.parse(await readFile(outPath, "utf8")) as {
      bestMove: string;
      score: { type: string; value: number };
    };
    expect(analysis.bestMove).toBe("a2a7");
    expect(analysis.score).toEqual({ type: "mate", value: 2, perspective: "white" });
  }, 20_000);

  it("rejects a .pgn input for --analyze (puzzle-scope limitation)", async () => {
    await expect(
      execa("node", [
        debugCliPath,
        resolve("test/fixtures/simple.pgn"),
        "--analyze",
        "--output",
        join(workDir, "unused.json"),
      ]),
    ).rejects.toMatchObject({ exitCode: 2 });
  });

  it("exits 2 when no action flag is given", async () => {
    await expect(
      execa("node", [debugCliPath, resolve("test/fixtures/puzzle.fen")]),
    ).rejects.toMatchObject({ exitCode: 2 });
  });
});
