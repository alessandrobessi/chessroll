import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import envPaths from "env-paths";
import type { PositionAnalysis } from "./analysis.js";

export interface CacheKeyParams {
  fen: string;
  engineVersion: string;
  depth?: number;
  nodes?: number;
  multiPv: number;
}

/**
 * Threads/Hash are deliberately excluded from the key (BLUEPRINT.md §6:
 * "only if they materially affect expected result contract") — they're
 * performance knobs, not part of what a cached result promises.
 */
function cacheKey(params: CacheKeyParams): string {
  const stable = JSON.stringify({
    fen: params.fen,
    engineVersion: params.engineVersion,
    depth: params.depth ?? null,
    nodes: params.nodes ?? null,
    multiPv: params.multiPv,
  });
  return createHash("sha1").update(stable).digest("hex");
}

/**
 * On-disk JSON analysis cache, stored under the OS cache directory (outside
 * source control, per BLUEPRINT.md §6) rather than a repo-local folder.
 */
export class AnalysisCache {
  private readonly dir: string;

  constructor(baseDir: string = envPaths("chessroll").cache) {
    this.dir = join(baseDir, "analysis");
  }

  private fileFor(params: CacheKeyParams): string {
    return join(this.dir, `${cacheKey(params)}.json`);
  }

  async get(params: CacheKeyParams): Promise<PositionAnalysis | undefined> {
    try {
      const raw = await readFile(this.fileFor(params), "utf8");
      return JSON.parse(raw) as PositionAnalysis;
    } catch {
      return undefined;
    }
  }

  async set(params: CacheKeyParams, analysis: PositionAnalysis): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.fileFor(params), JSON.stringify(analysis, null, 2), "utf8");
  }
}
