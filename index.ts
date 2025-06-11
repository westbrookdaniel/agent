import {
  appendResponseMessages,
  generateId,
  streamText,
  tool,
  type Message,
} from "ai";
import yocto from "yocto-spinner";
import { red, gray, cyan } from "yoctocolors";
import fs from "fs/promises";
import { promisify } from "util";
import child_process from "child_process";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { createSystemPrompt } from "./system";

const model = anthropic("claude-3-5-sonnet-20241022");

const exec = promisify(child_process.exec);

async function safely<T>(fn: Promise<T>): Promise<T | null> {
  try {
    return await fn;
  } catch (error) {
    return null;
  }
}

const bashTool = tool({
  description: "Executes shell commands in your environment",
  parameters: z.object({
    command: z.string().describe("The shell command to execute"),
  }),
  execute: async ({ command }) => {
    try {
      const { stdout, stderr } = await exec(command);
      return { success: true, output: stdout + stderr };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

const globTool = tool({
  description: "Finds files based on pattern matching",
  parameters: z.object({
    pattern: z.string().describe("The glob pattern"),
  }),
  execute: async ({ pattern }) => {
    try {
      const iter = new Bun.Glob(pattern).scan();
      const files = [];
      for await (const value of iter) files.push(value);
      return { success: true, files };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

const grepTool = tool({
  description: "Searches for patterns in file contents",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    pattern: z.string().describe("Regex pattern to search"),
  }),
  execute: async ({ filePath, pattern }) => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const regex = new RegExp(pattern);
      const matches = content.split("\n").filter((line) => regex.test(line));
      return { success: true, matches };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

const lsTool = tool({
  description: "Lists files and directories",
  parameters: z.object({
    dirPath: z.string().describe("Directory path"),
  }),
  execute: async ({ dirPath }) => {
    try {
      const items = await fs.readdir(dirPath);
      return { success: true, items };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

const fileReadTool = tool({
  description: "Reads the contents of files",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
  }),
  execute: async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return { success: true, content };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

const fileEditTool = tool({
  description: "Makes targeted edits to specific files",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    search: z.string().describe("String to replace"),
    replace: z.string().describe("Replacement string"),
  }),
  execute: async ({ filePath, search, replace }) => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const newContent = content.replace(search, replace);
      await fs.writeFile(filePath, newContent, "utf8");
      return { success: true, message: "File edited successfully" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

const fileWriteTool = tool({
  description: "Creates or overwrites files",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    content: z.string().describe("Content to write"),
  }),
  execute: async ({ filePath, content }) => {
    try {
      await fs.writeFile(filePath, content, "utf8");
      return { success: true, message: "File written successfully" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

const updateMemoryTool = tool({
  description: "Updates the memory file with new information",
  parameters: z.object({
    content: z.string().describe("Content to append to memory"),
    importance: z.number().min(0).max(5).describe("Importance level from 0-5"),
  }),
  execute: async ({ content, importance }) => {
    try {
      const timestamp = new Date().toISOString();
      const entry = `\n## ${timestamp} (Importance: ${importance}/5)\n${content}`;
      const stats = await safely(fs.stat("./mind.md"));
      if (!stats) await fs.writeFile("./mind.md", "", "utf8");
      await fs.appendFile("./mind.md", entry, "utf8");
      return { success: true, message: "Memory updated successfully" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

process.stdout.write("\n");
const spinner = yocto({ text: "Thinking", color: "green" }).start();

const MEMORY_PROMPT = `Your memory is kept in the file ./mind.md
You can use the update_memory tool to append to it, or you can interact with it like a normal file

Store information to memory aggressively. If the user mentions any information about them or their life then update your memory to include it.
Your memory will automatically be pruned if it gets too big.
If a user requests to store something in memory, always do it.
If a user requests to remove something from your memory, always do it.

DO NOT inform the user that you are updating your memory. They can
NOT see that you are and it is an internal detail`;

async function triggerAgent(messages: Message[]) {
  const mind = await safely(fs.readFile("./mind.md", "utf8"));

  const result = streamText({
    model,
    messages,
    system:
      createSystemPrompt() +
      "\n\n" +
      MEMORY_PROMPT +
      "\n\n<context_from_previous_conversations>\n\n" +
      (mind || "No previous conversations") +
      "</context_from_previous_conversations>",
    maxSteps: 25,
    tools: {
      bash: bashTool,
      glob: globTool,
      grep: grepTool,
      ls: lsTool,
      file_read: fileReadTool,
      file_edit: fileEditTool,
      file_write: fileWriteTool,
      update_memory: updateMemoryTool,
    },
  });

  for await (const part of result.fullStream) {
    if (spinner.isSpinning) spinner.stop().clear();

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

    const prompt = await ask();
    process.stdout.write("\n");

    messages.push({ id: generateId(), role: "user", content: prompt });
  }
} catch (error: any) {
  console.error(red("Fatal error:"), error.message);
  process.exit(1);
}

async function ask(): Promise<string> {
  process.stdout.write(cyan("You: "));

  return new Promise((resolve) => {
    let input = "";
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");

    const onData = (key: string) => {
      // Handle Ctrl+C
      if (key === "\u0003") {
        process.exit(0);
      }

      // Handle Enter
      if (key === "\r" || key === "\n") {
        process.stdout.write("\n");
        process.stdin.setRawMode(false);
        process.stdin.removeListener("data", onData);
        resolve(input.trim());
        return;
      }

      // Handle Backspace
      if (key === "\u007f") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }

      // Handle regular characters
      if (key >= " " && key <= "~") {
        input += key;
        process.stdout.write(key);
      }
    };

    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}
