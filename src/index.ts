import {
  appendResponseMessages,
  generateId,
  streamText,
  type Message,
} from "ai";
import yocto, { type Spinner } from "yocto-spinner";
import { red, gray, cyan } from "yoctocolors";
import { anthropic } from "@ai-sdk/anthropic";
import { createSystemPrompt } from "../system";
import {
  bashTool,
  globTool,
  grepTool,
  lsTool,
  fileReadTool,
  fileEditTool,
  fileWriteTool,
} from "./tools";
import { ask } from "./ask";

const model = anthropic("claude-3-5-sonnet-20241022");

process.stdout.write("\n");

let spinner: Spinner | undefined;

if (!process.env.CI) {
  spinner = yocto({ text: "Thinking", color: "green" }).start();
}

async function triggerAgent(messages: Message[]) {
  const result = streamText({
    model,
    messages,
    system: createSystemPrompt(),
    maxSteps: 25,
    tools: {
      bash: bashTool,
      glob: globTool,
      grep: grepTool,
      ls: lsTool,
      file_read: fileReadTool,
      file_edit: fileEditTool,
      file_write: fileWriteTool,
    },
  });

  for await (const part of result.fullStream) {
    if (spinner?.isSpinning) spinner.stop().clear();

    if (part.type === "error") {
      let err: any = part.error;
      if (String(err).startsWith("[object")) {
        err = JSON.stringify(part.error, null, 2);
      }
      process.stdout.write(red(err));
    }

    if (part.type === "text-delta") {
      process.stdout.write(part.textDelta);
    }

    if (part.type === "tool-result") {
      process.stdout.write("\n\n");
      const args = Object.entries(part.args)
        .map(([key, value]) => {
          const str = String(value);
          let arg = str.slice(0, 50).replaceAll("\n", "\\n");
          if (str.length !== arg.length) arg += "...";
          return `${gray(key + ":")} ${arg}`;
        })
        .join(gray(", "));
      process.stdout.write(`${cyan(part.toolName)} ${args}\n`);

      const fn = part.result.success ? gray : red;
      const key = Object.keys(part.result).filter((k) => k !== "success")[0];
      let data = (part.result as any)[key];
      if (typeof data !== "string") data = JSON.stringify(data, null, 2);
      process.stdout.write(
        `${fn(data.split("\n").slice(0, 5).join("\n").trim())}\n\n`,
      );
    }
  }

  process.stdout.write("\n\n");

  return (await result.response).messages;
}

try {
  let messages: Message[] = [
    {
      id: generateId(),
      role: "user",
      content: process.argv.slice(2).join(" ").trim() || "Hi",
    },
  ];

  while (true) {
    const responseMessages = await triggerAgent(messages);

    messages = appendResponseMessages({
      messages,
      responseMessages,
    });

    if (process.env.CI) {
      process.exit(0);
    }

    const prompt = await ask("You:");
    process.stdout.write("\n");

    messages.push({ id: generateId(), role: "user", content: prompt });
  }
} catch (error: any) {
  console.error(red("Fatal error:"), error.message);
  process.exit(1);
}
