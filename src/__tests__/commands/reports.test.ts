import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerReportsCommands } from "../../commands/reports.js";
import { EXIT } from "../../errors.js";

describe("reports commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const mockCallAPI = vi.fn();
  const mockDownload = vi.fn();
  const mockClient = { callAPI: mockCallAPI, download: mockDownload } as any;
  const sleep = vi.fn(async () => {});
  const resolveMarketplaceId = (_opts: { marketplace?: string }) => "ATVPDKIKX0DER";

  const doneReport = {
    reportId: "R1",
    reportType: "GET_MERCHANT_LISTINGS_ALL_DATA",
    processingStatus: "DONE",
    createdTime: "2026-01-01T00:00:00Z",
    reportDocumentId: "DOC1",
  };

  function program(quiet = false) {
    const p = new Command();
    p.exitOverride();
    // Output settings are copied to subcommands at registration time, so
    // silence commander's own error echo before registering.
    if (quiet) p.configureOutput({ writeErr: () => {} });
    registerReportsCommands(p, mockClient, resolveMarketplaceId, { sleep });
    return p;
  }

  function output() {
    return consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
  }

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    mockCallAPI.mockReset();
    mockDownload.mockReset();
    sleep.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── reports list ──────────────────────────────────────────────────────────

  it("reports list filters by type and status and renders a table", async () => {
    mockCallAPI.mockResolvedValueOnce({ reports: [doneReport] });

    await program().parseAsync([
      "node",
      "test",
      "reports",
      "list",
      "--type",
      "GET_MERCHANT_LISTINGS_ALL_DATA, GET_FLAT_FILE_OPEN_LISTINGS_DATA",
      "--status",
      "done",
    ]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getReports",
        endpoint: "reports",
        options: { version: "2021-06-30" },
        query: expect.objectContaining({
          reportTypes: ["GET_MERCHANT_LISTINGS_ALL_DATA", "GET_FLAT_FILE_OPEN_LISTINGS_DATA"],
          processingStatuses: ["DONE"],
          marketplaceIds: ["ATVPDKIKX0DER"],
        }),
      })
    );
    const out = output();
    expect(out).toContain("R1");
    expect(out).toContain("GET_MERCHANT_LISTINGS_ALL_DATA");
    expect(out).toContain("DONE");
  });

  it("reports list accepts a bare array response and pages with --all", async () => {
    mockCallAPI
      .mockResolvedValueOnce({ reports: [{ reportId: "A" }], nextToken: "n1" })
      .mockResolvedValueOnce([{ reportId: "B" }]);

    await program().parseAsync(["node", "test", "reports", "list", "--all", "--json"]);

    expect(mockCallAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ nextToken: "n1" }) })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      JSON.stringify([{ reportId: "A" }, { reportId: "B" }], null, 2)
    );
  });

  it("reports list --limit sets pageSize capped at 100", async () => {
    mockCallAPI.mockResolvedValueOnce({ reports: [] });

    await program().parseAsync(["node", "test", "reports", "list", "--limit", "500"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ pageSize: 100 }) })
    );
    expect(output()).toContain("No reports found.");
  });

  // ── reports create ────────────────────────────────────────────────────────

  it("reports create requests the report and prints its ID", async () => {
    mockCallAPI.mockResolvedValueOnce({ reportId: "R9" });

    await program().parseAsync([
      "node",
      "test",
      "reports",
      "create",
      "--type",
      "GET_MERCHANT_LISTINGS_ALL_DATA",
      "--start",
      "2026-01-01T00:00:00Z",
      "--end",
      "2026-02-01T00:00:00Z",
      "--option",
      "custom=true",
      "--option",
      "dateGranularity=DAY",
    ]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "createReport",
        endpoint: "reports",
        options: { version: "2021-06-30" },
        body: {
          reportType: "GET_MERCHANT_LISTINGS_ALL_DATA",
          marketplaceIds: ["ATVPDKIKX0DER"],
          dataStartTime: "2026-01-01T00:00:00Z",
          dataEndTime: "2026-02-01T00:00:00Z",
          reportOptions: { custom: "true", dateGranularity: "DAY" },
        },
      })
    );
    expect(output()).toMatch(/Report ID:\s+R9/);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("reports create rejects a malformed --option", async () => {
    const p = program(true);
    await expect(
      p.parseAsync(["node", "test", "reports", "create", "--type", "X", "--option", "novalue"])
    ).rejects.toThrow(/key=value/);
    expect(mockCallAPI).not.toHaveBeenCalled();
  });

  it("reports create --wait polls until DONE and prints the document", async () => {
    mockCallAPI
      .mockResolvedValueOnce({ reportId: "R9" })
      .mockResolvedValueOnce({ ...doneReport, reportId: "R9", processingStatus: "IN_QUEUE" })
      .mockResolvedValueOnce({ ...doneReport, reportId: "R9", processingStatus: "IN_PROGRESS" })
      .mockResolvedValueOnce({ ...doneReport, reportId: "R9" })
      .mockResolvedValueOnce({
        reportDocumentId: "DOC1",
        url: "https://x",
        compressionAlgorithm: "GZIP",
      });
    mockDownload.mockResolvedValueOnce("sku\tprice\nA\t1.00\n");

    await program().parseAsync([
      "node",
      "test",
      "reports",
      "create",
      "--type",
      "GET_MERCHANT_LISTINGS_ALL_DATA",
      "--wait",
    ]);

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "getReport", path: { reportId: "R9" } })
    );
    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getReportDocument",
        path: { reportDocumentId: "DOC1" },
      })
    );
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://x" }),
      expect.objectContaining({ json: false })
    );
    expect(stdoutSpy).toHaveBeenCalledWith("sku\tprice\nA\t1.00\n");
  });

  it("reports create --wait fails when the report is cancelled", async () => {
    mockCallAPI
      .mockResolvedValueOnce({ reportId: "R9" })
      .mockResolvedValueOnce({ ...doneReport, reportId: "R9", processingStatus: "CANCELLED" });

    await program().parseAsync([
      "node",
      "test",
      "reports",
      "create",
      "--type",
      "GET_MERCHANT_LISTINGS_ALL_DATA",
      "--wait",
    ]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("CANCELLED"));
    expect(processExitSpy).toHaveBeenCalledWith(EXIT.FAILURE);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  // ── reports get / cancel ──────────────────────────────────────────────────

  it("reports get prints a labeled summary", async () => {
    mockCallAPI.mockResolvedValueOnce(doneReport);

    await program().parseAsync(["node", "test", "reports", "get", "--report", "R1"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "getReport", path: { reportId: "R1" } })
    );
    const out = output();
    expect(out).toMatch(/Report ID:\s+R1/);
    expect(out).toMatch(/Status:\s+DONE/);
    expect(out).toMatch(/Document ID:\s+DOC1/);
  });

  it("reports cancel calls cancelReport", async () => {
    mockCallAPI.mockResolvedValueOnce({});

    await program().parseAsync(["node", "test", "reports", "cancel", "--report", "R1"]);

    expect(mockCallAPI).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "cancelReport", path: { reportId: "R1" } })
    );
    expect(output()).toContain("R1");
  });

  // ── reports download ──────────────────────────────────────────────────────

  it("reports download saves to --out when given", async () => {
    mockCallAPI.mockResolvedValueOnce(doneReport).mockResolvedValueOnce({
      reportDocumentId: "DOC1",
      url: "https://x",
      compressionAlgorithm: "GZIP",
    });
    mockDownload.mockResolvedValueOnce("content");

    await program().parseAsync([
      "node",
      "test",
      "reports",
      "download",
      "--report",
      "R1",
      "--out",
      "/tmp/report.tsv",
    ]);

    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://x" }),
      expect.objectContaining({ file: "/tmp/report.tsv" })
    );
    expect(output()).toContain("/tmp/report.tsv");
    expect(stdoutSpy).not.toHaveBeenCalledWith("content");
  });

  it("reports download refuses an unfinished report unless --wait is given", async () => {
    mockCallAPI.mockResolvedValueOnce({ ...doneReport, processingStatus: "IN_PROGRESS" });

    await program().parseAsync(["node", "test", "reports", "download", "--report", "R1"]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("--wait"));
    expect(processExitSpy).toHaveBeenCalledWith(EXIT.FAILURE);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("reports download --wait polls then downloads", async () => {
    mockCallAPI
      .mockResolvedValueOnce({ ...doneReport, processingStatus: "IN_PROGRESS" })
      .mockResolvedValueOnce(doneReport)
      .mockResolvedValueOnce({
        reportDocumentId: "DOC1",
        url: "https://x",
        compressionAlgorithm: "GZIP",
      });
    mockDownload.mockResolvedValueOnce("content");

    await program().parseAsync(["node", "test", "reports", "download", "--report", "R1", "--wait"]);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).toHaveBeenCalledWith("content");
  });
});
