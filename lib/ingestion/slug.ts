// Stable slug from a source repo, so re-ingesting upserts the same Book row
// instead of duplicating it. Deterministic: same repo -> same slug.
export function slugify(repo: string): string {
  return repo.replaceAll("/", "-");
}
