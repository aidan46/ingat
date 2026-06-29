import { type SourceType } from "@/app/generated/prisma/enums";

import {
  MdBookAdapter,
  MdBookConfigSchema,
  rawGithubFetcher,
} from "./mdbook-adapter";
import { type ChapterRef } from "./source-adapter";

type ChapterWithBook = {
  title: string;
  order: number;
  part: string | null;
  sourcePath: string;
  book: { sourceType: SourceType; sourceConfig: unknown };
};

export function loadChapterBody(chapter: ChapterWithBook): Promise<string> {
  if (chapter.book.sourceType !== "MDBOOK") {
    throw new Error("Only MDBOOK source type supported");
  }
  const config = MdBookConfigSchema.parse(chapter.book.sourceConfig);
  const adapter = new MdBookAdapter(
    config,
    rawGithubFetcher(config.repo, config.branch),
  );
  const chapterRef: ChapterRef = {
    title: chapter.title,
    order: chapter.order,
    part: chapter.part ?? undefined,
    sourcePath: chapter.sourcePath,
  };
  return adapter.loadChapter(chapterRef);
}
