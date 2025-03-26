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
  tools: {
    // AgentTool	Runs a sub-agent to handle complex, multi-step tasks	No
    // BashTool	Executes shell commands in your environment	Yes
    // GlobTool	Finds files based on pattern matching	No
    // GrepTool	Searches for patterns in file contents	No
    // LSTool	Lists files and directories	No
    // FileReadTool	Reads the contents of files	No
    // FileEditTool	Makes targeted edits to specific files	Yes
    // FileWriteTool	Creates or overwrites files	Yes
    // NotebookReadTool	Reads and displays Jupyter notebook contents	No
    // NotebookEditTool	Modifies Jupyter notebook cells	Yes
  },
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
