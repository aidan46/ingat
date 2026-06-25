import "server-only";
import { ZodType } from "zod";

export type Msg = {
  role: "user" | "assistant";
  content: string;
};

export interface LLMProvider {
  name: string;
  supportsStructuredOutput: boolean;
  // messages in, schema-validated JSON out (retries on invalid output)
  complete<T>(args: {
    system?: string;
    messages: Msg[];
    schema: ZodType<T>;
    model: string;
    maxTokens?: number;
  }): Promise<T>;
}

export const agentConfig = {
  extractor: { model: "claude-sonnet-4-6" },
};
