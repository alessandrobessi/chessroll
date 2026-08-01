export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/**
 * Normalized progress of `t` within [start, end), clamped to [0, 1].
 * `end <= start` degenerates to progress 1 (instant).
 */
export function progressOf(t: number, start: number, end: number): number {
  if (end <= start) return t >= start ? 1 : 0;
  return clamp((t - start) / (end - start), 0, 1);
}

export function easeInOutCubic(progress: number): number {
  const p = clamp(progress, 0, 1);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
