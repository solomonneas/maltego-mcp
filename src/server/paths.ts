import { ToolValidationError } from "./errors.js";

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
