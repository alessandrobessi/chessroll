import { join } from "node:path";
import { execa } from "execa";
import { EncodingError } from "../utils/errors.js";

export interface EncodeVideoOptions {
  ffmpegPath: string;
  frameDir: string;
  frameCount: number;
  fps: number;
  outputPath: string;
}

/** Encodes a PNG sequence into an H.264/yuv420p MP4 (BLUEPRINT.md §27). */
export async function encodeVideo(options: EncodeVideoOptions): Promise<void> {
  const { ffmpegPath, frameDir, frameCount, fps, outputPath } = options;
  const args = [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    join(frameDir, "frame-%06d.png"),
    "-frames:v",
    String(frameCount),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
    outputPath,
  ];
  try {
    await execa(ffmpegPath, args);
  } catch (cause) {
    throw new EncodingError(`ffmpeg failed to encode ${outputPath}`, { cause });
  }
}
