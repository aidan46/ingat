# Ingestion

## The adapter abstraction

Ingestion is pluggable so EPUB/PDF/paste can come later without touching the rest of the system. v1 ships **one** adapter: mdBook.

```ts
// lib/ingestion/source-adapter.ts
export interface ChapterRef {
  title: string;
  order: number;
  part?: string;
  sourcePath: string;   // adapter-internal locator
}

export interface SourceAdapter {
  /** Ordered chapter manifest, no bodies. */
  listChapters(): Promise<ChapterRef[]>;
  /** Cleaned markdown/plaintext body for one chapter. Transient — not persisted. */
  loadChapter(ref: ChapterRef): Promise<string>;
}
```

Ingestion flow: `listChapters()` → upsert `Chapter` rows (no body) → for each, `loadChapter()` → feed to the **Extractor** → store concepts+probes → discard the body.

## mdBook adapter

```ts
// lib/ingestion/mdbook-adapter.ts
interface MdBookConfig {
  repo: string;          // "rust-lang/async-book"
  branch: string;        // "master"
  srcPath?: string;      // "src"
  partsAllow?: string[]; // e.g. ["Part 1: guide"] — only these top-level part headers
  resolveIncludes?: boolean; // default true
}
```

Base raw URL: `https://raw.githubusercontent.com/{repo}/{branch}/{srcPath}/{path}`.
(For a local clone, swap the fetch for a filesystem read at `{localRoot}/{srcPath}/{path}` — keep the rest identical.)

### `listChapters()` — parse SUMMARY.md

1. Fetch `{srcPath}/SUMMARY.md`.
2. Walk the markdown list. Each item is `[Title](path.md)` possibly nested (indent = hierarchy).
3. **Skip entries with empty targets** `[Title]()` — these are unwritten placeholders.
4. Track the current `# Part X` header as `part`. If `partsAllow` is set, **skip chapters whose part isn't in it.**
5. Assign `order` by document position among kept entries.

### `loadChapter(ref)` — fetch + clean

1. Fetch `{srcPath}/{ref.sourcePath}`.
2. **Resolve `{{#include path}}`** (and `{{#include path:anchor}}`) by fetching the referenced file (relative to the chapter's dir) and inlining it as a fenced code block. Cap each include (e.g. 4 KB) to avoid pathological files.
3. **Strip mdBook hidden code lines**: in fenced Rust blocks, drop lines beginning with `# ` (and unescape `##` → `#`). These are rustdoc-hidden boilerplate.
4. Strip other mdBook directives you don't want (`{{#playground}}`, `{{#rustdoc_include}}` → treat like include).
5. Return the cleaned markdown.

## async-book — exact v1 config

```ts
const asyncBook: MdBookConfig = {
  repo: "rust-lang/async-book",
  branch: "master",
  srcPath: "src",
  partsAllow: ["Part 1: guide"],   // skip the empty "Part 2: reference" and the deprecated "Old chapters"
  resolveIncludes: true,
};
```

This yields the 13 Part-1 chapters (Introduction, Concurrent programming, Async and await, More async/await topics, IO and blocking, Composing futures concurrently, Channels/locking/sync, Tools, Destruction and clean-up, Futures, Runtimes, Timers and signals, Async iterators/streams). Chapters run ~2–4k words — a good size for one Extractor call.

> Optional: the three *written* Part-2 reference chapters (`cancellation`, `pinning`, `structured`) have real files and could be added later as a second pass; they're advanced, so leave them out of v1.

## Why not EPUB/PDF first

Your near-term reading list (Rust Book, Rustonomicon, Rust by Example, the Embedded book) is largely mdBooks, so this one adapter covers a lot. EPUB is the right *second* adapter (structured XHTML spine); PDF is last resort (column/figure/code extraction is genuinely painful). The `SourceAdapter` interface is the seam that lets you add them without disturbing extraction, scheduling, or UI.
