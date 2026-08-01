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
import { buildBrilliantStory, selectBrilliantMove } from "../../src/story/brilliant.js";
import { StockfishEngine } from "../../src/engine/stockfish.js";

/**
 * Brilliant-template acceptance gate, mirroring blunder.test.ts's shape:
 * `chessroll test/fixtures/brilliant-game.pgn --template brilliant` end to
 * end (real Stockfish, real Chromium, real ffmpeg), plus qualitative checks
 * against the live DOM.
 */
describe("Gate: chessroll test/fixtures/brilliant-game.pgn --template brilliant", () => {
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
    outputPath = resolve(outRoot, "gate-brilliant.mp4");

    const options = await resolveOptions({
      input: resolve("test/fixtures/brilliant-game.pgn"),
      template: "brilliant",
      output: outputPath,
      showEval: true,
    });

    await renderVideo(options);

    const binaryPath = await findExecutable("stockfish", {
      installHint: "brew install stockfish",
    });
    // MultiPV >= 2 — the detector needs a runner-up alternative to measure
    // the gap against.
    engine = await StockfishEngine.start({ binaryPath, multiPv: 2 });
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
    // HOOK 1 + LEAD_IN(0 plies) + PROMPT 1.5 + COUNTDOWN 5 + REVEAL 1
    // + MOVE 1.5 + CONTINUATION 6 (2 plies * 3.0) + PAYOFF 3
    expect(probe.duration).toBeCloseTo(19.0, 1);
  }, 30_000);

  it("detects 1.Qg8+!! as the standout sacrifice and reveals nothing before the countdown ends", async () => {
    const game = loadPgn(await readFile(resolve("test/fixtures/brilliant-game.pgn"), "utf8"));
    const analyses = await analyzeGame(engine, game, { depth: 18 });
    const candidate = selectBrilliantMove(game, analyses);
    expect(candidate.ply.san).toBe("Qg8+");
    expect(candidate.isSacrifice).toBe(true);

    const timeline = buildBrilliantStory(game, candidate, { countdownSeconds: 5, showEval: true });

    const rendererDir = (await createTempDir({ prefix: "chessroll-gate-brilliant-check" })).path;
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
      // No lead-in plies (the candidate is the game's very first move), so
      // PROMPT starts immediately at HOOK's end.
      const promptStart = 1.0;
      const revealStart = promptStart + 1.5 + 5; // PROMPT + COUNTDOWN

      // PROMPT+COUNTDOWN window: side-to-move subtitle visible throughout,
      // nothing revealed yet.
      for (const t of [promptStart + 0.1, promptStart + 1.5, revealStart - 0.1]) {
        await renderAtTime(t);
        const subtitle = await session.page.locator("#overlay-root .subtitle").textContent();
        expect(subtitle).toBe("WHITE TO MOVE");
        const overlayHtml = await session.page.locator("#overlay-root").innerHTML();
        expect(overlayHtml).not.toContain("evaluation");
        const highlightCount = await session.page
          .locator('#board-root rect[opacity="0.35"]')
          .count();
        expect(highlightCount).toBe(0);
      }

      // Right at the reveal: origin+destination highlights appear.
      await renderAtTime(revealStart);
      const highlightCount = await session.page.locator('#board-root rect[opacity="0.35"]').count();
      expect(highlightCount).toBe(2);

      // PAYOFF: the sacrifice gets the double-exclamation annotation, and
      // the mate score is shown, never coerced to a centipawn number.
      await renderAtTime(timeline.duration);
      const moveLabel = await session.page.locator("#overlay-root .move-label").textContent();
      expect(moveLabel).toBe("Qg8+!!");
      const evalText = await session.page.locator("#overlay-root .evaluation").textContent();
      expect(evalText).toMatch(/^M\d+$/);
    } finally {
      await session.close();
      await rm(rendererDir, { recursive: true, force: true });
    }
  }, 60_000);
});
