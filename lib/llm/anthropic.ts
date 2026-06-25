import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LLMProvider, Msg } from "./index";
import { validateWithRetry } from "./validate";

// One client at module load: single key read, no re-instantiation. Fails loud on
// first request if the key is missing.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOL_NAME = "emit";
const MAX_TRIES = 3;
const DEFAULT_MAX_TOKENS = 8192;

export const anthropic: LLMProvider = {
  name: "anthropic",
  supportsStructuredOutput: true,

  async complete<T>(args: {
    system?: string;
    messages: Msg[];
    schema: z.ZodType<T>;
    model: string;
    maxTokens?: number;
  }): Promise<T> {
    // One attempt: call, force the tool, return raw tool input. validateWithRetry
    // owns the loop; this closure owns the provider call.
    const callOnce = async (correction?: string): Promise<unknown> => {
      // On retry, validateWithRetry passes the zod error as `correction`; append
      // it as a user turn so the model fixes what failed, not blindly repeats.
      const messages = [...args.messages];
      if (correction) {
        messages.push({ role: "user", content: correction });
      }

      const res = await client.messages.create({
        model: args.model,
        system: args.system,
        max_tokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages,
        tools: [
          {
            name: TOOL_NAME,
            description: "emit JSON",
            // z.toJSONSchema's output type is wider (type: string|object|...)
            // than Anthropic's InputSchema (demands type: "object"). Our schemas
            // are always object-rooted, so the cast is safe - bridges a library
            // type-impedance TS can't see.
            input_schema: z.toJSONSchema(
              args.schema,
            ) as Anthropic.Tool.InputSchema,
          },
        ],
        // Force the tool call (vs prose): response is structured tool input, not
        // fenced JSON to parse.
        tool_choice: { type: "tool", name: TOOL_NAME },
      });

      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (!toolUse) {
        throw new Error("No tool_use in response");
      }
      return toolUse.input;
    };

    return validateWithRetry(callOnce, args.schema, MAX_TRIES);
  },
};
