import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { bedrock } from "@ai-sdk/amazon-bedrock";
import { google } from "@ai-sdk/google";
import type { LanguageModelV1 } from "ai";

const PROVIDER = process.env.AGENT_PROVIDER || "anthropic";
const MODEL = process.env.AGENT_MODEL || "claude-4-sonnet-20250514";

const providers: Record<string, any> = {
  anthropic,
  openai,
  bedrock,
  google,
};

export const model: LanguageModelV1 = providers[PROVIDER](MODEL);
