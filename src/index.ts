import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RenderOptions } from "./config/load.js";
import { AnalysisCache } from "./engine/cache.js";
import { analyzePosition } from "./engine/analysis.js";
import { StockfishEngine } from "./engine/stockfish.js";
import type { Side } from "./chess/types.js";
import { buildPuzzleStory } from "./story/puzzle.js";
import type { SceneTimeline } from "./scene/types.js";
import { UnexpectedError } from "./utils/errors.js";
import { findExecutable } from "./utils/process.js";
import { createTempDir } from "./utils/temp.js";
import { launchRenderer } from "./video/browser.js";
import { encodeVideo } from "./video/ffmpeg.js";
import { captureFrames } from "./video/frames.js";

function resolveOrientation(orientation: "white" | "black" | "auto", sideToMove: Side): Side {
  return orientation === "auto" ? sideToMove : orientation;
}

/**
 * renderer/dist/ is always a sibling of this module's own directory
 * (src/ in dev, dist/ once bundled — both sit one level under the package
 * root, so the relative path resolves correctly either way).
 */
function rendererHtmlPath(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  return resolve(here, "..", "renderer", "dist", "index.html");
}

export interface RenderResult {
  outputPath: string;
  frameCount: number;
  durationSeconds: number;
}

async function buildTimeline(
  engine: StockfishEngine,
  options: RenderOptions,
): Promise<SceneTimeline> {
  const cache = options.cache ? new AnalysisCache() : undefined;

  switch (options.template) {
    case "puzzle": {
      const analysis = await analyzePosition(engine, {
        fen: options.fen,
        sideToMove: options.sideToMove,
        depth: options.depth,
        nodes: options.nodes,
        cache,
        useCache: options.cache,
      });
      const orientation = resolveOrientation(options.orientation, options.sideToMove);
      return buildPuzzleStory(options.fen, options.sideToMove, analysis, {
        countdownSeconds: options.countdownSeconds,
        showEval: options.showEval,
        orientation,
      });
    }
    case "blunder":
      // Wired up once src/story/blunder.ts exists.
      throw new UnexpectedError('"blunder" template is not wired into renderVideo() yet');
  }
}

/** Orchestrates chess -> engine -> story -> scene -> video. */
export async function renderVideo(options: RenderOptions): Promise<RenderResult> {
  const stockfishPath = await findExecutable("stockfish", {
    explicitPath: options.engine,
    installHint: "brew install stockfish, or pass --engine <path>",
  });
  const ffmpegPath = await findExecutable("ffmpeg", { installHint: "brew install ffmpeg" });

  const engine = await StockfishEngine.start({
    binaryPath: stockfishPath,
    threads: options.threads,
    hashMb: options.hashMb,
    multiPv: options.multiPv,
  });

  let timelineDuration: number;
  let session: Awaited<ReturnType<typeof launchRenderer>>;
  try {
    const timeline = await buildTimeline(engine, options);
    timelineDuration = timeline.duration;

    session = await launchRenderer({
      timeline,
      rendererHtmlPath: rendererHtmlPath(),
      width: options.width,
      height: options.height,
    });
  } finally {
    await engine.quit();
  }

  const frameDir = await createTempDir({ prefix: "chessroll-frames", keep: options.keepTemp });
  try {
    const frames = await captureFrames({
      session,
      fps: options.fps,
      durationSeconds: timelineDuration,
      outDir: frameDir.path,
    });

    await encodeVideo({
      ffmpegPath,
      frameDir: frameDir.path,
      frameCount: frames.frameCount,
      fps: options.fps,
      outputPath: options.output,
    });

    return {
      outputPath: options.output,
      frameCount: frames.frameCount,
      durationSeconds: timelineDuration,
    };
  } finally {
    await session.close();
    await frameDir.cleanup();
  }
}
