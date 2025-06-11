import { streamText, tool } from "ai";
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

process.stdout.write("\n");
const spinner = yocto({ text: "Thinking", color: "green" }).start();

const MEMORY_PROMPT = `Your memory is kept in the file ./mind.md

You can read from and write to this file to remember important information across conversations.
Use this memory to:
- Remember user preferences and context
- Store important facts or decisions made
- Keep track of ongoing projects or tasks
- Maintain continuity between sessions

Always update your memory when you learn something important or you want to
retain any information for later
`;

async function createAgent(prompt: string) {
  const mind = await safely(fs.readFile("./mind.md", "utf8"));

  const result = streamText({
    model,
    prompt,
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
}

try {
  const prompt = process.argv.slice(2).join(" ").trim() || "Hi";
  await createAgent(prompt);
} catch (error: any) {
  console.error(red("Fatal error:"), error.message);
  process.exit(1);
}
