/**
 * Helpers for errors thrown by the amazon-sp-api client.
 *
 * The client throws a CustomError: a plain Error whose message is the SP-API
 * response's `message`, with the other body fields (`code`, `details`, `type`)
 * copied onto the object. The `details` field is where Amazon puts the useful
 * part ("The LWA secret token you provided has expired."), so surface it.
 */

import { printError } from "./output.js";

interface SpApiErrorFields {
  code?: unknown;
  details?: unknown;
}

/** Process exit codes. */
export const EXIT = {
  /** Command ran but the API call or other work failed. */
  FAILURE: 1,
  /** Bad input: missing marketplace/seller ID, malformed JSON body, etc. */
  USAGE: 2,
  /** Missing, expired, or rejected credentials. */
  AUTH: 3,
} as const;

/**
 * An error whose message is already user-facing. runCommand prints it
 * verbatim (no "Failed to ..." prefix) and exits with `exitCode`.
 */
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT.USAGE) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

const AUTH_CODES = new Set(["unauthorized", "forbidden", "accessdenied", "invalidsignature"]);

export function formatApiError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const details = (err as Error & SpApiErrorFields).details;
  if (typeof details === "string" && details.trim()) {
    return `${err.message} (${details.trim()})`;
  }
  return err.message;
}

export function isAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as Error & SpApiErrorFields).code;
  if (typeof code === "string" && AUTH_CODES.has(code.toLowerCase())) return true;
  const msg = err.message.toLowerCase();
  return msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden");
}

/**
 * Run a command action with the standard CLI error handling.
 *
 * - CliError: print its message as-is, exit with its code.
 * - Auth error from the API: print `Failed to <label>: <message>` plus a
 *   re-authentication hint, exit EXIT.AUTH.
 * - Anything else: print `Failed to <label>: <message>`, exit EXIT.FAILURE.
 */
export async function runCommand(label: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err) {
    if (err instanceof CliError) {
      printError(err.message);
      process.exit(err.exitCode);
    }
    printError(`Failed to ${label}: ${formatApiError(err)}`);
    if (isAuthError(err)) {
      printError("Hint: run 'auth login' to re-authenticate.");
      process.exit(EXIT.AUTH);
    }
    process.exit(EXIT.FAILURE);
  }
}
