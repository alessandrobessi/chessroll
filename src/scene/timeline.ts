import { StoryConstructionError } from "../utils/errors.js";
import type { SceneDescriptor, SceneSegment, SceneTimeline } from "./types.js";

/** Builds a segment spanning [start, start+length) with the given static state. */
export function phase(start: number, length: number, state: SceneDescriptor): SceneSegment {
  if (length <= 0) {
    throw new StoryConstructionError(`Segment length must be positive, got ${length}`);
  }
  return { start, end: start + length, state };
}

/**
 * Assembles segments into a timeline, verifying they are contiguous and
 * gapless (segment[i].end === segment[i + 1].start) — scene/state.ts's
 * lookup assumes this invariant.
 */
export function createTimeline(
  segments: SceneSegment[],
  options: { showCoordinates?: boolean } = {},
): SceneTimeline {
  if (segments.length === 0) {
    throw new StoryConstructionError("A scene timeline needs at least one segment");
  }
  for (let i = 1; i < segments.length; i++) {
    const previous = segments[i - 1]!;
    const current = segments[i]!;
    if (current.start !== previous.end) {
      throw new StoryConstructionError(
        `Scene segments must be contiguous: segment ${i - 1} ends at ${previous.end}, ` +
          `segment ${i} starts at ${current.start}`,
      );
    }
  }
  const last = segments[segments.length - 1]!;
  return { duration: last.end, segments, showCoordinates: options.showCoordinates };
}
