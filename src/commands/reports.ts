import { InvalidArgumentError } from "commander";
import type { Command } from "commander";
import type { SellingPartner } from "amazon-sp-api";
import { printTable, printJson, printSuccess, colorState } from "../output.js";
import { CliError, EXIT, runCommand } from "../errors.js";
import { collectPages, parseLimit, pageSizeFor } from "../paginate.js";

const REPORTS_VERSION = "2021-06-30";

/** getReports accepts pageSize of 1-100. */
const REPORTS_PAGE_MAX = 100;

/** How often to poll a report's status with --wait, and when to give up. */
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 30 * 60_000;

interface Report {
  reportId?: string;
  reportType?: string;
  processingStatus?: string;
  createdTime?: string;
  processingStartTime?: string;
  processingEndTime?: string;
  dataStartTime?: string;
  dataEndTime?: string;
  marketplaceIds?: string[];
  reportScheduleId?: string;
  reportDocumentId?: string;
}

interface GetReportsResult {
  reports?: Report[];
  nextToken?: string;
}

interface ReportDocument {
  reportDocumentId: string;
  url: string;
  compressionAlgorithm?: string;
}

export interface ReportsDeps {
  /** Injected so tests can skip real waiting. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const TERMINAL_FAILURE = new Set(["CANCELLED", "FATAL"]);

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

/** Commander argParser for repeatable `--option key=value`. */
export function collectOption(
  value: string,
  previous: Record<string, string> = {}
): Record<string, string> {
  const eq = value.indexOf("=");
  if (eq <= 0) {
    throw new InvalidArgumentError("--option must be in the form key=value.");
  }
  return { ...previous, [value.slice(0, eq).trim()]: value.slice(eq + 1) };
}

function printField(label: string, value: string | undefined): void {
  if (value === undefined || value === "") return;
  console.log(`  ${(label + ":").padEnd(16)}${value}`);
}

function formatReportDetail(report: Report): void {
  console.log("");
  printField("Report ID", report.reportId);
  printField("Type", report.reportType);
  printField("Status", report.processingStatus ? colorState(report.processingStatus) : undefined);
  printField("Created", report.createdTime);
  printField(
    "Processing",
    [report.processingStartTime, report.processingEndTime].filter(Boolean).join(" to ")
  );
  printField("Data range", [report.dataStartTime, report.dataEndTime].filter(Boolean).join(" to "));
  printField("Marketplaces", report.marketplaceIds?.join(", "));
  printField("Schedule ID", report.reportScheduleId);
  printField("Document ID", report.reportDocumentId);
  console.log("");
}

export function registerReportsCommands(
  program: Command,
  client: SellingPartner,
  resolveMarketplaceId: (opts: { marketplace?: string }) => string,
  deps: ReportsDeps = {}
): void {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;

  async function getReport(reportId: string): Promise<Report> {
    return (await client.callAPI({
      operation: "getReport",
      endpoint: "reports",
      options: { version: REPORTS_VERSION },
      path: { reportId },
    })) as unknown as Report;
  }

  /**
   * Poll until the report reaches DONE; fail on CANCELLED/FATAL or timeout.
   * Pass `initial` when the caller has already fetched the report so we sleep
   * before asking again instead of re-requesting immediately.
   */
  async function waitForReport(reportId: string, initial?: Report): Promise<Report> {
    const started = now();
    let report = initial ?? (await getReport(reportId));
    for (;;) {
      const status = report.processingStatus ?? "UNKNOWN";
      if (status === "DONE") return report;
      if (TERMINAL_FAILURE.has(status)) {
        throw new CliError(`Report ${reportId} ended with status ${status}.`, EXIT.FAILURE);
      }
      if (now() - started > POLL_TIMEOUT_MS) {
        throw new CliError(
          `Timed out waiting for report ${reportId} (last status ${status}). Try 'reports download --report ${reportId}' later.`,
          EXIT.FAILURE
        );
      }
      console.error(
        `Report ${reportId} is ${status}; checking again in ${POLL_INTERVAL_MS / 1000}s...`
      );
      await sleep(POLL_INTERVAL_MS);
      report = await getReport(reportId);
    }
  }

  /** Fetch the finished report's document and either save it or print it. */
  async function downloadReport(report: Report, out: string | undefined): Promise<void> {
    if (!report.reportDocumentId) {
      throw new CliError(`Report ${report.reportId} has no document to download.`, EXIT.FAILURE);
    }
    const document = (await client.callAPI({
      operation: "getReportDocument",
      endpoint: "reports",
      options: { version: REPORTS_VERSION },
      path: { reportDocumentId: report.reportDocumentId },
    })) as unknown as ReportDocument;

    // The library handles decompression and charset decoding. With `file`
    // set it also writes to disk; the content is returned either way.
    const content = (await client.download(document, {
      json: false,
      ...(out ? { file: out } : {}),
    })) as unknown;

    if (out) {
      printSuccess(`Saved report ${report.reportId} to ${out}`);
    } else {
      process.stdout.write(typeof content === "string" ? content : String(content));
    }
  }

  const reports = program.command("reports").description("Request and download reports");

  reports
    .command("list")
    .description("List requested reports")
    .option("--type <types>", "Comma-separated report types to include")
    .option("--status <statuses>", "Comma-separated processing statuses (DONE, IN_PROGRESS, ...)")
    .option("--limit <n>", "Maximum number of reports to return", parseLimit)
    .option("--all", "Fetch every page of results")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON instead of table")
    .action(
      async (opts: {
        type?: string;
        status?: string;
        limit?: number;
        all?: boolean;
        marketplace?: string;
        json?: boolean;
      }) => {
        await runCommand("list reports", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

          const list = await collectPages<Report>(async (nextToken) => {
            const result = (await client.callAPI({
              operation: "getReports",
              endpoint: "reports",
              options: { version: REPORTS_VERSION },
              query: {
                reportTypes: splitList(opts.type),
                processingStatuses: splitList(opts.status),
                marketplaceIds: [marketplaceId],
                pageSize: pageSizeFor(opts.limit, REPORTS_PAGE_MAX),
                nextToken,
              },
            })) as unknown as GetReportsResult | Report[];
            // The library's typings describe a bare array; the API returns
            // { reports, nextToken }. Accept both.
            return Array.isArray(result)
              ? { items: result }
              : { items: result.reports, nextToken: result.nextToken };
          }, opts);

          if (opts.json) {
            printJson(list);
            return;
          }

          if (list.length === 0) {
            console.log("No reports found.");
            return;
          }

          const rows = list.map((report) => [
            report.reportId ?? "",
            report.reportType ?? "",
            colorState(report.processingStatus ?? ""),
            report.createdTime ?? "",
            report.reportDocumentId ?? "",
          ]);

          printTable(["Report ID", "Type", "Status", "Created", "Document ID"], rows);
        });
      }
    );

  reports
    .command("create")
    .description("Request a new report")
    .requiredOption("--type <type>", "Report type, e.g. GET_MERCHANT_LISTINGS_ALL_DATA")
    .option("--start <date>", "ISO date for dataStartTime")
    .option("--end <date>", "ISO date for dataEndTime")
    .option("--option <key=value>", "Report option (repeatable)", collectOption)
    .option("--wait", "Poll until the report is ready, then download it")
    .option("--out <file>", "With --wait: save the report to this file instead of stdout")
    .option("--marketplace <id>", "Marketplace ID override")
    .option("--json", "Output raw JSON")
    .action(
      async (opts: {
        type: string;
        start?: string;
        end?: string;
        option?: Record<string, string>;
        wait?: boolean;
        out?: string;
        marketplace?: string;
        json?: boolean;
      }) => {
        await runCommand("create report", async () => {
          const marketplaceId = resolveMarketplaceId({ marketplace: opts.marketplace });

          const result = (await client.callAPI({
            operation: "createReport",
            endpoint: "reports",
            options: { version: REPORTS_VERSION },
            body: {
              // The library enumerates known report types as a literal union;
              // accept any string so new report types work without an upgrade.
              reportType: opts.type.trim().toUpperCase() as never,
              marketplaceIds: [marketplaceId],
              ...(opts.start ? { dataStartTime: opts.start } : {}),
              ...(opts.end ? { dataEndTime: opts.end } : {}),
              ...(opts.option ? { reportOptions: opts.option } : {}),
            },
          })) as unknown as { reportId?: string };

          if (!result?.reportId) {
            throw new CliError("Amazon did not return a report ID.", EXIT.FAILURE);
          }

          if (opts.wait) {
            const report = await waitForReport(result.reportId);
            await downloadReport(report, opts.out);
            return;
          }

          if (opts.json) {
            printJson(result);
            return;
          }

          console.log(`  ${"Report ID:".padEnd(16)}${result.reportId}`);
          console.log(
            `  Check progress with 'reports get --report ${result.reportId}' or download with 'reports download --report ${result.reportId} --wait'.`
          );
        });
      }
    );

  reports
    .command("get")
    .description("Show a report's status and details")
    .requiredOption("--report <id>", "The report ID")
    .option("--json", "Output raw JSON")
    .action(async (opts: { report: string; json?: boolean }) => {
      await runCommand("get report", async () => {
        const report = await getReport(opts.report);
        if (opts.json) {
          printJson(report);
          return;
        }
        formatReportDetail(report);
      });
    });

  reports
    .command("cancel")
    .description("Cancel a report that has not finished processing")
    .requiredOption("--report <id>", "The report ID")
    .action(async (opts: { report: string }) => {
      await runCommand("cancel report", async () => {
        await client.callAPI({
          operation: "cancelReport",
          endpoint: "reports",
          options: { version: REPORTS_VERSION },
          path: { reportId: opts.report },
        });
        printSuccess(`Cancelled report ${opts.report}.`);
      });
    });

  reports
    .command("download")
    .description("Download a finished report's document")
    .requiredOption("--report <id>", "The report ID")
    .option("--out <file>", "Save to this file instead of printing to stdout")
    .option("--wait", "If the report is still processing, poll until it is ready")
    .action(async (opts: { report: string; out?: string; wait?: boolean }) => {
      await runCommand("download report", async () => {
        let report = await getReport(opts.report);
        if (report.processingStatus !== "DONE") {
          if (!opts.wait) {
            throw new CliError(
              `Report ${opts.report} is ${report.processingStatus ?? "not finished"}. Pass --wait to poll until it is ready.`,
              EXIT.FAILURE
            );
          }
          report = await waitForReport(opts.report, report);
        }
        await downloadReport(report, opts.out);
      });
    });
}
