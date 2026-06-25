import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// validate.ts imports "server-only", which throws outside a server bundle.
// vitest runs in plain Node, so stub it to a no-op.
vi.mock("server-only", () => ({}));

import { validateWithRetry } from "./validate";

// A small schema to validate against. Valid shape: { ok: true }.
const schema = z.object({ ok: z.boolean() });

// Recording fake for callOnce: returns outputs[i] on the i-th call, records each
// correction arg. Lets a test assert call count + whether attempt N got one.
function makeCallOnce(outputs: unknown[]) {
  const corrections: (string | undefined)[] = [];
  const fn = (correction?: string): Promise<unknown> => {
    corrections.push(correction);
    return Promise.resolve(outputs[corrections.length - 1]);
  };
  return { fn, corrections };
}

describe("validateWithRetry", () => {
  it("returns parsed data on the first valid output, calling callOnce once", async () => {
    const outputs = [{ ok: true }];
    const fake = makeCallOnce(outputs);
    await expect(validateWithRetry(fake.fn, schema, 1)).resolves.toEqual({
      ok: true,
    });
    expect(fake.corrections.length).toBe(1);
    expect(fake.corrections[0]).toEqual(undefined);
  });

  it("retries with a correction after a bad output, then returns the good one", async () => {
    const outputs = [{ ok: "fake" }, { ok: true }];
    const fake = makeCallOnce(outputs);
    await expect(validateWithRetry(fake.fn, schema, 2)).resolves.toEqual({
      ok: true,
    });
    expect(fake.corrections.length).toBe(2);
    expect(fake.corrections[1]).toBeTypeOf("string");
  });

  it("throws after maxTries when output is never valid", async () => {
    const outputs = [{ ok: "fake" }, { ok: "fake" }];
    const fake = makeCallOnce(outputs);
    await expect(validateWithRetry(fake.fn, schema, 2)).rejects.toThrow();
    expect(fake.corrections.length).toBe(2);
  });
});
