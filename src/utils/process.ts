import which from "which";
import { MissingDependencyError } from "./errors.js";

/**
 * Resolves an executable to an absolute path: `explicitPath` wins if given,
 * otherwise it's discovered on PATH. Throws MissingDependencyError (exit 5)
 * with an actionable message when neither works.
 */
export async function findExecutable(
  name: string,
  options: { explicitPath?: string; installHint: string },
): Promise<string> {
  if (options.explicitPath) {
    return options.explicitPath;
  }
  const found = await which(name, { nothrow: true });
  if (!found) {
    throw new MissingDependencyError(`"${name}" was not found on PATH. ${options.installHint}`);
  }
  return found;
}
