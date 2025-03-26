import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import yocto from "yocto-spinner";
import { red, gray } from "yoctocolors";

const prompt = process.argv.slice(2).join(" ");

process.stdout.write("\n");
const spinner = yocto({ text: "Thinking", color: "green" }).start();

const result = streamText({
  model: anthropic("claude-3-7-sonnet-20250219"),
  prompt,
  maxSteps: 25,
  tools: {},
});

for await (const part of result.fullStream) {
  if (spinner.isSpinning) spinner.stop().clear();

  if (part.type === "text-delta") {
    process.stdout.write(part.textDelta);
  }
  if (part.type === "tool-result") {
    process.stdout.write(
      `${(part.result.success ? gray : red)(part.result.message)}\n`,
    );
  }
}

process.stdout.write("\n\n");
