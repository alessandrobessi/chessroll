import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import type { SceneTimeline } from "../scene/types.js";
import { RenderingError } from "../utils/errors.js";

export interface RendererSession {
  browser: Browser;
  page: Page;
  close: () => Promise<void>;
}

export interface LaunchRendererOptions {
  timeline: SceneTimeline;
  /** Absolute path to the built renderer/dist/index.html (see scripts/build.mjs). */
  rendererHtmlPath: string;
  width: number;
  height: number;
}

/**
 * Launches a single Chromium page, injects the scene timeline before
 * navigation, and confirms window.renderAtTime is ready. The page is
 * reused across the whole capture (BLUEPRINT.md §37): no per-frame
 * relaunch.
 */
export async function launchRenderer(options: LaunchRendererOptions): Promise<RendererSession> {
  const { timeline, rendererHtmlPath, width, height } = options;

  let browser: Browser;
  try {
    browser = await chromium.launch();
  } catch (cause) {
    throw new RenderingError("Failed to launch Chromium via Playwright", { cause });
  }

  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript((injectedTimeline: SceneTimeline) => {
    (globalThis as unknown as { __CHESSROLL_TIMELINE__: SceneTimeline }).__CHESSROLL_TIMELINE__ =
      injectedTimeline;
  }, timeline);

  await page.goto(pathToFileURL(rendererHtmlPath).href);

  const hasRenderAtTime = await page.evaluate(
    () => typeof (globalThis as unknown as { renderAtTime?: unknown }).renderAtTime === "function",
  );
  if (!hasRenderAtTime) {
    await browser.close();
    throw new RenderingError(
      `${rendererHtmlPath} did not expose window.renderAtTime — was the renderer built (pnpm build)?`,
    );
  }

  return { browser, page, close: () => browser.close() };
}

export async function renderAtTime(session: RendererSession, t: number): Promise<void> {
  await session.page.evaluate((time: number) => {
    (globalThis as unknown as { renderAtTime: (t: number) => void }).renderAtTime(time);
  }, t);
}
