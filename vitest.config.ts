import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts", "test/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Several test/e2e files (blunder, brilliant, gate40) build to the same
    // fixed renderer/dist/ path — renderVideo() resolves it relative to its
    // own module location, so it can't be pointed at a per-file temp dir.
    // Running test files in parallel lets one file's beforeAll/afterAll race
    // another's build/rm of that shared directory. Serialize file execution
    // to keep the suite deterministic.
    fileParallelism: false,
  },
});
