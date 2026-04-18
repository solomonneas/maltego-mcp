import { ToolValidationError } from "./errors.js";
import { resolve, isAbsolute, relative } from "node:path";

export function resolveHomeTilde(path: string): string {
  if (!path.startsWith("~")) return path;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    throw new ToolValidationError("cannot resolve '~': no HOME/USERPROFILE set");
  }
  return path.replace(/^~/, home);
}

export function rejectNullBytes(path: string): void {
  if (path.includes("\0")) {
    throw new ToolValidationError(`path contains NUL byte: ${path}`);
  }
}

/**
 * Confine a caller-supplied path to the configured output directory.
 * - Relative paths are resolved under outputDir.
 * - Absolute paths (including after ~ expansion) must be inside outputDir.
 * - Returns the canonicalized absolute path.
 * Throws ToolValidationError if the resolved path escapes outputDir.
 */
export function confineToOutputDir(userPath: string, outputDir: string): string {
  rejectNullBytes(userPath);
  const expanded = resolveHomeTilde(userPath);
  const absoluteTarget = isAbsolute(expanded)
    ? resolve(expanded)
    : resolve(outputDir, expanded);
  const absoluteBase = resolve(outputDir);
  const rel = relative(absoluteBase, absoluteTarget);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new ToolValidationError(
      `path '${userPath}' resolves outside the configured output directory (${absoluteBase}); ` +
        `set MALTEGO_MCP_OUTPUT_DIR to a parent of your target or use a path under the current output dir`
    );
  }
  return absoluteTarget;
}
