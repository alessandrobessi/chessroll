import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function buildCli() {
  await build({
    entryPoints: [`${root}src/cli.ts`, `${root}src/debug-cli.ts`],
    outdir: `${root}dist`,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    packages: "external",
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: true,
  });
}

async function buildRenderer() {
  await build({
    entryPoints: [`${root}renderer/renderer.ts`],
    outfile: `${root}renderer/dist/renderer.js`,
    bundle: true,
    platform: "browser",
    target: "es2022",
    format: "iife",
    sourcemap: true,
  });

  await cp(`${root}renderer/index.html`, `${root}renderer/dist/index.html`);
  await cp(`${root}renderer/renderer.css`, `${root}renderer/dist/renderer.css`);
}

async function main() {
  await rm(`${root}dist`, { recursive: true, force: true });
  await rm(`${root}renderer/dist`, { recursive: true, force: true });
  await buildCli();
  await buildRenderer();
}

await main();
