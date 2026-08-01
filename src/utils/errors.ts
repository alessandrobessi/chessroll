export type ExitCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export abstract class ChessrollError extends Error {
  abstract readonly exitCode: ExitCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Exit code 1: unexpected/internal failure. */
export class UnexpectedError extends ChessrollError {
  readonly exitCode = 1;
}

/** Exit code 2: invalid CLI arguments. */
export class CliArgumentError extends ChessrollError {
  readonly exitCode = 2;
}

/** Exit code 3: missing/unreadable input. */
export class InputNotFoundError extends ChessrollError {
  readonly exitCode = 3;
}

/** Exit code 4: invalid PGN/FEN. */
export class InvalidChessInputError extends ChessrollError {
  readonly exitCode = 4;
}

/** Exit code 5: missing dependency (Stockfish, ffmpeg, Chromium). */
export class MissingDependencyError extends ChessrollError {
  readonly exitCode = 5;
}

/** Exit code 6: Stockfish analysis failure. */
export class EngineAnalysisError extends ChessrollError {
  readonly exitCode = 6;
}

/** Exit code 7: story/template construction failure. */
export class StoryConstructionError extends ChessrollError {
  readonly exitCode = 7;
}

/** Exit code 8: visual rendering failure. */
export class RenderingError extends ChessrollError {
  readonly exitCode = 8;
}

/** Exit code 9: video encoding failure. */
export class EncodingError extends ChessrollError {
  readonly exitCode = 9;
}

/** Exit code 10: output/filesystem failure. */
export class OutputError extends ChessrollError {
  readonly exitCode = 10;
}
