import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTimeline, phase } from "../../src/scene/timeline.js";
import type { SceneDescriptor } from "../../src/scene/types.js";
import { encodeVideo } from "../../src/video/ffmpeg.js";
import { captureFrames } from "../../src/video/frames.js";
import { launchRenderer, type RendererSession } from "../../src/video/browser.js";
import { probeVideo } from "../../src/video/probe.js";
import { findExecutable } from "../../src/utils/process.js";
import { createTempDir } from "../../src/utils/temp.js";

/**
 * BLUEPRINT.md §39, the first acceptance gate: prove deterministic
 * rendering with a hard-coded move — no Stockfish involved — before any
 * engine integration work starts.
 */
describe("Gate 39: hard-coded e2-e4 render", () => {
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const AFTER_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
  const FPS = 30;

  let rendererDir: string;
  let outDir: string;
  let session: RendererSession;
  let outputPath: string;

  beforeAll(async () => {
    rendererDir = (await createTempDir({ prefix: "chessroll-gate39-renderer" })).path;
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

    const moveDescriptor: SceneDescriptor = {
      position: { fen: START_FEN, orientation: "white" },
      moveAnimation: {
        from: "e2",
        to: "e4",
        piece: { type: "pawn", color: "white" },
        start: 0,
        end: 1,
      },
    };
    const holdDescriptor: SceneDescriptor = {
      position: { fen: AFTER_FEN, orientation: "white" },
    };
    const timeline = createTimeline([phase(0, 1, moveDescriptor), phase(1, 0.5, holdDescriptor)]);

    session = await launchRenderer({
      timeline,
      rendererHtmlPath: resolve(rendererDir, "index.html"),
      width: 1080,
      height: 1920,
    });

    outDir = (await createTempDir({ prefix: "chessroll-gate39-frames" })).path;
    const frames = await captureFrames({
      session,
      fps: FPS,
      durationSeconds: timeline.duration,
      outDir,
    });

    const outRoot = resolve("out");
    await mkdir(outRoot, { recursive: true });
    outputPath = resolve(outRoot, "gate39.mp4");

    const ffmpegPath = await findExecutable("ffmpeg", { installHint: "brew install ffmpeg" });
    await encodeVideo({
      ffmpegPath,
      frameDir: outDir,
      frameCount: frames.frameCount,
      fps: FPS,
      outputPath,
    });
  }, 60_000);

  afterAll(async () => {
    await session.close();
    await rm(rendererDir, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  });

  it("produces a validated 1080x1920 30fps h264/yuv420p MP4", async () => {
    const ffprobePath = await findExecutable("ffprobe", { installHint: "brew install ffmpeg" });
    const probe = await probeVideo(ffprobePath, outputPath);
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
    expect(probe.fps).toBeCloseTo(FPS, 5);
    expect(probe.codec).toBe("h264");
    expect(probe.pixFmt).toBe("yuv420p");
    expect(probe.duration).toBeGreaterThan(0);
  });
});
