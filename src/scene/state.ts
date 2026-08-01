import type { SceneDescriptor, SceneTimeline } from "./types.js";

/**
 * Pure lookup of the scene state at timestamp `t`. No wall clock, no
 * randomness, no dependency on any previously rendered frame — the same
 * `t` always yields the same descriptor (BLUEPRINT.md §8).
 *
 * `t < 0` clamps to the first segment; `t >= duration` clamps to the last.
 */
export function stateAtTime(timeline: SceneTimeline, t: number): SceneDescriptor {
  const { segments } = timeline;
  if (t < segments[0]!.start) {
    return segments[0]!.state;
  }
  for (const segment of segments) {
    if (t >= segment.start && t < segment.end) {
      return segment.state;
    }
  }
  return segments[segments.length - 1]!.state;
}
