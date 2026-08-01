import { execa } from "execa";
import { EncodingError } from "../utils/errors.js";

export interface VideoProbeResult {
  width: number;
  height: number;
  fps: number;
  codec: string;
  pixFmt: string;
  duration: number;
}

interface FfprobeStreamJson {
  width?: number;
  height?: number;
  r_frame_rate?: string;
  codec_name?: string;
  pix_fmt?: string;
}

interface FfprobeJson {
  streams?: FfprobeStreamJson[];
  format?: { duration?: string };
}

function parseFrameRate(rFrameRate: string): number {
  const [num, den] = rFrameRate.split("/").map(Number);
  if (!num || !den) return 0;
  return num / den;
}

/** Inspects the first video stream of `path` with ffprobe, for automated media validation. */
export async function probeVideo(ffprobePath: string, path: string): Promise<VideoProbeResult> {
  let stdout: string;
  try {
    const result = await execa(ffprobePath, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,r_frame_rate,codec_name,pix_fmt:format=duration",
      "-of",
      "json",
      path,
    ]);
    stdout = result.stdout;
  } catch (cause) {
    throw new EncodingError(`ffprobe failed to inspect ${path}`, { cause });
  }

  const parsed = JSON.parse(stdout) as FfprobeJson;
  const stream = parsed.streams?.[0];
  if (!stream) {
    throw new EncodingError(`ffprobe found no video stream in ${path}`);
  }

  return {
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    fps: parseFrameRate(stream.r_frame_rate ?? "0/1"),
    codec: stream.codec_name ?? "",
    pixFmt: stream.pix_fmt ?? "",
    duration: Number(parsed.format?.duration ?? 0),
  };
}
