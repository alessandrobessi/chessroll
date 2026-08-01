import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SceneTimeline } from "../../src/scene/types.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let browser: Browser;
let page: Page;
let distDir: string;

beforeAll(async () => {
  distDir = await mkdtemp(join(tmpdir(), "chessroll-renderer-test-"));
  await build({
    entryPoints: [resolve("renderer/renderer.ts")],
    outfile: join(distDir, "renderer.js"),
    bundle: true,
    platform: "browser",
    target: "es2022",
    format: "iife",
  });
  await cp(resolve("renderer/index.html"), join(distDir, "index.html"));
  await cp(resolve("renderer/renderer.css"), join(distDir, "renderer.css"));

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
});

afterAll(async () => {
  await browser.close();
  await rm(distDir, { recursive: true, force: true });
});

// These callbacks execute inside the browser page, where `window` carries
// the ambient augmentation declared in renderer/renderer.ts. This test
// file compiles under the Node tsconfig (no DOM lib), so `window` isn't a
// known global here — go through `globalThis` cast instead of pulling DOM
// types into the whole Node build just for two call sites.
function setTimelineInPage(tl: SceneTimeline): void {
  (globalThis as unknown as { __CHESSROLL_TIMELINE__: SceneTimeline }).__CHESSROLL_TIMELINE__ = tl;
}

function renderAtTimeInPage(t: number): void {
  (globalThis as unknown as { renderAtTime: (t: number) => void }).renderAtTime(t);
}

async function loadTimeline(timeline: SceneTimeline): Promise<void> {
  await page.addInitScript(setTimelineInPage, timeline);
  await page.goto(`file://${join(distDir, "index.html")}`);
}

describe("renderer.js (browser bundle)", () => {
  it("paints the initial position on load via the automatic t=0 render", async () => {
    const timeline: SceneTimeline = {
      duration: 1,
      segments: [
        {
          start: 0,
          end: 1,
          state: { position: { fen: START_FEN, orientation: "white" } },
        },
      ],
    };
    await loadTimeline(timeline);
    const pieceCount = await page.locator("#board-root > g[transform]").count();
    expect(pieceCount).toBe(32);
  });

  it("interpolates a move at the animation midpoint with no duplicate piece", async () => {
    const timeline: SceneTimeline = {
      duration: 1,
      segments: [
        {
          start: 0,
          end: 1,
          state: {
            position: { fen: START_FEN, orientation: "white" },
            moveAnimation: {
              from: "e2",
              to: "e4",
              piece: { type: "pawn", color: "white" },
              start: 0,
              end: 1,
            },
          },
        },
      ],
    };
    await loadTimeline(timeline);
    await page.evaluate(renderAtTimeInPage, 0.5);

    const pieceCount = await page.locator("#board-root > g[transform]").count();
    expect(pieceCount).toBe(32);

    // The moving pawn must sit strictly between e2 and e4's y-coordinates,
    // not jump straight to the destination.
    const geometry = { x: 70, y: 560, size: 940 };
    const squareSize = geometry.size / 8;
    const e2Y = geometry.y + 6 * squareSize;
    const e4Y = geometry.y + 4 * squareSize;
    // No DOM lib in this Node-side test file, so type each node with just
    // the one member this callback needs.
    const transforms = await page
      .locator("#board-root > g[transform]")
      .evaluateAll((nodes) =>
        (nodes as Array<{ getAttribute(name: string): string | null }>).map((n) =>
          n.getAttribute("transform"),
        ),
      );
    const movingPawnY = transforms
      .map((t) => /translate\([\d.]+ ([\d.]+)\)/.exec(t ?? "")?.[1])
      .map((y) => (y ? Number(y) : undefined))
      .find((y) => y !== undefined && y > e4Y - 1 && y < e2Y + 1 && y !== e2Y && y !== e4Y);
    expect(movingPawnY).toBeDefined();
  });

  it("renders the overlay countdown text", async () => {
    const timeline: SceneTimeline = {
      duration: 1,
      segments: [
        {
          start: 0,
          end: 1,
          state: {
            position: { fen: START_FEN, orientation: "white" },
            countdown: { value: 4 },
          },
        },
      ],
    };
    await loadTimeline(timeline);
    const text = await page.locator("#overlay-root .countdown").textContent();
    expect(text).toBe("4");
  });
});
