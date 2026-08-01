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
import { buildBlunderStory, selectBlunder } from "../../src/story/blunder.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";

/**
 * Blunder-template acceptance gate, mirroring BLUEPRINT.md §39/§40's shape
 * for puzzle: `chessroll test/fixtures/blunder-game.pgn --template blunder`
 * end to end (real Stockfish, real Chromium, real ffmpeg), plus qualitative
 * checks against the live DOM.
 */
describe("Gate: chessroll test/fixtures/blunder-game.pgn --template blunder", () => {
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
    outputPath = resolve(outRoot, "gate-blunder.mp4");

    const options = await resolveOptions({
      input: resolve("test/fixtures/blunder-game.pgn"),
      template: "blunder",
      output: outputPath,
      showEval: true,
    });

    await renderVideo(options);

    const binaryPath = await findExecutable("stockfish", {
      installHint: "brew install stockfish",
    });
    engine = await StockfishEngine.start({ binaryPath });
  }, 60_000);

  afterAll(async () => {
    await engine.quit();
    await rm(resolve("renderer/dist"), { recursive: true, force: true });
  });

  it("produces a validated 1080x1920 30fps h264/yuv420p MP4", async () => {
    const ffprobePath = await findExecutable("ffprobe", { installHint: "brew install ffmpeg" });
    const probe = await probeVideo(ffprobePath, outputPath);
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
    expect(probe.fps).toBeCloseTo(30, 5);
    expect(probe.codec).toBe("h264");
    expect(probe.pixFmt).toBe("yuv420p");
    // HOOK 1 + LEAD_IN(4 plies)*0.4 + BLUNDER_PLAY 1.2 + FREEZE 1
    // + COUNTDOWN 5 + SWING 1.5 + PUNISHMENT 1.2 + PAYOFF 3
    expect(probe.duration).toBeCloseTo(15.5, 1);
  }, 30_000);

  it("detects 15...Nxe4?? and Bxd8, plays the blunder before asking, reveals nothing before the countdown ends", async () => {
    const game = loadPgn(await readFile(resolve("test/fixtures/blunder-game.pgn"), "utf8"));
    const analyses = await analyzeGame(engine, game, { depth: 16 });
    const candidate = selectBlunder(game, analyses);
    expect(candidate.ply.san).toBe("Nxe4");

    const timeline = buildBlunderStory(game, candidate, { countdownSeconds: 5, showEval: true });

    const rendererDir = (await createTempDir({ prefix: "chessroll-gate-blunder-check" })).path;
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
      // HOOK + LEAD_IN: not the blunder yet.
      const blunderPlayStart = 1 + 4 * 0.4;
      // The blunder move plays here — visible, but not flagged in any way.
      await renderAtTime(blunderPlayStart + 0.6);
      const midBlunderHighlights = await session.page
        .locator('#board-root rect[opacity="0.35"]')
        .count();
      expect(midBlunderHighlights).toBe(0);

      // HOOK+LEAD_IN+BLUNDER_PLAY+FREEZE+COUNTDOWN window: nothing revealed,
      // even though the blunder itself has already been played on screen.
      const revealStart = 1 + 4 * 0.4 + 1.2 + 1 + 5;
      for (const t of [0.5, 2.0, blunderPlayStart + 0.1, revealStart - 0.1]) {
        await renderAtTime(t);
        const overlayHtml = await session.page.locator("#overlay-root").innerHTML();
        expect(overlayHtml).not.toContain("evaluation");
        const highlightCount = await session.page
          .locator('#board-root rect[opacity="0.35"]')
          .count();
        expect(highlightCount).toBe(0);
      }

      // Right at the reveal: origin+destination highlights + eval appear.
      await renderAtTime(revealStart);
      const highlightCount = await session.page.locator('#board-root rect[opacity="0.35"]').count();
      expect(highlightCount).toBe(2); // the blunder's origin + destination squares

      // PAYOFF: legal punishment label.
      await renderAtTime(timeline.duration);
      const moveLabel = await session.page.locator("#overlay-root .move-label").textContent();
      expect(moveLabel).toBe("Bxd8");
      // Not an exact string: fixed-depth search isn't guaranteed bit-for-bit
      // reproducible run to run (BLUEPRINT.md §36 — assert the sign/shape,
      // not exact centipawn equality). White must be clearly, hugely ahead.
      const evalText = await session.page.locator("#overlay-root .evaluation").textContent();
      expect(evalText).toMatch(/^\+[3-9]\.\d$/);
    } finally {
      await session.close();
      await rm(rendererDir, { recursive: true, force: true });
    }
  }, 60_000);
});
