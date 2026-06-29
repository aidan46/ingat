import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadChapterBody } from "@/lib/ingestion/load-chapter-body";
import Markdown from "react-markdown";

// Reader (server component): load chapter body transiently, render it. Touches
// Book + Chapter only, NEVER Concept - rubric stays sealed until recall submit.
// Body never written to the DB.
export default async function ChapterReader({
  params,
}: {
  // Next 16: params is async, must await.
  params: Promise<{ slug: string; chapterId: string }>;
}) {
  const { slug, chapterId } = await params;

  // No concepts in the select: sealed-loop leak surface.
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { book: true },
  });
  if (
    !chapter ||
    chapter.book.slug !== slug ||
    chapter.book.sourceType !== "MDBOOK"
  ) {
    return notFound();
  }

  // Transient body via the source-dispatched helper; never persisted.
  const chapterMarkdown = await loadChapterBody(chapter);

  return (
    <article className="prose prose-neutral mx-auto p-8">
      <Markdown>{chapterMarkdown}</Markdown>
    </article>
  );
}
