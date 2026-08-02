import { extname, join, dirname, basename } from "node:path";

/** "game.pgn" -> "game.mp4", "position.fen" -> "position.mp4". */
export function defaultOutputPath(inputPath: string): string {
  const ext = extname(inputPath);
  const base = basename(inputPath, ext);
  return join(dirname(inputPath), `${base}.mp4`);
}

/** "game.pgn" -> "game-auto/" — a directory, since --template auto writes multiple videos. */
export function defaultOutputDir(inputPath: string): string {
  const ext = extname(inputPath);
  const base = basename(inputPath, ext);
  return join(dirname(inputPath), `${base}-auto`);
}
