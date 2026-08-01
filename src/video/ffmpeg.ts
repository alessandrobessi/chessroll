import { join } from "node:path";
import { execa } from "execa";
import type { AudioCue } from "../audio/timeline.js";
import { SOUND_PARAMS } from "../audio/sounds.js";
import { EncodingError } from "../utils/errors.js";

export interface EncodeVideoOptions {
  ffmpegPath: string;
  frameDir: string;
  frameCount: number;
  fps: number;
  outputPath: string;
  /** When non-empty, an AAC audio track is synthesized and muxed in (BLUEPRINT.md §28). */
  audioCues?: AudioCue[];
}

export interface AudioFilterGraph {
  /** `-f lavfi -i <source>` pairs, one per cue occurrence plus a full-length silence pad. */
  inputArgs: string[];
  filterComplex: string;
  /** The `amix` output pad name, referenced via `-map "[<outputLabel>]"`. */
  outputLabel: string;
}

/**
 * Builds the ffmpeg input/filter-graph arguments that mix every cue into a
 * single audio stream exactly `durationSeconds` long. Each cue is its own
 * `lavfi` source input (sine/aevalsrc — see src/audio/sounds.ts), shaped
 * with fade-in/out and gain, then delayed to its timestamp via `adelay`.
 * A full-length `anullsrc` silence pad is always mixed in too, so the
 * mix's own duration (`amix ... duration=first`) is pinned to the video's
 * length regardless of where the last cue's short tail actually ends.
 * `normalize=0` keeps each cue's hand-tuned gain from being auto-attenuated
 * as more cues are mixed in.
 */
export function buildAudioFilterGraph(cues: AudioCue[], durationSeconds: number): AudioFilterGraph {
  const inputArgs: string[] = [
    "-t",
    String(durationSeconds),
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=mono",
  ];
  const mixLabels: string[] = ["0:a"];
  const filterParts: string[] = [];

  cues.forEach((cue, i) => {
    const params = SOUND_PARAMS[cue.type];
    const inputIndex = i + 1; // input 0 is the silence pad
    inputArgs.push("-f", "lavfi", "-i", `${params.source}:duration=${params.durationSeconds}`);

    const label = `a${i}`;
    const fadeOutStart = params.durationSeconds - params.fadeOutSeconds;
    const delayMs = Math.round(cue.time * 1000);
    filterParts.push(
      `[${inputIndex}:a]afade=t=in:st=0:d=${params.fadeInSeconds},` +
        `afade=t=out:st=${fadeOutStart}:d=${params.fadeOutSeconds},` +
        `volume=${params.gain},adelay=${delayMs}:all=1[${label}]`,
    );
    mixLabels.push(label);
  });

  const outputLabel = "aout";
  filterParts.push(
    `${mixLabels.map((label) => `[${label}]`).join("")}` +
      `amix=inputs=${mixLabels.length}:duration=first:normalize=0[${outputLabel}]`,
  );

  return { inputArgs, filterComplex: filterParts.join(";"), outputLabel };
}

/** Synthesizes the mixed audio bed described by `cues` into a standalone mono WAV. */
export async function composeAudioBed(
  ffmpegPath: string,
  cues: AudioCue[],
  durationSeconds: number,
  outputWavPath: string,
): Promise<void> {
  const graph = buildAudioFilterGraph(cues, durationSeconds);
  const args = [
    "-y",
    ...graph.inputArgs,
    "-filter_complex",
    graph.filterComplex,
    "-map",
    `[${graph.outputLabel}]`,
    "-ac",
    "1",
    "-ar",
    "44100",
    outputWavPath,
  ];
  try {
    await execa(ffmpegPath, args);
  } catch (cause) {
    throw new EncodingError(`ffmpeg failed to synthesize the audio bed at ${outputWavPath}`, {
      cause,
    });
  }
}

/**
 * Encodes a PNG sequence into an H.264/yuv420p MP4 (BLUEPRINT.md §27), with
 * an AAC audio track muxed in when `audioCues` is non-empty ("AAC if audio
 * exists"). With no cues, behavior is identical to the video-only path.
 */
export async function encodeVideo(options: EncodeVideoOptions): Promise<void> {
  const { ffmpegPath, frameDir, frameCount, fps, outputPath, audioCues } = options;

  const args = ["-y", "-framerate", String(fps), "-i", join(frameDir, "frame-%06d.png")];

  if (audioCues && audioCues.length > 0) {
    const audioPath = join(frameDir, "audio.wav");
    await composeAudioBed(ffmpegPath, audioCues, frameCount / fps, audioPath);
    args.push("-i", audioPath, "-map", "0:v", "-map", "1:a");
  }

  args.push(
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
  );

  if (audioCues && audioCues.length > 0) {
    args.push("-c:a", "aac", "-b:a", "128k");
  }

  args.push("-movflags", "+faststart", outputPath);

  try {
    await execa(ffmpegPath, args);
  } catch (cause) {
    throw new EncodingError(`ffmpeg failed to encode ${outputPath}`, { cause });
  }
}
