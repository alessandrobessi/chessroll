import { join } from "node:path";
import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeAudioBed } from "../../src/video/ffmpeg.js";
import { createTempDir } from "../../src/utils/temp.js";
import { findExecutable } from "../../src/utils/process.js";
import type { AudioCue } from "../../src/audio/timeline.js";

/**
 * Runs the real FFmpeg binary (already a hard dependency for the video
 * pipeline) to confirm composeAudioBed() actually produces the audio it
 * claims to, matching this repo's discipline of validating against the
 * real binary rather than only asserting the command-string shape.
 */
describe("composeAudioBed against the real ffmpeg binary", () => {
  let ffmpegPath: string;
  let ffprobePath: string;
  let tempDir: { path: string; cleanup: () => Promise<void> };

  beforeAll(async () => {
    ffmpegPath = await findExecutable("ffmpeg", { installHint: "brew install ffmpeg" });
    ffprobePath = await findExecutable("ffprobe", { installHint: "brew install ffmpeg" });
    tempDir = await createTempDir({ prefix: "chessroll-audio-integration" });
  }, 15_000);

  afterAll(async () => {
    await tempDir.cleanup();
  });

  it("produces a WAV of exactly the requested duration, regardless of where cues land", async () => {
    const cues: AudioCue[] = [
      { time: 0.5, type: "move" },
      { time: 2.9, type: "checkmate" }, // near the end — must not extend past duration
    ];
    const outPath = join(tempDir.path, "bed-with-cues.wav");
    await composeAudioBed(ffmpegPath, cues, 3.0, outPath);

    const result = await execa(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      outPath,
    ]);
    expect(Number(result.stdout.trim())).toBeCloseTo(3.0, 1);
  }, 20_000);

  it("produces a non-silent bed when cues are present", async () => {
    const cues: AudioCue[] = [{ time: 0.5, type: "checkmate" }];
    const outPath = join(tempDir.path, "bed-non-silent.wav");
    await composeAudioBed(ffmpegPath, cues, 2.0, outPath);

    const result = await execa(ffmpegPath, [
      "-i",
      outPath,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]);
    const maxVolumeLine = /max_volume:\s*(-?[\d.]+)\s*dB/.exec(result.stderr);
    expect(maxVolumeLine).not.toBeNull();
    // -inf (or anything below -60dB) would mean the cue never actually sounded.
    expect(Number(maxVolumeLine![1])).toBeGreaterThan(-60);
  }, 20_000);

  it("produces an exact-duration silent bed when there are no cues at all", async () => {
    const outPath = join(tempDir.path, "bed-empty.wav");
    await composeAudioBed(ffmpegPath, [], 1.5, outPath);

    const result = await execa(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      outPath,
    ]);
    expect(Number(result.stdout.trim())).toBeCloseTo(1.5, 1);
  }, 20_000);
});
