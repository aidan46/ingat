import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
  it("replaces the owner/repo slash with a dash", () => {
    expect(slugify("rust-lang/async-book")).toBe("rust-lang-async-book");
  });

  it("replaces every slash, not just the first", () => {
    // guards the immutability/replaceAll bug: replace() would miss later slashes
    expect(slugify("a/b/c")).toBe("a-b-c");
  });
});
