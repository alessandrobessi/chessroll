/**
 * Design tokens shared across the whole product (AGENTS.md "Visual design").
 * Board/piece values below are Chessroll-chosen defaults still pending
 * visual sign-off once real frames render (BLUEPRINT.md §10).
 */
export const COLORS = {
  background: "#F6F3EC",
  primary: "#171717",
  accent: "#6B1F2A",
  secondary: "#6B6B68",

  boardLight: "#EDEAE1",
  boardDark: "#8B8372",

  pieceWhiteFill: "#FBFAF7",
  pieceWhiteStroke: "#171717",
  pieceBlackFill: "#171717",
  pieceBlackStroke: "none",
} as const;

export const FONT_FAMILY = '"Inter", system-ui, sans-serif';

/** Default canvas — 1080x1920 per AGENTS.md/ROADMAP.md non-negotiables. */
export const CANVAS = {
  width: 1080,
  height: 1920,
} as const;
