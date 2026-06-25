import { prisma } from "@/lib/db";
import {
  MdBookAdapter,
  MdBookConfigSchema,
  rawGithubFetcher,
} from "@/lib/ingestion/mdbook-adapter";
import { slugify } from "@/lib/ingestion/slug";

// POST /api/ingest - body: MdBookConfig
// Creates 1 Book + N Chapter rows (NO bodies). Idempotent on re-run.
// Validate the request body at the trust boundary. The inferred type of a
// parsed config flows into MdBookAdapter, so if this schema ever drifts from
// MdBookConfig, the `new MdBookAdapter(config, ...)` call stops compiling.
export async function POST(req: Request) {
  const config = MdBookConfigSchema.parse(await req.json());

  // Manifest only, never call loadChapter here; ingest stores no bodies (principle 4).
  const adapter = new MdBookAdapter(
    config,
    rawGithubFetcher(config.repo, config.branch),
  );
  const chapters = await adapter.listChapters();

  const slug = slugify(config.repo);
  // all-or-nothing: a partial ingest leaves no half-book
  const book = await prisma.$transaction(async (tx) => {
    const book = await tx.book.upsert({
      where: {
        slug,
      },
      create: {
        slug,
        title: config.repo,
        sourceType: "MDBOOK",
        sourceConfig: config,
      },
      // update never touches status: don't reset a chapter M3 already EXTRACTED
      update: {
        title: config.repo,
        sourceConfig: config,
      },
    });

    for (const ch of chapters) {
      await tx.chapter.upsert({
        where: {
          bookId_sourcePath: {
            bookId: book.id,
            sourcePath: ch.sourcePath,
          },
        },
        create: {
          bookId: book.id,
          title: ch.title,
          order: ch.order,
          part: ch.part,
          sourcePath: ch.sourcePath,
        },
        update: {
          title: ch.title,
          order: ch.order,
          part: ch.part,
        },
      });
    }
    return book;
  });

  return Response.json({ bookId: book.id, chapterCount: chapters.length });
}
