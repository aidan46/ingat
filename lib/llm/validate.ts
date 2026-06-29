import "server-only";
import { type ZodType } from "zod";

// Call, validate against schema, re-prompt with the zod error on failure, up to
// maxTries, then throw. Provider-agnostic: callOnce is the only provider-specific
// bit (each adapter supplies its own).
export async function validateWithRetry<T>(
  callOnce: (correction?: string) => Promise<unknown>,
  schema: ZodType<T>,
  maxTries: number,
): Promise<T> {
  let correction: string | undefined;
  for (let i = 0; i < maxTries; i++) {
    const result = await callOnce(correction);
    const parsed = schema.safeParse(result);
    if (parsed.success) {
      return parsed.data;
    }
    correction = parsed.error.message;
  }
  throw new Error(
    `Failed to validate output after ${maxTries} tries. Last error: ${correction}`,
  );
}
