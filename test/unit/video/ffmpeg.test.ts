import { describe, expect, it } from "vitest";
import { buildAudioFilterGraph } from "../../../src/video/ffmpeg.js";
import type { AudioCue } from "../../../src/audio/timeline.js";

describe("buildAudioFilterGraph", () => {
  it("adds one lavfi input per cue plus a full-length silence pad", () => {
    const cues: AudioCue[] = [
      { time: 1.0, type: "move" },
      { time: 2.5, type: "capture" },
    ];
    const graph = buildAudioFilterGraph(cues, 10);

    // Silence pad input: `-t 10 -f lavfi -i anullsrc=...`.
    expect(graph.inputArgs.slice(0, 5)).toEqual(["-t", "10", "-f", "lavfi", "-i"]);
    expect(graph.inputArgs[5]).toContain("anullsrc");
    // One `-f lavfi -i <source>` pair per cue, after the silence pad.
    const lavfiInputCount = graph.inputArgs.filter((arg) => arg === "lavfi").length;
    expect(lavfiInputCount).toBe(cues.length + 1);
  });

  it("delays each cue by its timestamp in milliseconds", () => {
    const cues: AudioCue[] = [
      { time: 0, type: "move" },
      { time: 1.234, type: "reveal" },
    ];
    const graph = buildAudioFilterGraph(cues, 5);
    expect(graph.filterComplex).toContain("adelay=0:all=1");
    expect(graph.filterComplex).toContain("adelay=1234:all=1");
  });

  it("mixes every input (including the silence pad) with duration pinned to it, unattenuated", () => {
    const cues: AudioCue[] = [
      { time: 0.5, type: "check" },
      { time: 1.5, type: "checkmate" },
      { time: 2.5, type: "countdown-tick" },
    ];
    const graph = buildAudioFilterGraph(cues, 8);
    expect(graph.filterComplex).toContain(
      `amix=inputs=${cues.length + 1}:duration=first:normalize=0`,
    );
    expect(graph.filterComplex).toContain(`[${graph.outputLabel}]`);
    // The silence pad (input 0) and every cue's shaped label feed the mix.
    expect(graph.filterComplex).toContain("[0:a][a0][a1][a2]amix");
  });

  it("produces a valid (empty-mix) graph with zero cues", () => {
    const graph = buildAudioFilterGraph([], 3);
    expect(graph.filterComplex).toContain("amix=inputs=1:duration=first:normalize=0");
    expect(graph.inputArgs.filter((arg) => arg === "lavfi")).toHaveLength(1);
  });

  it("shapes each cue with fade-in, fade-out, and its own gain before delaying it", () => {
    const graph = buildAudioFilterGraph([{ time: 3, type: "move" }], 5);
    // move: durationSeconds 0.09, fadeIn 0.005, fadeOut 0.02, gain 0.16 (src/audio/sounds.ts).
    expect(graph.filterComplex).toContain("afade=t=in:st=0:d=0.005");
    expect(graph.filterComplex).toContain("afade=t=out:st=0.06999999999999999:d=0.02");
    expect(graph.filterComplex).toContain("volume=0.16");
  });
});
