import { describe, expect, it } from "vitest";
import { renderArrow } from "../../../src/board/arrows.js";
import { createBoardGeometry } from "../../../src/board/geometry.js";

describe("renderArrow", () => {
  const geometry = createBoardGeometry({ x: 0, y: 0, size: 800, orientation: "white" });

  it("renders a shaft and a head for a diagonal arrow", () => {
    const svg = renderArrow({ from: "a1", to: "h8", color: "#6B1F2A", opacity: 0.9 }, geometry);
    expect(svg).toContain("<line");
    expect(svg).toContain("<polygon");
    expect(svg).toContain('stroke="#6B1F2A"');
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
  });

  it("renders nothing for a zero-length arrow (from === to)", () => {
    const svg = renderArrow({ from: "e4", to: "e4", color: "#6B1F2A", opacity: 1 }, geometry);
    expect(svg).toBe("");
  });
});
