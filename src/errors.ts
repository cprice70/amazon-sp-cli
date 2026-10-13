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
 * Run a command action with the standard CLI error handling: on failure,
 * print `Failed to <label>: <message>`, add a re-auth hint for auth errors,
 * and exit 1.
 */
export async function runCommand(label: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err) {
    printError(`Failed to ${label}: ${formatApiError(err)}`);
    if (isAuthError(err)) {
      printError("Hint: run 'auth login' to re-authenticate.");
    }
    process.exit(1);
  }
}
