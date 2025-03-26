import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool } from "ai";
import yocto from "yocto-spinner";
import { red, gray, green } from "yoctocolors";
import readline from "readline";
import fs from "fs/promises";
import { promisify } from "util";
import child_process from "child_process";
import { z } from "zod";

const exec = promisify(child_process.exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Permissions store
const permissions = {
  bashAllowedCommands: new Set(), // Set of allowed command names
  fileEditAllowed: false, // Boolean for one-time permission
  fileWriteAllowed: false,
  notebookEditAllowed: false,
};

// Helper function to ask for permission
const askPermission = (promptText: string) => {
  if (process.env.YOLO) return true;
  process.stdout.write("\n\n");
  return new Promise((resolve) =>
    rl.question(`${green("?")} ${promptText} ${gray("(y/n)")} `, (answer) => {
      return resolve(answer.toLowerCase() === "y");
    }),
  );
};

// Tools
const agentTool = tool({
  description: "Runs a sub-agent to handle complex, multi-step tasks",
  parameters: z.object({
    task: z.string().describe("The task to perform"),
  }),
  execute: async ({ task }) => {
    try {
      return {
        success: true,
        message: `Sub-agent executed task: ${task}`,
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

const bashTool = tool({
  description: "Executes shell commands in your environment",
  parameters: z.object({
    command: z.string().describe("The shell command to execute"),
  }),
  execute: async ({ command }) => {
    try {
      const commandName = command.split(" ")[0];
      if (!permissions.bashAllowedCommands.has(commandName)) {
        const allow = await askPermission(`Allow executing '${commandName}'`);
        if (allow) {
          permissions.bashAllowedCommands.add(commandName);
        } else {
          return {
            success: false,
            message: `Permission denied for command '${commandName}'`,
          };
        }
      }
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
      if (!permissions.fileEditAllowed) {
        const allow = await askPermission(`Allow editing '${filePath}'`);
        if (allow) {
          permissions.fileEditAllowed = true;
        } else {
          return {
            success: false,
            message: "Permission denied for file editing",
          };
        }
      }
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
      if (!permissions.fileWriteAllowed) {
        const allow = await askPermission(`Allow writing '${filePath}'`);
        if (allow) {
          permissions.fileWriteAllowed = true;
        } else {
          return {
            success: false,
            message: "Permission denied for file writing",
          };
        }
      }
      await fs.writeFile(filePath, content, "utf8");
      return { success: true, message: "File written successfully" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
});

export const tools = {
  agent: agentTool,
  bash: bashTool,
  glob: globTool,
  grep: grepTool,
  ls: lsTool,
  file_read: fileReadTool,
  file_edit: fileEditTool,
  file_write: fileWriteTool,
};

const prompt = process.argv.slice(2).join(" ");

process.stdout.write("\n");
const spinner = yocto({ text: "Thinking", color: "green" }).start();

const result = streamText({
  model: anthropic("claude-3-7-sonnet-20250219"),
  prompt,
  maxSteps: 25,
  tools,
});

for await (const part of result.fullStream) {
  if (spinner.isSpinning) spinner.stop().clear();

  if (part.type === "text-delta") {
    process.stdout.write(part.textDelta);
  }
  if (part.type === "tool-result") {
    const fn = part.result.success ? green : red;
    process.stdout.write(`\n${fn(part.toolName)}\n`);
    const key = Object.keys(part.result).filter((k) => k !== "success")[0];
    const data = part.result[key];
    process.stdout.write(`${gray(data.split("\n").slice(0, 5).join("\n"))}`);
    process.stdout.write("\n");
  }
}

process.stdout.write("\n\n");

process.exit(0);
