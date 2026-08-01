import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { EngineAnalysisError, MissingDependencyError } from "../utils/errors.js";

interface Waiter {
  test: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
}

/**
 * Low-level UCI line I/O over a spawned engine process. Owns nothing about
 * chess semantics — just "send a command" / "wait for a line matching a
 * predicate" / "subscribe to every line". BLUEPRINT.md §5's lifecycle
 * (uci/uciok/setoption/isready/readyok/position/go/info/bestmove) is built
 * on top of this in stockfish.ts.
 */
export class UciProcess {
  private readonly waiters: Waiter[] = [];
  private readonly listeners: Array<(line: string) => void> = [];
  private closed = false;
  private closeError: Error | undefined;

  private constructor(private readonly child: ChildProcessWithoutNullStreams) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      this.handleLine(line);
    });

    child.on("exit", (code) => {
      this.closed = true;
      this.closeError = new EngineAnalysisError(
        `Engine process exited unexpectedly (code ${code ?? "unknown"})`,
      );
      this.rejectAllWaiters(this.closeError);
    });
  }

  static spawn(binaryPath: string): Promise<UciProcess> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const child = spawn(binaryPath, [], { stdio: ["pipe", "pipe", "pipe"] });

      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        reject(
          new MissingDependencyError(`Failed to start engine at "${binaryPath}"`, { cause: error }),
        );
      });

      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        resolve(new UciProcess(child));
      });
    });
  }

  send(command: string): void {
    if (this.closed) {
      throw this.closeError ?? new EngineAnalysisError("Engine process already exited");
    }
    this.child.stdin.write(`${command}\n`);
  }

  /** Subscribes to every line; returns an unsubscribe function. */
  onLine(listener: (line: string) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  private handleLine(line: string): void {
    for (const listener of this.listeners) listener(line);
    const index = this.waiters.findIndex((w) => w.test(line));
    if (index !== -1) {
      const [waiter] = this.waiters.splice(index, 1);
      waiter!.resolve(line);
    }
  }

  waitForLine(test: (line: string) => boolean, timeoutMs = 15_000): Promise<string> {
    if (this.closed) {
      return Promise.reject(
        this.closeError ?? new EngineAnalysisError("Engine process already exited"),
      );
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        test,
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(
          new EngineAnalysisError(`Timed out after ${timeoutMs}ms waiting for engine response`),
        );
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  private rejectAllWaiters(error: Error): void {
    const pending = this.waiters.splice(0, this.waiters.length);
    for (const waiter of pending) waiter.reject(error);
  }

  async quit(): Promise<void> {
    if (this.closed) return;
    try {
      this.send("quit");
    } catch {
      // already exited between the check above and here — fine, nothing to do
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill("SIGKILL");
        resolve();
      }, 2000);
      this.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
