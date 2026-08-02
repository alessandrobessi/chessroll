import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AutoRenderOptions, RenderOptions } from "./config/load.js";
import { AnalysisCache } from "./engine/cache.js";
import { analyzePosition } from "./engine/analysis.js";
import { StockfishEngine } from "./engine/stockfish.js";
import type { Side } from "./chess/types.js";
import { analyzeGame } from "./engine/analysis.js";
import type { PositionAnalysis } from "./engine/analysis.js";
import { buildPuzzleStory } from "./story/puzzle.js";
import { buildBlunderStory, selectBlunder } from "./story/blunder.js";
import { buildBrilliantStory, selectBrilliantMove } from "./story/brilliant.js";
import { buildReplayStory } from "./story/replay.js";
import { buildGame60Story } from "./story/game60.js";
import { buildGuessStory, selectGuessMove } from "./story/guess.js";
import { planAutoStories, slugForPly } from "./story/auto.js";
import type { SceneTimeline } from "./scene/types.js";
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
        coordinates: options.coordinates,
      });
    }
    case "blunder": {
      const analyses = await analyzeGame(engine, options.game, {
        depth: options.depth,
        nodes: options.nodes,
        cache,
        useCache: options.cache,
      });
      const candidate = selectBlunder(options.game, analyses, {
        moveOverride: options.moveOverride,
      });
      const orientation = options.orientation === "auto" ? undefined : options.orientation;
      return buildBlunderStory(options.game, candidate, {
        countdownSeconds: options.countdownSeconds,
        showEval: options.showEval,
        orientation,
        coordinates: options.coordinates,
      });
    }
    case "brilliant": {
      const analyses = await analyzeGame(engine, options.game, {
        depth: options.depth,
        nodes: options.nodes,
        cache,
        useCache: options.cache,
      });
      const candidate = selectBrilliantMove(options.game, analyses, {
        moveOverride: options.moveOverride,
      });
      const orientation = options.orientation === "auto" ? undefined : options.orientation;
      return buildBrilliantStory(options.game, candidate, {
        countdownSeconds: options.countdownSeconds,
        showEval: options.showEval,
        orientation,
        coordinates: options.coordinates,
      });
    }
    case "replay": {
      const analyses = await analyzeGame(engine, options.game, {
        depth: options.depth,
        nodes: options.nodes,
        cache,
        useCache: options.cache,
      });
      const orientation = options.orientation === "auto" ? undefined : options.orientation;
      return buildReplayStory(options.game, analyses, {
        showEval: options.showEval,
        orientation,
        coordinates: options.coordinates,
      });
    }
    case "game60": {
      const analyses = await analyzeGame(engine, options.game, {
        depth: options.depth,
        nodes: options.nodes,
        cache,
        useCache: options.cache,
      });
      const orientation = options.orientation === "auto" ? undefined : options.orientation;
      return buildGame60Story(options.game, analyses, {
        targetSeconds: options.targetSeconds,
        showEval: options.showEval,
        orientation,
        coordinates: options.coordinates,
      });
    }
    case "guess": {
      const analyses = await analyzeGame(engine, options.game, {
        depth: options.depth,
        nodes: options.nodes,
        cache,
        useCache: options.cache,
      });
      const candidate = selectGuessMove(options.game, analyses, {
        moveOverride: options.moveOverride,
      });
      const orientation = options.orientation === "auto" ? undefined : options.orientation;
      return buildGuessStory(options.game, analyses, candidate, {
        countdownSeconds: options.countdownSeconds,
        showEval: options.showEval,
        orientation,
        coordinates: options.coordinates,
      });
    }
  }
}

/**
 * The brilliant detector needs MultiPV >= 2 to measure the gap between the
 * played move and the runner-up alternative — bump it before the engine
 * even starts (MultiPV is a UCI setoption applied once at startup).
 */
function effectiveMultiPv(options: RenderOptions): number {
  return options.template === "brilliant" ? Math.max(2, options.multiPv) : options.multiPv;
}

interface RenderTailOptions {
  width: number;
  height: number;
  fps: number;
  sound: boolean;
  keepTemp: boolean;
  ffmpegPath: string;
}

/**
 * The shared "scene timeline -> pixels -> MP4" tail end: launch a
 * renderer session for this one timeline, capture its frames, encode
 * them. Shared by renderVideo() (one timeline per call) and
 * renderAutoVideos() (many timelines, one call each, from a single
 * engine/analysis pass) — the only difference between them is how many
 * times, and from what, the SceneTimeline gets built.
 */
async function renderTimelineToFile(
  timeline: SceneTimeline,
  outputPath: string,
  options: RenderTailOptions,
): Promise<RenderResult> {
  const audioCues = options.sound ? timeline.audioCues : undefined;
  const session = await launchRenderer({
    timeline,
    rendererHtmlPath: rendererHtmlPath(),
    width: options.width,
    height: options.height,
  });

  const frameDir = await createTempDir({ prefix: "chessroll-frames", keep: options.keepTemp });
  try {
    const frames = await captureFrames({
      session,
      fps: options.fps,
      durationSeconds: timeline.duration,
      outDir: frameDir.path,
    });

    await encodeVideo({
      ffmpegPath: options.ffmpegPath,
      frameDir: frameDir.path,
      frameCount: frames.frameCount,
      fps: options.fps,
      outputPath,
      audioCues,
    });

    return { outputPath, frameCount: frames.frameCount, durationSeconds: timeline.duration };
  } finally {
    await session.close();
    await frameDir.cleanup();
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
    multiPv: effectiveMultiPv(options),
  });

  let timeline: SceneTimeline;
  try {
    timeline = await buildTimeline(engine, options);
  } finally {
    await engine.quit();
  }

  return renderTimelineToFile(timeline, options.output, {
    width: options.width,
    height: options.height,
    fps: options.fps,
    sound: options.sound,
    keepTemp: options.keepTemp,
    ffmpegPath,
  });
}

export interface AutoRenderResult {
  outputDir: string;
  videos: RenderResult[];
}

/**
 * Orchestrates --template auto: one Stockfish pass over the whole game
 * (MultiPV forced to >=2, same as brilliant, since detectBrilliantMoves
 * needs it), planned into a replay + capped blunder/brilliant/puzzle
 * videos (see planAutoStories), each rendered to its own file inside
 * options.output (a directory here, not a file — see AutoRenderOptions).
 * Unlike renderVideo(), analysis happens exactly once and is reused
 * across every planned video, rather than once per template invocation.
 */
export async function renderAutoVideos(options: AutoRenderOptions): Promise<AutoRenderResult> {
  const stockfishPath = await findExecutable("stockfish", {
    explicitPath: options.engine,
    installHint: "brew install stockfish, or pass --engine <path>",
  });
  const ffmpegPath = await findExecutable("ffmpeg", { installHint: "brew install ffmpeg" });

  const engine = await StockfishEngine.start({
    binaryPath: stockfishPath,
    threads: options.threads,
    hashMb: options.hashMb,
    multiPv: Math.max(2, options.multiPv),
  });

  const cache = options.cache ? new AnalysisCache() : undefined;
  let analyses: PositionAnalysis[];
  try {
    analyses = await analyzeGame(engine, options.game, {
      depth: options.depth,
      nodes: options.nodes,
      cache,
      useCache: options.cache,
    });
  } finally {
    await engine.quit();
  }

  const plan = planAutoStories(options.game, analyses, { maxPerCategory: options.maxPerCategory });
  const orientation = options.orientation === "auto" ? undefined : options.orientation;

  const jobs: { filename: string; timeline: SceneTimeline }[] = [
    {
      filename: "replay.mp4",
      timeline: buildReplayStory(options.game, analyses, {
        showEval: options.showEval,
        orientation,
        coordinates: options.coordinates,
      }),
    },
    ...plan.blunders.map((candidate) => ({
      filename: `blunder-${slugForPly(candidate.ply)}.mp4`,
      timeline: buildBlunderStory(options.game, candidate, {
        countdownSeconds: options.countdownSeconds,
        showEval: options.showEval,
        orientation,
        coordinates: options.coordinates,
      }),
    })),
    ...plan.brilliants.map((candidate) => ({
      filename: `brilliant-${slugForPly(candidate.ply)}.mp4`,
      timeline: buildBrilliantStory(options.game, candidate, {
        countdownSeconds: options.countdownSeconds,
        showEval: options.showEval,
        orientation,
        coordinates: options.coordinates,
      }),
    })),
    ...plan.puzzles.map((moment) => ({
      filename: `puzzle-${slugForPly(moment.ply)}.mp4`,
      timeline: buildPuzzleStory(moment.ply.fenBefore, moment.ply.side, moment.analysis, {
        countdownSeconds: options.countdownSeconds,
        showEval: options.showEval,
        orientation,
        coordinates: options.coordinates,
      }),
    })),
  ];

  await mkdir(options.output, { recursive: true });

  const videos: RenderResult[] = [];
  for (const job of jobs) {
    videos.push(
      await renderTimelineToFile(job.timeline, resolve(options.output, job.filename), {
        width: options.width,
        height: options.height,
        fps: options.fps,
        sound: options.sound,
        keepTemp: options.keepTemp,
        ffmpegPath,
      }),
    );
  }

  return { outputDir: options.output, videos };
}
