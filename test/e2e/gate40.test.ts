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
import { buildPuzzleStory } from "../../src/story/puzzle.js";
import { analyzePosition } from "../../src/engine/analysis.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";

/**
 * BLUEPRINT.md §40, the second acceptance gate:
 * `chessroll test/fixtures/puzzle.fen --template puzzle` end to end,
 * checked against the exact qualitative checklist the spec gives.
 */
describe("Gate 40: chessroll test/fixtures/puzzle.fen --template puzzle", () => {
  let outputPath: string;
  let engine: StockfishEngine;

  beforeAll(async () => {
    // renderVideo() resolves renderer/dist/index.html relative to its own
    // module location — build the real project-relative renderer/dist/,
    // matching the documented "pnpm build; chessroll ..." acceptance flow.
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
    outputPath = resolve(outRoot, "gate40-puzzle.mp4");

    const options = await resolveOptions({
      input: resolve("test/fixtures/puzzle.fen"),
      template: "puzzle",
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
    // INTRO 1 + PROMPT 1.5 + SOLVE 5 + REVEAL 1 + MOVE 1.5 + CONTINUATION 6 + PAYOFF 3
    expect(probe.duration).toBeCloseTo(19, 0);
  }, 30_000);

  it("Stockfish finds the expected forced-mate move on this fixture", async () => {
    const fenRaw = (await readFile(resolve("test/fixtures/puzzle.fen"), "utf8")).trim();
    const analysis = await analyzePosition(engine, { fen: fenRaw, sideToMove: "white", depth: 12 });
    expect(analysis.bestMove).toBe("a2a7");
  }, 20_000);

  it("reveals nothing during SOLVE and shows the oxblood reveal/continuation/payoff at the right times", async () => {
    const fenRaw = (await readFile(resolve("test/fixtures/puzzle.fen"), "utf8")).trim();
    const analysis = await analyzePosition(engine, { fen: fenRaw, sideToMove: "white", depth: 12 });
    const timeline = buildPuzzleStory(fenRaw, "white", analysis, {
      countdownSeconds: 5,
      showEval: true,
    });

    const rendererDir = (await createTempDir({ prefix: "chessroll-gate40-check" })).path;
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

    try {
      // SOLVE window: [2.5, 7.5) — no oxblood highlight/arrow/eval anywhere.
      for (const t of [2.5, 4.0, 7.4]) {
        await session.page.evaluate((time: number) => {
          (globalThis as unknown as { renderAtTime: (t: number) => void }).renderAtTime(time);
        }, t);
        const overlayHtml = await session.page.locator("#overlay-root").innerHTML();
        expect(overlayHtml).not.toContain("evaluation");
        const highlightCount = await session.page
          .locator('#board-root rect[opacity="0.35"]')
          .count();
        expect(highlightCount).toBe(0);
      }

      // REVEAL starts exactly at t=7.5.
      await session.page.evaluate((time: number) => {
        (globalThis as unknown as { renderAtTime: (t: number) => void }).renderAtTime(time);
      }, 7.5);
      const highlightCount = await session.page.locator('#board-root rect[opacity="0.35"]').count();
      expect(highlightCount).toBe(2); // origin + destination squares

      // PAYOFF: final position holds a legal mate label.
      await session.page.evaluate((time: number) => {
        (globalThis as unknown as { renderAtTime: (t: number) => void }).renderAtTime(time);
      }, timeline.duration);
      const moveLabel = await session.page.locator("#overlay-root .move-label").textContent();
      expect(moveLabel).toBe("Rh8#");
      const evalText = await session.page.locator("#overlay-root .evaluation").textContent();
      expect(evalText).toBe("M2");
    } finally {
      await session.close();
      await rm(rendererDir, { recursive: true, force: true });
    }
  }, 30_000);
});
