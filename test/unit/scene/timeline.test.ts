import { describe, expect, it } from "vitest";
import { createTimeline, phase } from "../../../src/scene/timeline.js";
import { StoryConstructionError } from "../../../src/utils/errors.js";
import type { SceneDescriptor } from "../../../src/scene/types.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function descriptor(): SceneDescriptor {
  return { position: { fen: START_FEN, orientation: "white" } };
}

describe("phase", () => {
  it("builds a segment spanning [start, start+length)", () => {
    const segment = phase(2, 3, descriptor());
    expect(segment.start).toBe(2);
    expect(segment.end).toBe(5);
  });

  it("rejects a non-positive length", () => {
    expect(() => phase(0, 0, descriptor())).toThrow(StoryConstructionError);
    expect(() => phase(0, -1, descriptor())).toThrow(StoryConstructionError);
  });
});

describe("createTimeline", () => {
  it("computes duration from the last segment's end", () => {
    const timeline = createTimeline([phase(0, 1, descriptor()), phase(1, 2, descriptor())]);
    expect(timeline.duration).toBe(3);
    expect(timeline.segments).toHaveLength(2);
  });

  it("rejects an empty segment list", () => {
    expect(() => createTimeline([])).toThrow(StoryConstructionError);
  });

  it("rejects non-contiguous segments", () => {
    const gap = [phase(0, 1, descriptor()), phase(1.5, 1, descriptor())];
    expect(() => createTimeline(gap)).toThrow(StoryConstructionError);
  });

  it("leaves showCoordinates undefined by default and threads it through when passed", () => {
    const segments = [phase(0, 1, descriptor())];
    expect(createTimeline(segments).showCoordinates).toBeUndefined();
    expect(createTimeline(segments, { showCoordinates: true }).showCoordinates).toBe(true);
    expect(createTimeline(segments, { showCoordinates: false }).showCoordinates).toBe(false);
  });
});
