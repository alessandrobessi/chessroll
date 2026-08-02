/**
 * Design tokens shared across the whole product (AGENTS.md "Visual design").
 * Board colors below are a Chessroll-chosen default still pending visual
 * sign-off once real frames render (BLUEPRINT.md §10). Piece colors are
 * not themed here — they're baked into the vendored cburnett SVG markup
 * itself (src/board/pieces.ts).
 */
export const COLORS = {
  background: "#F6F3EC",
  primary: "#171717",
  accent: "#6B1F2A",
  secondary: "#6B6B68",

  boardLight: "#EDEAE1",
  boardDark: "#8B8372",
} as const;

// Deliberately a system stack rather than a bundled/self-hosted font for
// this pass: rendering happens on one pinned local Chromium, so frame-to-
// frame determinism only requires the same machine to resolve the same
// font consistently, which named serif fallbacks already guarantee.
// Self-hosting a specific typeface (e.g. an actual Palatino/Zapf license)
// is a reasonable follow-up. "Palatino Linotype" resolves on Windows,
// "Palatino"/"Book Antiqua" on macOS, and Georgia is a widely available
// serif fallback everywhere else.
export const FONT_FAMILY = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

/** Default canvas — 1080x1920 per AGENTS.md/ROADMAP.md non-negotiables. */
export const CANVAS = {
  width: 1080,
  height: 1920,
} as const;
