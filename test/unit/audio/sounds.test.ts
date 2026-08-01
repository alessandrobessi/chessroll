import { describe, expect, it } from "vitest";
import { SOUND_PARAMS } from "../../../src/audio/sounds.js";
import type { AudioCueType } from "../../../src/audio/timeline.js";

const CUE_TYPES: AudioCueType[] = [
  "move",
  "capture",
  "check",
  "checkmate",
  "countdown-tick",
  "reveal",
];

describe("SOUND_PARAMS", () => {
  it("defines every cue type", () => {
    expect(Object.keys(SOUND_PARAMS).sort()).toEqual([...CUE_TYPES].sort());
  });

  it.each(CUE_TYPES)("%s has a well-formed lavfi source and sane envelope", (type) => {
    const params = SOUND_PARAMS[type];
    expect(params.source).toMatch(/^(sine=frequency=\d+|aevalsrc=exprs='.+')/);
    // The source must not itself carry a duration — the builder appends
    // exactly one `:duration=` suffix per occurrence (src/video/ffmpeg.ts).
    expect(params.source).not.toContain("duration=");
    expect(params.durationSeconds).toBeGreaterThan(0);
    expect(params.gain).toBeGreaterThan(0);
    expect(params.gain).toBeLessThanOrEqual(1);
    expect(params.fadeInSeconds).toBeGreaterThanOrEqual(0);
    expect(params.fadeOutSeconds).toBeGreaterThanOrEqual(0);
    expect(params.fadeInSeconds + params.fadeOutSeconds).toBeLessThanOrEqual(
      params.durationSeconds,
    );
  });

  it("keeps every cue short and quiet, per BLUEPRINT.md's 'keep sound restrained'", () => {
    for (const type of CUE_TYPES) {
      const params = SOUND_PARAMS[type];
      expect(params.durationSeconds).toBeLessThanOrEqual(0.5);
      expect(params.gain).toBeLessThanOrEqual(0.25);
    }
  });
});
