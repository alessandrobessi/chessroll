import { describe, expect, it } from "vitest";
import { createTimeline, phase } from "../../../src/scene/timeline.js";
import { stateAtTime } from "../../../src/scene/state.js";
import type { SceneDescriptor } from "../../../src/scene/types.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function descriptor(label: string): SceneDescriptor {
  return { position: { fen: START_FEN, orientation: "white" }, title: { text: label } };
}

describe("stateAtTime", () => {
  const timeline = createTimeline([
    phase(0, 1, descriptor("intro")),
    phase(1, 2, descriptor("prompt")),
    phase(3, 1, descriptor("solve")),
  ]);

  it("returns the segment covering t", () => {
    expect(stateAtTime(timeline, 0).title?.text).toBe("intro");
    expect(stateAtTime(timeline, 0.5).title?.text).toBe("intro");
    expect(stateAtTime(timeline, 1).title?.text).toBe("prompt");
    expect(stateAtTime(timeline, 2.9).title?.text).toBe("prompt");
    expect(stateAtTime(timeline, 3).title?.text).toBe("solve");
  });

  it("clamps t before the first segment to the first segment", () => {
    expect(stateAtTime(timeline, -1).title?.text).toBe("intro");
  });

  it("clamps t at or after the duration to the last segment", () => {
    expect(stateAtTime(timeline, 4).title?.text).toBe("solve");
    expect(stateAtTime(timeline, 100).title?.text).toBe("solve");
  });

  it("is a pure function: identical t always yields an equal descriptor", () => {
    const a = stateAtTime(timeline, 1.5);
    const b = stateAtTime(timeline, 1.5);
    expect(a).toEqual(b);
  });
});
