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
import { buildGame60Story } from "../../src/story/game60.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";

/**
 * game60-template acceptance gate, mirroring replay's shape:
 * `chessroll test/fixtures/game60-game.pgn --template game60 --target 20`
 * end to end (real Stockfish, real Chromium, real ffmpeg). A tight
 * --target is used deliberately — the fixture's own unscaled pacing
 * (~33s) fits comfortably under the 60s default, so a tight target is
 * what actually exercises the compression this template exists for.
 */
describe("Gate: chessroll test/fixtures/game60-game.pgn --template game60", () => {
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
    outputPath = resolve(outRoot, "gate-game60.mp4");

    const options = await resolveOptions({
      input: resolve("test/fixtures/game60-game.pgn"),
      template: "game60",
      target: 20,
      output: outputPath,
      showEval: true,
      depth: 10,
    });

    await renderVideo(options);

    const binaryPath = await findExecutable("stockfish", {
      installHint: "brew install stockfish",
    });
    engine = await StockfishEngine.start({ binaryPath });
  }, 120_000);

  afterAll(async () => {
    await engine.quit();
    await rm(resolve("renderer/dist"), { recursive: true, force: true });
  });

  it("produces a validated 1080x1920 30fps h264/yuv420p MP4 close to the 20s target", async () => {
    const ffprobePath = await findExecutable("ffprobe", { installHint: "brew install ffmpeg" });
    const probe = await probeVideo(ffprobePath, outputPath);
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
    expect(probe.fps).toBeCloseTo(30, 5);
    expect(probe.codec).toBe("h264");
    expect(probe.pixFmt).toBe("yuv420p");
    expect(probe.duration).toBeCloseTo(20, 0);
    expect(probe.hasAudio).toBe(true);
    expect(probe.audioCodec).toBe("aac");
  }, 30_000);

  it("shows the compact player header from t=0 and highlights the critical blunder", async () => {
    const game = loadPgn(await readFile(resolve("test/fixtures/game60-game.pgn"), "utf8"));
    const analyses = await analyzeGame(engine, game, { depth: 10 });
    const timeline = buildGame60Story(game, analyses, { targetSeconds: 20, showEval: true });

    const rendererDir = (await createTempDir({ prefix: "chessroll-gate-game60-check" })).path;
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
      await renderAtTime(0);
      const title0 = await session.page.locator("#overlay-root .title--compact").textContent();
      expect(title0).toBe("C. Ibarra (2210) vs D. Solheim (2190)");

      const critical = timeline.segments.find((s) => s.state.moveLabel?.text === "18. Bg6??");
      expect(critical).toBeDefined();
      await renderAtTime((critical!.start + critical!.end) / 2);
      const highlightCount = await session.page.locator('#board-root rect[opacity="0.35"]').count();
      expect(highlightCount).toBe(2);
      const moveLabel = await session.page.locator("#overlay-root .move-label").textContent();
      expect(moveLabel).toBe("18. Bg6??");
      // The move-quality badge circle, rendered directly on the board SVG —
      // scoped to its own distinctive stroke (the cburnett piece set also
      // draws plain <circle> elements, e.g. knight eyes).
      const badgeCount = await session.page.locator('#board-root circle[stroke="#F6F3EC"]').count();
      expect(badgeCount).toBe(1);
    } finally {
      await session.close();
      await rm(rendererDir, { recursive: true, force: true });
    }
  }, 120_000);
});
