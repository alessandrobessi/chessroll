import { cp, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAutoOptions } from "../../src/config/load.js";
import { renderAutoVideos } from "../../src/index.js";
import { probeVideo } from "../../src/video/probe.js";
import { findExecutable } from "../../src/utils/process.js";

/**
 * auto-template acceptance gate: `chessroll test/fixtures/replay-game.pgn
 * --template auto` end to end (real Stockfish, real Chromium, real
 * ffmpeg) — the fixture has a real, already-verified blunder
 * (14.Qxb6??, see test/integration/replay.test.ts), so this confirms
 * auto produces at least a replay and a blunder video, both valid MP4s,
 * inside its own output directory.
 */
describe("Gate: chessroll test/fixtures/replay-game.pgn --template auto", () => {
  let outputDir: string;

  beforeAll(async () => {
    await build({
      entryPoints: [resolve("renderer/renderer.ts")],
      outfile: resolve("renderer/dist/renderer.js"),
      bundle: true,
      platform: "browser",
      target: "es2022",
      format: "iife",
    });
    await cp(resolve("renderer/index.html"), resolve("renderer/dist/index.html"));
    await cp(resolve("renderer/renderer.css"), resolve("renderer/dist/renderer.css"));

    outputDir = resolve("out", "gate-auto");
    await rm(outputDir, { recursive: true, force: true });

    const options = await resolveAutoOptions({
      input: resolve("test/fixtures/replay-game.pgn"),
      template: "auto",
      output: outputDir,
      depth: 12, // fast, not forensic — matches the rest of the e2e suite
      showEval: true,
    });

    await renderAutoVideos(options);
  }, 180_000);

  afterAll(async () => {
    await rm(resolve("renderer/dist"), { recursive: true, force: true });
  });

  it("writes replay.mp4 and at least one blunder-*.mp4 into the output directory", async () => {
    const files = await readdir(outputDir);
    expect(files).toContain("replay.mp4");
    expect(files.some((name) => name.startsWith("blunder-"))).toBe(true);
  });

  it("produces only validated 1080x1920 30fps h264/yuv420p MP4s", async () => {
    const ffprobePath = await findExecutable("ffprobe", { installHint: "brew install ffmpeg" });
    const files = (await readdir(outputDir)).filter((name) => name.endsWith(".mp4"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const probe = await probeVideo(ffprobePath, resolve(outputDir, file));
      expect(probe.width).toBe(1080);
      expect(probe.height).toBe(1920);
      expect(probe.fps).toBeCloseTo(30, 5);
      expect(probe.codec).toBe("h264");
      expect(probe.pixFmt).toBe("yuv420p");
    }
  }, 60_000);
});
