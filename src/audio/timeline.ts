import type { Ply } from "../chess/types.js";

/**
 * Restrained cue set (BLUEPRINT.md §28/ROADMAP.md §23's move/capture/check/
 * countdown-tick/reveal, plus "checkmate" as a natural, still-subtle
 * extension distinguishing a mating move from an ordinary check).
 */
export type AudioCueType = "move" | "capture" | "check" | "checkmate" | "countdown-tick" | "reveal";

export interface AudioCue {
  time: number;
  type: AudioCueType;
}

/**
 * What a played move should sound like, off the flags chess.js already
 * computed (chess/game.ts) — no new chess-detection logic. Priority
 * mate > check > capture > move: a mating move has both `check` and `mate`
 * set, and must resolve to "checkmate", not "check". Castling, en passant,
 * and promotion deliberately get no dedicated cue — they fall through to
 * whichever of the four above applies, keeping the cue set minimal per
 * "keep sound restrained".
 */
export function cueForPly(ply: Ply): AudioCueType {
  if (ply.flags.mate) return "checkmate";
  if (ply.flags.check) return "check";
  if (ply.flags.capture) return "capture";
  return "move";
}
