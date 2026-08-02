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
import { buildGuessStory, selectGuessMove } from "../../src/story/guess.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";

/**
 * guess-template acceptance gate, mirroring the other templates' shape:
 * `chessroll test/fixtures/guess-game.pgn --template guess` end to end
 * (real Stockfish, real Chromium, real ffmpeg), plus qualitative checks
 * against the live DOM confirming the honest engine-comparison framing.
 */
describe("Gate: chessroll test/fixtures/guess-game.pgn --template guess", () => {
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
    outputPath = resolve(outRoot, "gate-guess.mp4");

    const options = await resolveOptions({
      input: resolve("test/fixtures/guess-game.pgn"),
      template: "guess",
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
    expect(probe.duration).toBeGreaterThan(20);
    expect(probe.hasAudio).toBe(true);
    expect(probe.audioCodec).toBe("aac");
  }, 30_000);

  it("reveals nothing before the countdown ends, then shows the honest engine comparison", async () => {
    const game = loadPgn(await readFile(resolve("test/fixtures/guess-game.pgn"), "utf8"));
    const analyses = await analyzeGame(engine, game, { depth: 12 });
    const candidate = selectGuessMove(game, analyses);
    const timeline = buildGuessStory(game, analyses, candidate, {
      countdownSeconds: 5,
      showEval: true,
    });

    const rendererDir = (await createTempDir({ prefix: "chessroll-gate-guess-check" })).path;
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
      const revealSegment = timeline.segments.find(
        (s) => s.state.highlights !== undefined && s.state.moveAnimation === undefined,
      );
      expect(revealSegment).toBeDefined();

      // Nothing revealed before that point.
      for (const t of [0, revealSegment!.start - 0.1]) {
        await renderAtTime(t);
        const overlayHtml = await session.page.locator("#overlay-root").innerHTML();
        expect(overlayHtml).not.toContain("evaluation");
        const highlightCount = await session.page
          .locator('#board-root rect[opacity="0.35"]')
          .count();
        expect(highlightCount).toBe(0);
      }

      // Right at the reveal: origin+destination highlights appear.
      await renderAtTime(revealSegment!.start);
      const highlightCount = await session.page.locator('#board-root rect[opacity="0.35"]').count();
      expect(highlightCount).toBe(2);

      // The engine-comparison segment: an honest, factual prompt — never
      // asserting the historical move was objectively best.
      const comparisonSegment = timeline.segments.find(
        (s) => s.state.prompt !== undefined && s.state.evaluation !== undefined,
      );
      expect(comparisonSegment).toBeDefined();
      await renderAtTime((comparisonSegment!.start + comparisonSegment!.end) / 2);
      const promptText = await session.page.locator("#overlay-root .prompt").textContent();
      expect(promptText).toMatch(
        /^(MATCHES STOCKFISH'S TOP CHOICE|STOCKFISH PREFERRED .+ INSTEAD)$/,
      );
    } finally {
      await session.close();
      await rm(rendererDir, { recursive: true, force: true });
    }
  }, 90_000);
});
