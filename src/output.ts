import chalk from "chalk";
import Table from "cli-table3";

export interface TableOptions {
  /** Per-column maximum cell width; longer cells are cut and end with an ellipsis. */
  maxWidths?: (number | undefined)[];
}

/** Cut `text` to at most `max` characters, ending with "…" when shortened. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, Math.max(0, max - 1)).join("") + "…";
}

export function printTable(
  headers: string[],
  rows: (string | number)[][],
  options: TableOptions = {}
): void {
  const table = new Table({
    head: headers.map((h) => chalk.cyan.bold(h)),
    style: { head: [] },
  });

  for (const row of rows) {
    table.push(
      row.map((cell, i) => {
        const text = String(cell);
        const max = options.maxWidths?.[i];
        return max === undefined ? text : truncate(text, max);
      })
    );
  }

  console.log(table.toString());
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}

export function printError(message: string): void {
  console.error(chalk.red(message));
}

export function printWarning(message: string): void {
  console.warn(chalk.yellow(message));
}

export function colorState(state: string): string {
  switch (state.toUpperCase()) {
    case "PENDING":
      return chalk.yellow(state);
    case "UNSHIPPED":
      return chalk.yellow(state);
    case "PARTIALLY_SHIPPED":
      return chalk.blue(state);
    case "SHIPPED":
      return chalk.green(state);
    case "CANCELED":
      return chalk.red(state);
    case "UNFULFILLABLE":
      return chalk.red(state);
    default:
      return state;
  }
}

export function formatCurrency(amount: number | string | undefined, currencyCode?: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  const value = Number.isNaN(num) ? 0 : num;

  if (currencyCode) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(
        value
      );
    } catch {
      // Unknown ISO code (RangeError) — fall through to the plain format.
    }
  }
  return `$${value.toFixed(2)}`;
}
