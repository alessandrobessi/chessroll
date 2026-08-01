import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempDir {
  path: string;
  /** No-op when `keep` was true, so callers never need to branch on it. */
  cleanup: () => Promise<void>;
}

export async function createTempDir(options: { prefix: string; keep?: boolean }): Promise<TempDir> {
  const path = await mkdtemp(join(tmpdir(), `${options.prefix}-`));
  return {
    path,
    cleanup: async () => {
      if (options.keep) return;
      await rm(path, { recursive: true, force: true });
    },
  };
}
