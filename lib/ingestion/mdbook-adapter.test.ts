import { describe, it, expect } from "vitest";
import {
  MdBookAdapter,
  type Fetcher,
  type MdBookConfig,
} from "./mdbook-adapter";

// In-memory fetcher: maps repo-relative path -> content. Throws on a miss,
// mirroring rawGithubFetcher's 404 behavior. This is the seam that lets the
// parse/clean logic be tested with zero network.
function fakeFetcher(files: Record<string, string>): Fetcher {
  // not async: the lookup is synchronous, so return Promises explicitly to
  // satisfy Fetcher's Promise<string> without an await-less async function.
  return (repoRelPath) => {
    const body = files[repoRelPath];
    return body === undefined
      ? Promise.reject(new Error(`fake fetch 404: ${repoRelPath}`))
      : Promise.resolve(body);
  };
}

// The real async-book SUMMARY.md (rust-lang/async-book@master). Used as the
// parser fixture on purpose: a toy fixture would test the logic, not the
// real-world outcome the "Done when" criterion depends on.
const ASYNC_BOOK_SUMMARY = `# Table of Contents

[Introduction](intro.md)

- [Navigation](navigation/intro.md)
  - [By topic](navigation/topics.md)
  - [FAQs]()
  - [Index](navigation/index.md)

# Part 1: guide

- [Introduction](part-guide/intro.md)
- [Concurrent programming](part-guide/concurrency.md)
- [Async and await](part-guide/async-await.md)
- [More async/await topics](part-guide/more-async-await.md)
- [IO and issues with blocking](part-guide/io.md)
- [Composing futures concurrently](part-guide/concurrency-primitives.md)
- [Channels, locking, and synchronization](part-guide/sync.md)
- [Tools for async programming](part-guide/tools.md)
- [Destruction and clean-up](part-guide/dtors.md)
- [Futures](part-guide/futures.md)
- [Runtimes](part-guide/runtimes.md)
- [Timers and signal handling](part-guide/timers-signals.md)
- [Async iterators (streams)](part-guide/streams.md)

# Part 2: reference

- [Implementing futures and streams]()
- [Alternate runtimes]()
- [Cancellation and cancellation safety](part-reference/cancellation.md) (cancellation safety)
- [Pinning](part-reference/pinning.md)
- [Structured concurrency](part-reference/structured.md)

# Old chapters

- [Getting Started](01_getting_started/01_chapter.md)
  - [Why Async?](01_getting_started/02_why_async.md)
- [\`async\`/\`await\`](03_async_await/01_chapter.md)
`;

const PART1_CONFIG: MdBookConfig = {
  repo: "rust-lang/async-book",
  branch: "master",
  srcPath: "src",
  partsAllow: ["Part 1: guide"],
};

describe("listChapters", () => {
  it("keeps exactly the 13 Part-1 chapters", async () => {
    const adapter = new MdBookAdapter(
      PART1_CONFIG,
      fakeFetcher({ "src/SUMMARY.md": ASYNC_BOOK_SUMMARY }),
    );

    const chapters = await adapter.listChapters();

    expect(chapters).toHaveLength(13);
  });

  it("tags every kept chapter with the allowed part and sequential order", async () => {
    const adapter = new MdBookAdapter(
      PART1_CONFIG,
      fakeFetcher({ "src/SUMMARY.md": ASYNC_BOOK_SUMMARY }),
    );

    const chapters = await adapter.listChapters();

    expect(chapters.every((c) => c.part === "Part 1: guide")).toBe(true);
    expect(chapters.map((c) => c.order)).toEqual([...Array(13).keys()]);
    expect(chapters[0]).toMatchObject({
      title: "Introduction",
      sourcePath: "part-guide/intro.md",
      order: 0,
    });
  });

  it("skips empty-target entries and chapters outside partsAllow", async () => {
    const adapter = new MdBookAdapter(
      PART1_CONFIG,
      fakeFetcher({ "src/SUMMARY.md": ASYNC_BOOK_SUMMARY }),
    );

    const chapters = await adapter.listChapters();

    // no empty `[Title]()` leaked in
    expect(chapters.some((c) => c.sourcePath === "")).toBe(false);
    // no Part-2 / Old-chapters / pre-part entries leaked in
    expect(
      chapters.some((c) => c.sourcePath.startsWith("part-reference/")),
    ).toBe(false);
    expect(chapters.some((c) => c.sourcePath === "intro.md")).toBe(false);
  });

  it("without partsAllow, keeps every real-target entry across all parts", async () => {
    const adapter = new MdBookAdapter(
      { ...PART1_CONFIG, partsAllow: undefined },
      fakeFetcher({ "src/SUMMARY.md": ASYNC_BOOK_SUMMARY }),
    );

    const chapters = await adapter.listChapters();

    // 13 Part-1 + Part-2 written + Old-chapters + pre-part real targets
    expect(chapters.length).toBeGreaterThan(13);
  });
});

describe("loadChapter", () => {
  // A chapter whose {{#include}} escapes srcPath via ../../ (the real async-book
  // pattern), plus a non-rust fence whose `#` lines must survive.
  const CHAPTER = `# Demo

\`\`\`rust,edition2021
{{#include ../../examples/demo/src/main.rs}}
\`\`\`

{{#playground demo.rs}}

\`\`\`bash
# this shell comment must survive
echo hi
\`\`\`
`;

  // The included Rust file: a hidden line, an escaped attribute, a visible body.
  const INCLUDED_RS = `# use std::fmt;
##[allow(dead_code)]
fn main() {
    println!("hi");
}
`;

  const files = {
    "src/part-guide/demo.md": CHAPTER,
    // ../../ from src/part-guide resolves to repo-root examples/...
    "examples/demo/src/main.rs": INCLUDED_RS,
  };

  const ref = {
    title: "Demo",
    order: 0,
    part: "Part 1: guide",
    sourcePath: "part-guide/demo.md",
  };

  it("resolves includes (including paths that escape srcPath)", async () => {
    const adapter = new MdBookAdapter(PART1_CONFIG, fakeFetcher(files));

    const body = await adapter.loadChapter(ref);

    expect(body).not.toContain("{{#include");
    expect(body).toContain("fn main()");
  });

  it("strips rust hidden lines and unescapes ## but keeps attributes", async () => {
    const adapter = new MdBookAdapter(PART1_CONFIG, fakeFetcher(files));

    const body = await adapter.loadChapter(ref);

    expect(body).not.toContain("use std::fmt"); // hidden `# ` line dropped
    expect(body).toContain("#[allow(dead_code)]"); // `##` unescaped to `#`
  });

  it("drops playground directives but leaves non-rust # lines alone", async () => {
    const adapter = new MdBookAdapter(PART1_CONFIG, fakeFetcher(files));

    const body = await adapter.loadChapter(ref);

    expect(body).not.toContain("{{#playground");
    expect(body).toContain("# this shell comment must survive");
  });

  it("leaves includes intact when resolveIncludes is false", async () => {
    const adapter = new MdBookAdapter(
      { ...PART1_CONFIG, resolveIncludes: false },
      fakeFetcher(files),
    );

    const body = await adapter.loadChapter(ref);

    expect(body).toContain("{{#include ../../examples/demo/src/main.rs}}");
  });

  it("rejects when an include points at a missing file", async () => {
    const chapter =
      "```rust\n{{#include ../../examples/gone/src/main.rs}}\n```\n";
    // note: the included file is absent from the fetcher map
    const adapter = new MdBookAdapter(
      PART1_CONFIG,
      fakeFetcher({ "src/part-guide/demo.md": chapter }),
    );

    // assert loadChapter(ref) rejects (fetcher 404s on the missing include)
    await expect(adapter.loadChapter(ref)).rejects.toThrow();
  });

  it("resolves multiple includes and de-duplicates repeats", async () => {
    const chapter = [
      "```rust",
      "{{#include ../../examples/a/src/main.rs}}",
      "```",
      "```rust",
      "{{#include ../../examples/b/src/main.rs}}",
      "```",
      "```rust",
      "{{#include ../../examples/a/src/main.rs}}", // repeat of a
      "```",
    ].join("\n");
    const adapter = new MdBookAdapter(
      PART1_CONFIG,
      fakeFetcher({
        "src/part-guide/demo.md": chapter,
        "examples/a/src/main.rs": "fn a() {}",
        "examples/b/src/main.rs": "fn b() {}",
      }),
    );

    const body = await adapter.loadChapter(ref);

    // assert both fn a() and fn b() are present
    expect(body).toContain("fn a()");
    expect(body).toContain("fn b()");
    // assert no {{#include leftover
    expect(body).not.toContain("{{#include");
    // assert the repeated include was substituted in both spots
    expect(body.split("fn a()").length - 1).toBe(2);
  });

  it("strips :anchor suffixes and handles rustdoc_include", async () => {
    const chapter = [
      "```rust",
      "{{#include ../../examples/c/src/main.rs:section}}",
      "```",
      "```rust",
      "{{#rustdoc_include ../../examples/d/src/main.rs}}",
      "```",
    ].join("\n");
    // fetcher keys are the BASE paths (no :section). If the anchor isn't
    // stripped, the fetch misses and the test rejects instead of resolving.
    const adapter = new MdBookAdapter(
      PART1_CONFIG,
      fakeFetcher({
        "src/part-guide/demo.md": chapter,
        "examples/c/src/main.rs": "fn c() {}",
        "examples/d/src/main.rs": "fn d() {}",
      }),
    );

    const body = await adapter.loadChapter(ref);

    // assert fn c() present (anchor stripped, whole file included)
    expect(body).toContain("fn c()");
    // assert fn d() present (rustdoc_include matched like include)
    expect(body).toContain("fn d()");
  });
});
