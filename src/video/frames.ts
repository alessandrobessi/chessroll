import { join } from "node:path";
import { renderAtTime, type RendererSession } from "./browser.js";

export function framePath(outDir: string, index: number): string {
  return join(outDir, `frame-${String(index).padStart(6, "0")}.png`);
}

export interface CaptureFramesOptions {
  session: RendererSession;
  fps: number;
  durationSeconds: number;
  outDir: string;
}

export interface CaptureFramesResult {
  frameCount: number;
  /** ffmpeg-style printf pattern, e.g. "<outDir>/frame-%06d.png". */
  frameFilePattern: string;
}

/** Captures one PNG per frame, driving the already-open renderer page. */
export async function captureFrames(options: CaptureFramesOptions): Promise<CaptureFramesResult> {
  const { session, fps, durationSeconds, outDir } = options;
  const frameCount = Math.max(1, Math.round(durationSeconds * fps));

  for (let n = 0; n < frameCount; n++) {
    const t = n / fps;
    await renderAtTime(session, t);
    await session.page.screenshot({ path: framePath(outDir, n) });
  }

  return { frameCount, frameFilePattern: join(outDir, "frame-%06d.png") };
}

/** Renders and captures a single arbitrary timestamp — used by the debug CLI. */
export async function captureSingleFrame(options: {
  session: RendererSession;
  t: number;
  outPath: string;
}): Promise<void> {
  await renderAtTime(options.session, options.t);
  await options.session.page.screenshot({ path: options.outPath });
}
