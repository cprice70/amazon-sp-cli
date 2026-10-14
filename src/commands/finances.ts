import type { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson, formatCurrency } from "../output.js";
import { runCommand } from "../errors.js";
import { collectPages, parseLimit, pageSizeFor } from "../paginate.js";

/** Finances v0 list operations accept MaxResultsPerPage of 1-100. */
const V0_PAGE_MAX = 100;

interface Currency {
  CurrencyAmount?: number;
  CurrencyCode?: string;
}

interface FinancialEventGroup {
  FinancialEventGroupId?: string;
  ProcessingStatus?: string;
  FundTransferStatus?: string;
  FinancialEventGroupStart?: string;
  FinancialEventGroupEnd?: string;
  OriginalTotal?: Currency;
  ConvertedTotal?: Currency;
}

interface ListFinancialEventGroupsResult {
  FinancialEventGroupList?: FinancialEventGroup[];
  NextToken?: string;
}

type FinancialEvent = Record<string, unknown>;

interface ListFinancialEventsResult {
  FinancialEvents?: Record<string, FinancialEvent[] | undefined>;
  NextToken?: string;
}

/** A single event, tagged with the list it came from (minus "EventList"). */
interface FlatEvent {
  type: string;
  event: FinancialEvent;
}

type TransactionStatus = "DEFERRED" | "RELEASED" | "DEFERRED_RELEASED";

interface Transaction {
  transactionType?: string;
  transactionStatus?: string;
  postedDate?: string;
  description?: string;
  totalAmount?: { currencyAmount?: number; currencyCode?: string };
  relatedIdentifiers?: Array<{ relatedIdentifierName?: string; relatedIdentifierValue?: string }>;
}

interface ListTransactionsResult {
  transactions?: Transaction[];
  nextToken?: string;
}

/** Maximum width of free-text columns. */
const TEXT_WIDTH = 40;

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function money(amount: Currency | undefined): string {
  if (!amount || amount.CurrencyAmount === undefined) return "";
  return formatCurrency(amount.CurrencyAmount, amount.CurrencyCode);
}

function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === "object" &&
    value !== null &&
    "CurrencyAmount" in value &&
    typeof (value as Currency).CurrencyAmount === "number"
  );
}

/** Flatten `{ ShipmentEventList: [...], RefundEventList: [...] }` into tagged rows. */
function flattenEvents(
  events: Record<string, FinancialEvent[] | undefined> | undefined
): FlatEvent[] {
  const flat: FlatEvent[] = [];
  for (const [key, list] of Object.entries(events ?? {})) {
    if (!Array.isArray(list)) continue;
    const type = key.replace(/EventList$/, "").replace(/List$/, "");
    for (const event of list) flat.push({ type, event });
  }
  return flat;
}

/**
 * Best-effort amount for an event: the first top-level Currency field, or the
 * sum of a fee list for fee events. Shipment events carry per-item charges
 * instead, so they show an item count via `describeEvent`.
 */
function eventAmount(event: FinancialEvent): string {
  for (const value of Object.values(event)) {
    if (isCurrency(value)) return money(value);
  }
  const fees = event.FeeList;
  if (Array.isArray(fees)) {
    let total = 0;
    let code: string | undefined;
    for (const fee of fees as Array<{ FeeAmount?: Currency }>) {
      if (isCurrency(fee.FeeAmount)) {
        total += fee.FeeAmount.CurrencyAmount ?? 0;
        code = code ?? fee.FeeAmount.CurrencyCode;
      }
    }
    if (code) return formatCurrency(total, code);
  }
  return "";
}

function describeEvent(event: FinancialEvent): string {
  const text = [
    event.MarketplaceName,
    event.AdjustmentType,
    event.FeeReason,
    event.TransactionType,
    event.Description,
  ].find((value) => typeof value === "string" && value) as string | undefined;
  const items = event.ShipmentItemList;
  const count = Array.isArray(items)
    ? `${items.length} item${items.length === 1 ? "" : "s"}`
    : undefined;
  return [text, count].filter(Boolean).join(", ");
}

export function registerFinancesCommands(
  program: Command,
  client: SellingPartner,
  resolveMarketplaceId: (opts: { marketplace?: string }) => string
): void {
  const finances = program
    .command("finances")
    .description("Settlements, financial events, and transactions");

  finances
    .command("groups")
    .description("List financial event groups (settlement periods), last 90 days by default")
    .option("--start <date>", "ISO date for FinancialEventGroupStartedAfter")
    .option("--end <date>", "ISO date for FinancialEventGroupStartedBefore")
    .option("--limit <n>", "Maximum number of groups to return", parseLimit)
    .option("--all", "Fetch every page of results")
    .option("--json", "Output raw JSON instead of table")
    .action(
      async (opts: {
        start?: string;
        end?: string;
        limit?: number;
        all?: boolean;
        json?: boolean;
      }) => {
        await runCommand("list financial event groups", async () => {
          const groups = await collectPages<FinancialEventGroup>(async (nextToken) => {
            const result = (await client.callAPI({
              operation: "listFinancialEventGroups",
              endpoint: "finances",
              options: { version: "v0" },
              query: {
                FinancialEventGroupStartedAfter: opts.start ?? daysAgo(90),
                FinancialEventGroupStartedBefore: opts.end,
                MaxResultsPerPage: pageSizeFor(opts.limit, V0_PAGE_MAX),
                NextToken: nextToken,
              },
            })) as unknown as ListFinancialEventGroupsResult;
            return { items: result.FinancialEventGroupList, nextToken: result.NextToken };
          }, opts);

          if (opts.json) {
            printJson(groups);
            return;
          }

          if (groups.length === 0) {
            console.log("No financial event groups found.");
            return;
          }

          const rows = groups.map((group) => [
            group.FinancialEventGroupId ?? "",
            group.ProcessingStatus ?? "",
            group.FundTransferStatus ?? "",
            group.FinancialEventGroupStart ?? "",
            group.FinancialEventGroupEnd ?? "",
            money(group.ConvertedTotal ?? group.OriginalTotal),
          ]);

          printTable(["Group ID", "Status", "Transfer", "Start", "End", "Total"], rows);
        });
      }
    );

  finances
    .command("events")
    .description("List financial events, last 30 days by default")
    .option("--order <id>", "Events for a single order")
    .option("--group <id>", "Events in a financial event group")
    .option("--start <date>", "ISO date for PostedAfter (ignored with --order/--group)")
    .option("--end <date>", "ISO date for PostedBefore (ignored with --order/--group)")
    .option("--limit <n>", "Maximum number of events to return", parseLimit)
    .option("--all", "Fetch every page of results")
    .option("--json", "Output the raw FinancialEvents object instead of a table")
    .action(
      async (opts: {
        order?: string;
        group?: string;
        start?: string;
        end?: string;
        limit?: number;
        all?: boolean;
        json?: boolean;
      }) => {
        await runCommand("list financial events", async () => {
          const raw: Record<string, FinancialEvent[]> = {};

          const events = await collectPages<FlatEvent>(async (nextToken) => {
            const paging = {
              MaxResultsPerPage: pageSizeFor(opts.limit, V0_PAGE_MAX),
              NextToken: nextToken,
            };
            const request = opts.order
              ? {
                  operation: "listFinancialEventsByOrderId" as const,
                  path: { orderId: opts.order },
                  query: paging,
                }
              : opts.group
                ? {
                    operation: "listFinancialEventsByGroupId" as const,
                    path: { eventGroupId: opts.group },
                    query: paging,
                  }
                : {
                    operation: "listFinancialEvents" as const,
                    query: {
                      PostedAfter: opts.start ?? daysAgo(30),
                      PostedBefore: opts.end,
                      ...paging,
                    },
                  };

            const result = (await client.callAPI({
              endpoint: "finances",
              options: { version: "v0" },
              ...request,
            })) as unknown as ListFinancialEventsResult;

            // Keep the untouched lists for --json, merged across pages.
            for (const [key, list] of Object.entries(result.FinancialEvents ?? {})) {
              if (Array.isArray(list)) raw[key] = [...(raw[key] ?? []), ...list];
            }

            return { items: flattenEvents(result.FinancialEvents), nextToken: result.NextToken };
          }, opts);

          if (opts.json) {
            printJson(raw);
            return;
          }

          if (events.length === 0) {
            console.log("No financial events found.");
            return;
          }

          const rows = events.map(({ type, event }) => [
            type,
            typeof event.PostedDate === "string" ? event.PostedDate : "",
            typeof event.AmazonOrderId === "string" ? event.AmazonOrderId : "",
            eventAmount(event),
            describeEvent(event),
          ]);

          printTable(["Type", "Posted", "Order ID", "Amount", "Detail"], rows, {
            maxWidths: [undefined, undefined, undefined, undefined, TEXT_WIDTH],
          });
        });
      }
    );

  finances
    .command("transactions")
    .description("List transactions (Finances 2024-06-19), last 30 days by default")
    .option("--start <date>", "ISO date for postedAfter")
    .option("--end <date>", "ISO date for postedBefore")
    .option("--status <status>", "Filter: DEFERRED, RELEASED, or DEFERRED_RELEASED")
    .option("--limit <n>", "Maximum number of transactions to return", parseLimit)
    .option("--all", "Fetch every page of results")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(
      async (opts: {
        start?: string;
        end?: string;
        status?: string;
        limit?: number;
        all?: boolean;
        marketplace?: string;
        json?: boolean;
      }) => {
        await runCommand("list transactions", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

          const transactions = await collectPages<Transaction>(async (nextToken) => {
            const result = (await client.callAPI({
              operation: "listTransactions",
              endpoint: "finances",
              options: { version: "2024-06-19" },
              query: {
                postedAfter: opts.start ?? daysAgo(30),
                postedBefore: opts.end,
                marketplaceId,
                transactionStatus: opts.status?.trim().toUpperCase() as
                  TransactionStatus | undefined,
                nextToken,
              },
            })) as unknown as ListTransactionsResult;
            return { items: result.transactions, nextToken: result.nextToken };
          }, opts);

          if (opts.json) {
            printJson(transactions);
            return;
          }

          if (transactions.length === 0) {
            console.log("No transactions found.");
            return;
          }

          const rows = transactions.map((tx) => {
            const related =
              tx.relatedIdentifiers?.find((r) => r.relatedIdentifierName === "ORDER_ID") ??
              tx.relatedIdentifiers?.[0];
            return [
              tx.postedDate ?? "",
              tx.transactionType ?? "",
              tx.transactionStatus ?? "",
              related?.relatedIdentifierValue ?? "",
              tx.totalAmount?.currencyAmount === undefined
                ? ""
                : formatCurrency(tx.totalAmount.currencyAmount, tx.totalAmount.currencyCode),
              tx.description ?? "",
            ];
          });

          printTable(["Posted", "Type", "Status", "Related", "Amount", "Description"], rows, {
            maxWidths: [undefined, undefined, undefined, undefined, undefined, TEXT_WIDTH],
          });
        });
      }
    );
}
