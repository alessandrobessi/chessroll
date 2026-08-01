import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveOptions } from "../../src/config/load.js";
import { renderVideo } from "../../src/index.js";
import { probeVideo } from "../../src/video/probe.js";
import { findExecutable } from "../../src/utils/process.js";
import { launchRenderer } from "../../src/video/browser.js";
import { createTempDir } from "../../src/utils/temp.js";
import { loadPgn } from "../../src/chess/pgn.js";
import { analyzeGame } from "../../src/engine/analysis.js";
import { buildReplayStory } from "../../src/story/replay.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";

/**
 * Replay-template acceptance gate, mirroring blunder/brilliant's shape:
 * `chessroll test/fixtures/replay-game.pgn --template replay` end to end
 * (real Stockfish, real Chromium, real ffmpeg), plus qualitative checks
 * against the live DOM. Unlike the other templates, total duration is
 * emergent from per-move importance weighting over the whole game rather
 * than a fixed phase budget, so it's checked against a plausible range
 * instead of an exact value.
 */
describe("Gate: chessroll test/fixtures/replay-game.pgn --template replay", () => {
  let outputPath: string;
  let engine: StockfishEngine;

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

    const outRoot = resolve("out");
    await mkdir(outRoot, { recursive: true });
    outputPath = resolve(outRoot, "gate-replay.mp4");

    const options = await resolveOptions({
      input: resolve("test/fixtures/replay-game.pgn"),
      template: "replay",
      output: outputPath,
      showEval: true,
    });

    await renderVideo(options);

    const binaryPath = await findExecutable("stockfish", {
      installHint: "brew install stockfish",
    });
    engine = await StockfishEngine.start({ binaryPath });
  }, 90_000);

  afterAll(async () => {
    await engine.quit();
    await rm(resolve("renderer/dist"), { recursive: true, force: true });
  });

  it("produces a validated 1080x1920 30fps h264/yuv420p MP4 with an AAC audio track (sound defaults on)", async () => {
    const ffprobePath = await findExecutable("ffprobe", { installHint: "brew install ffmpeg" });
    const probe = await probeVideo(ffprobePath, outputPath);
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
    expect(probe.fps).toBeCloseTo(30, 5);
    expect(probe.codec).toBe("h264");
    expect(probe.pixFmt).toBe("yuv420p");
    // 32 plies (mostly quiet/capture/check) + one real, verified blunder ->
    // somewhere comfortably in the 15-30s range; not a fixed phase budget
    // like the other templates.
    expect(probe.duration).toBeGreaterThan(15);
    expect(probe.duration).toBeLessThan(30);
    expect(probe.hasAudio).toBe(true);
    expect(probe.audioCodec).toBe("aac");
  }, 30_000);

  it("shows the player header from t=0 and the recorded result only at the outro", async () => {
    const game = loadPgn(await readFile(resolve("test/fixtures/replay-game.pgn"), "utf8"));
    const analyses = await analyzeGame(engine, game, { depth: 12 });
    const timeline = buildReplayStory(game, analyses, { showEval: true });

    const rendererDir = (await createTempDir({ prefix: "chessroll-gate-replay-check" })).path;
    await build({
      entryPoints: [resolve("renderer/renderer.ts")],
      outfile: resolve(rendererDir, "renderer.js"),
      bundle: true,
      platform: "browser",
      target: "es2022",
      format: "iife",
    });
    await cp(resolve("renderer/index.html"), resolve(rendererDir, "index.html"));
    await cp(resolve("renderer/renderer.css"), resolve(rendererDir, "renderer.css"));

    const session = await launchRenderer({
      timeline,
      rendererHtmlPath: resolve(rendererDir, "index.html"),
      width: 1080,
      height: 1920,
    });

    const renderAtTime = async (t: number): Promise<void> => {
      await session.page.evaluate((time: number) => {
        (globalThis as unknown as { renderAtTime: (t: number) => void }).renderAtTime(time);
      }, t);
    };

    try {
      // Header + event visible from the very first frame.
      await renderAtTime(0);
      const title0 = await session.page.locator("#overlay-root .title").textContent();
      expect(title0).toBe("A. Rowan (2100) vs B. Voss (2050)");
      const subtitle0 = await session.page.locator("#overlay-root .subtitle").textContent();
      expect(subtitle0).toBe("Chessroll Fixture Open, 2024");

      // Result never appears before the final (outro) segment.
      await renderAtTime(timeline.duration - 3.5);
      const midTitle = await session.page.locator("#overlay-root .title").textContent();
      expect(midTitle).not.toBe("0-1");

      // The outro shows the real recorded result, emphasized.
      await renderAtTime(timeline.duration);
      const finalTitle = await session.page.locator(".title--emphasis").textContent();
      expect(finalTitle).toBe("0-1");
    } finally {
      await session.close();
      await rm(rendererDir, { recursive: true, force: true });
    }
  }, 90_000);
});
