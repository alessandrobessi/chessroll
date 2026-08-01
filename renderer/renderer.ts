import { defaultBoardGeometry } from "../src/board/geometry.js";
import { renderBoardSvg, renderOverlayHtml } from "../src/board/render.js";
import { stateAtTime } from "../src/scene/state.js";
import type { SceneTimeline } from "../src/scene/types.js";

declare global {
  interface Window {
    __CHESSROLL_TIMELINE__?: SceneTimeline;
    renderAtTime: (t: number) => void;
  }
}

function main(): void {
  const timeline = window.__CHESSROLL_TIMELINE__;
  if (!timeline) {
    throw new Error("window.__CHESSROLL_TIMELINE__ was not injected before renderer.js loaded");
  }

  const boardRoot = document.getElementById("board-root");
  const overlayRoot = document.getElementById("overlay-root");
  if (!boardRoot || !overlayRoot) {
    throw new Error("renderer/index.html is missing #board-root or #overlay-root");
  }

  window.renderAtTime = (t: number) => {
    const descriptor = stateAtTime(timeline, t);
    const geometry = defaultBoardGeometry(descriptor.position.orientation);
    boardRoot.innerHTML = renderBoardSvg(descriptor, { geometry, t });
    overlayRoot.innerHTML = renderOverlayHtml(descriptor);
  };

  // Paint an initial frame so a screenshot taken before the first explicit
  // renderAtTime() call still shows something sane.
  window.renderAtTime(0);
}

main();
