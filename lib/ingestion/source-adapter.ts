export interface ChapterRef {
  title: string;
  order: number;
  part?: string;
  sourcePath: string; // adapter-internal locator
}

export interface SourceAdapter {
  /** Ordered chapter manifest, no bodies. */
  listChapters(): Promise<ChapterRef[]>;
  /** Cleaned markdown/plaintext body for one chapter. Transient, not persisted. */
  loadChapter(ref: ChapterRef): Promise<string>;
}
