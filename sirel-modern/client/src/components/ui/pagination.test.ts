import { describe, expect, it } from "vitest";

import { buildPaginationItems } from "@/components/ui/pagination";

describe("buildPaginationItems", () => {
  it("returns all pages when total is small", () => {
    expect(buildPaginationItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("adds ellipsis around distant pages", () => {
    expect(buildPaginationItems(10, 20)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 20]);
  });
});
