import { describe, it, expect, vi } from "vitest";
import { collectPages } from "../paginate.js";

function pagedSource(pages: { items: string[]; nextToken?: string }[]) {
  const fetchPage = vi.fn(async (token?: string) => {
    const index = token ? Number(token) : 0;
    return pages[index];
  });
  return fetchPage;
}

describe("collectPages", () => {
  const threePages = [
    { items: ["a", "b"], nextToken: "1" },
    { items: ["c", "d"], nextToken: "2" },
    { items: ["e"] },
  ];

  it("returns only the first page by default", async () => {
    const fetchPage = pagedSource(threePages);
    const items = await collectPages(fetchPage, {});
    expect(items).toEqual(["a", "b"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
  });

  it("follows next tokens until exhausted with all", async () => {
    const fetchPage = pagedSource(threePages);
    const items = await collectPages(fetchPage, { all: true });
    expect(items).toEqual(["a", "b", "c", "d", "e"]);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "1");
    expect(fetchPage).toHaveBeenNthCalledWith(3, "2");
  });

  it("stops fetching and truncates once limit is reached", async () => {
    const fetchPage = pagedSource(threePages);
    const items = await collectPages(fetchPage, { limit: 3 });
    expect(items).toEqual(["a", "b", "c"]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("returns fewer than limit when the source runs out", async () => {
    const fetchPage = pagedSource(threePages);
    const items = await collectPages(fetchPage, { limit: 50 });
    expect(items).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("tolerates a page with no items array", async () => {
    const items = await collectPages(async () => ({ items: undefined as unknown as string[] }), {
      all: true,
    });
    expect(items).toEqual([]);
  });
});
