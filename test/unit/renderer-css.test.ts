import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("renderer.css determinism", () => {
  it("contains no transition, animation, or @keyframes rules", () => {
    const raw = readFileSync(new URL("../../renderer/renderer.css", import.meta.url), "utf8");
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments first
    expect(css).not.toMatch(/\btransition\s*:/i);
    expect(css).not.toMatch(/\banimation\s*:/i);
    expect(css).not.toMatch(/@keyframes/i);
  });
});
