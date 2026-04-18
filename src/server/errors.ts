export class ToolValidationError extends Error {
  constructor(message: string, readonly suggestions?: string[]) {
    super(message);
    this.name = "ToolValidationError";
  }
}

export class ToolFileSystemError extends Error {
  constructor(message: string, readonly path: string, readonly cause?: NodeJS.ErrnoException) {
    super(message);
    this.name = "ToolFileSystemError";
  }
}

export class ToolParseError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = "ToolParseError";
  }
}

export function toToolResponse(err: unknown): {
  isError: true;
  content: { type: "text"; text: string }[];
} {
  const message =
    err instanceof Error ? `${err.name}: ${err.message}` : `UnknownError: ${String(err)}`;
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}
