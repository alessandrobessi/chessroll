import type { AudioCueType } from "./timeline.js";

export interface SoundParams {
  /**
   * An `-f lavfi -i` source descriptor (without the `-f lavfi -i` prefix),
   * e.g. `sine=frequency=349` or an `aevalsrc=exprs='...'` expression.
   * Self-contained and reused verbatim for every occurrence of this cue.
   */
  source: string;
  durationSeconds: number;
  /** Peak gain applied via the `volume` filter, deliberately restrained (BLUEPRINT.md §28). */
  gain: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

/**
 * Every cue is synthesized, never sourced from anywhere — sidesteps
 * BLUEPRINT.md §28's "sound files must be original or legally
 * redistributable" requirement entirely, and keeps generation a pure,
 * deterministic function of cue type (same spirit as renderAtTime(t)'s
 * determinism). Frequencies/durations/gains below are initial defaults,
 * intentionally short and quiet ("keep sound restrained", "avoid noisy
 * game-like sound effects") — tunable after listening.
 */
export const SOUND_PARAMS: Record<AudioCueType, SoundParams> = {
  move: {
    source: "sine=frequency=349",
    durationSeconds: 0.09,
    gain: 0.16,
    fadeInSeconds: 0.005,
    fadeOutSeconds: 0.02,
  },
  capture: {
    source: "sine=frequency=261",
    durationSeconds: 0.11,
    gain: 0.2,
    fadeInSeconds: 0.005,
    fadeOutSeconds: 0.02,
  },
  check: {
    source: "sine=frequency=622",
    durationSeconds: 0.1,
    gain: 0.2,
    fadeInSeconds: 0.005,
    fadeOutSeconds: 0.02,
  },
  // Two tones summed and pre-scaled to unit amplitude inside the
  // expression itself (0.5 + 0.5), so the source never clips before the
  // downstream `volume` filter attenuates it further.
  checkmate: {
    source: "aevalsrc=exprs='0.5*sin(2*PI*440*t)+0.5*sin(2*PI*660*t)':s=44100",
    durationSeconds: 0.4,
    gain: 0.22,
    fadeInSeconds: 0.01,
    fadeOutSeconds: 0.15,
  },
  "countdown-tick": {
    source: "sine=frequency=988",
    durationSeconds: 0.045,
    gain: 0.12,
    fadeInSeconds: 0.002,
    fadeOutSeconds: 0.01,
  },
  // A short rising chirp approximation (instantaneous frequency climbs
  // from ~440Hz towards ~880Hz over the clip) — a gentle "aha" swell, not
  // a literal linear-chirp integral.
  reveal: {
    source: "aevalsrc=exprs='sin(2*PI*(440+660*t)*t)':s=44100",
    durationSeconds: 0.3,
    gain: 0.18,
    fadeInSeconds: 0.02,
    fadeOutSeconds: 0.12,
  },
};
