import { execa } from "execa";
import { EncodingError } from "../utils/errors.js";

export interface VideoProbeResult {
  width: number;
  height: number;
  fps: number;
  codec: string;
  pixFmt: string;
  duration: number;
  /** Whether the container has an audio stream at all (BLUEPRINT.md §33). */
  hasAudio: boolean;
  audioCodec?: string;
}

interface FfprobeStreamJson {
  codec_type?: string;
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

/**
 * Inspects `path` with ffprobe, for automated media validation. Queries
 * every stream (not just `-select_streams v:0`) so audio presence/codec
 * can be reported alongside the video fields, per BLUEPRINT.md §33's
 * "audio optional according to template/config" media-validation checklist.
 */
export async function probeVideo(ffprobePath: string, path: string): Promise<VideoProbeResult> {
  let stdout: string;
  try {
    const result = await execa(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,width,height,r_frame_rate,codec_name,pix_fmt:format=duration",
      "-of",
      "json",
      path,
    ]);
    stdout = result.stdout;
  } catch (cause) {
    throw new EncodingError(`ffprobe failed to inspect ${path}`, { cause });
  }

  const parsed = JSON.parse(stdout) as FfprobeJson;
  const streams = parsed.streams ?? [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  if (!videoStream) {
    throw new EncodingError(`ffprobe found no video stream in ${path}`);
  }

  return {
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps: parseFrameRate(videoStream.r_frame_rate ?? "0/1"),
    codec: videoStream.codec_name ?? "",
    pixFmt: videoStream.pix_fmt ?? "",
    duration: Number(parsed.format?.duration ?? 0),
    hasAudio: audioStream !== undefined,
    audioCodec: audioStream?.codec_name,
  };
}
