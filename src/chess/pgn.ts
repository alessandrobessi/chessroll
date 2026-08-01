import { Chess, DEFAULT_POSITION } from "chess.js";
import { InvalidChessInputError } from "../utils/errors.js";
import { toPly } from "./game.js";
import type { ChessGame, GameMetadata } from "./types.js";

function parseElo(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readMetadata(headers: Record<string, string>): GameMetadata {
  return {
    event: headers.Event,
    site: headers.Site,
    date: headers.Date,
    round: headers.Round,
    white: headers.White,
    black: headers.Black,
    result: headers.Result,
    whiteElo: parseElo(headers.WhiteElo),
    blackElo: parseElo(headers.BlackElo),
  };
}

export function loadPgn(pgn: string): ChessGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (cause) {
    throw new InvalidChessInputError("Invalid PGN", { cause });
  }

  const headers = chess.getHeaders();
  const initialFen = headers.FEN ?? DEFAULT_POSITION;
  const plies = chess.history({ verbose: true }).map((move, index) => toPly(move, index));

  return {
    metadata: readMetadata(headers),
    initialFen,
    plies,
  };
}
