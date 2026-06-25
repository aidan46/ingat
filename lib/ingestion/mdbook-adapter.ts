import path from "node:path";
import { z } from "zod";
import type { ChapterRef, SourceAdapter } from "./source-adapter";

// Schema validates incoming/stored config; type derives from it (one source).
export const MdBookConfigSchema = z.object({
  repo: z.string(), // "rust-lang/async-book"
  branch: z.string(), // "master"
  srcPath: z.string().optional(), // default "src"
  partsAllow: z.array(z.string()).optional(), // only these part headers
  resolveIncludes: z.boolean().optional(), // default true
});
export type MdBookConfig = z.infer<typeof MdBookConfigSchema>;

// The injected seam: repo-root-relative path in, file contents out.
// Production hits the network; tests pass a fixture-backed fetcher.
export type Fetcher = (repoRelPath: string) => Promise<string>;

export function rawGithubFetcher(repo: string, branch: string): Fetcher {
  return async (repoRelPath) => {
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${repoRelPath}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`${url} | fetch failed: ${res.status} ${res.statusText}`);
    }

    return res.text();
  };
}

export class MdBookAdapter implements SourceAdapter {
  constructor(
    private readonly config: MdBookConfig,
    private readonly fetcher: Fetcher,
  ) {}

  async listChapters(): Promise<ChapterRef[]> {
    const srcPath = this.config.srcPath ?? "src";
    const summary = await this.fetcher(`${srcPath}/SUMMARY.md`);
    // split on newlines, \r? tolerates CRLF line endings
    const lines = summary.split(/\r?\n/);
    let currentPart: string | undefined;
    const result: ChapterRef[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        // "# Part 1: guide" -> "Part 1: guide"
        currentPart = trimmed.replace(/^#+\s*/, "").trim();
        continue;
      }

      // [Title](target): group1 = title (up to ]), group2 = target (up to )).
      // Matches first link on the line, ignores bullet + trailing text.
      const match = trimmed.match(/\[([^\]]*)\]\(([^)]*)\)/);
      if (!match) continue;

      const title = match[1] ?? "";
      const target = match[2] ?? "";

      if (!target) continue;

      const { partsAllow } = this.config;
      if (partsAllow && (!currentPart || !partsAllow.includes(currentPart)))
        continue;

      result.push({
        title,
        order: result.length, // position among kept entries
        part: currentPart,
        sourcePath: target,
      });
    }
    return result;
  }

  async loadChapter(ref: ChapterRef): Promise<string> {
    const srcPath = this.config.srcPath ?? "src";
    const raw = await this.fetcher(`${srcPath}/${ref.sourcePath}`);
    const withIncludes = await this.resolveIncludes(
      raw,
      `${srcPath}/${ref.sourcePath}`,
    );
    return this.clean(withIncludes);
  }

  private async resolveIncludes(
    text: string,
    chapterRepoPath: string,
  ): Promise<string> {
    if (this.config.resolveIncludes === false) return text;
    const chapterDir = path.posix.dirname(chapterRepoPath);
    // {{#include path}} / {{#rustdoc_include path}}; group 1 = path arg (may carry :anchor)
    const includeRe = /\{\{#(?:include|rustdoc_include)\s+([^}]+)\}\}/g;
    const matches = [...text.matchAll(includeRe)];
    if (matches.length === 0) return text;

    const MAX_INCLUDE_CHARS = 4096;

    // map each unique directive to its path arg, then fetch once per directive
    const argByDirective = new Map<string, string>();
    for (const m of matches) {
      if (!argByDirective.has(m[0]))
        argByDirective.set(m[0], (m[1] ?? "").trim());
    }

    const contentByDirective = new Map<string, string>();
    await Promise.all(
      [...argByDirective.entries()].map(async ([directive, arg]) => {
        // whole-file include only. strip :anchor/:line, ignore it.
        // upgrade path is ANCHOR/ANCHOR_END slicing if a chapter needs it.
        const rel = arg.split(":")[0] ?? arg;
        const target = path.posix.normalize(path.posix.join(chapterDir, rel));
        const body = await this.fetcher(target);
        contentByDirective.set(directive, body.slice(0, MAX_INCLUDE_CHARS));
      }),
    );

    // substitute in place. function replacer keeps content literal (no $-pattern interpretation)
    let out = text;
    for (const [directive, body] of contentByDirective) {
      out = out.replaceAll(directive, () => body);
    }

    return out;
  }

  private clean(text: string): string {
    const lines = text.split(/\r?\n/);
    const out: string[] = [];
    let inRustFence = false;
    const playgroundRe = /\{\{#playground\s+[^}]*\}\}/g;

    for (const line of lines) {
      // fence open/close: ```lang ... ```
      const fence = line.match(/^\s*```(.*)$/);
      if (fence) {
        // hidden-line rules apply to rust blocks only; non-rust fences pass through
        inRustFence = inRustFence
          ? false
          : (fence[1] ?? "").trim().toLowerCase().startsWith("rust");
        out.push(line);
        continue;
      }

      if (inRustFence) {
        const code = line.trimStart();
        // rustdoc-hidden boilerplate: "#" alone or "# ..." (attributes "#[..]" are kept)
        if (code === "#" || code.startsWith("# ")) continue;
        // "##" escapes a literal "#": unescape the leading pair
        if (code.startsWith("##")) {
          out.push(line.replace("##", "#"));
          continue;
        }
        out.push(line);
        continue;
      }
      // outside code: drop playground directives
      out.push(line.replace(playgroundRe, ""));
    }

    return out.join("\n");
  }
}
