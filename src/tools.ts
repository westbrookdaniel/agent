import { gray } from "yoctocolors";
import { stdout } from "./io";
import { tool } from "ai";
import fs from "fs/promises";
import { promisify } from "util";
import child_process from "child_process";
import path from "path";
import { z } from "zod";
import { ask } from "./ask";
import { setTimeout } from "timers/promises";

const exec = promisify(child_process.exec);

const ALLOWED_DIR = process.cwd();

// Request permission for sensitive operations
async function requestPermission(operation: string): Promise<boolean> {
  if (process.env.CI === "true") {
    return true; // Skip permission check in CI
  }

  await setTimeout(0);

  stdout.write(gray(`\nPermission required to ${operation}\n`));
  const response = await ask("Allow? [y/N]");
  return response.trim().toLowerCase() === "y";
}

// Validate that a file path is within the allowed directory
function restrictPath(filePath: string) {
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(ALLOWED_DIR)) {
    throw new Error(
      `Access denied: Path ${filePath} is outside allowed directory ${ALLOWED_DIR}`,
    );
  }
  return resolvedPath;
}

export const bashTool = tool({
  description: "Executes shell commands in a sandboxed environment",
  parameters: z.object({
    command: z.string().describe("The shell command to execute"),
  }),
  execute: async ({ command }) => {
    if (!(await requestPermission(`execute \`${command}\``))) {
      return { success: false, message: "Permission denied" };
    }

    // Prevent dangerous commands (e.g., rm -rf /)
    if (command.match(/(rm\s+-rf\s*\/|sudo|eval|exec\s+[^&|;])/i)) {
      return {
        success: false,
        message: "Potentially dangerous command detected",
      };
    }

    try {
      const { stdout, stderr } = await exec(command, {
        cwd: ALLOWED_DIR,
      });
      return { success: true, output: stdout + stderr };
    } catch (error) {
      const message = Error.isError(error) ? error.message : "Unknown error";
      return { success: false, message };
    }
  },
});

export const globTool = tool({
  description: "Finds files based on pattern matching",
  parameters: z.object({
    pattern: z.string().describe("The glob pattern"),
  }),
  execute: async ({ pattern }) => {
    try {
      // Ensure pattern is safe and relative to ALLOWED_DIR
      const safePattern = path.join(ALLOWED_DIR, pattern);
      restrictPath(safePattern); // Validate path
      const iter = new Bun.Glob(pattern).scan({ cwd: ALLOWED_DIR });
      const files = [];
      for await (const value of iter) {
        files.push(path.join(ALLOWED_DIR, value));
      }
      return { success: true, files };
    } catch (error) {
      const message = Error.isError(error) ? error.message : "Unknown error";
      return { success: false, message };
    }
  },
});

export const grepTool = tool({
  description: "Searches for patterns in file contents",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    pattern: z.string().describe("Regex pattern to search"),
  }),
  execute: async ({ filePath, pattern }) => {
    try {
      const safePath = restrictPath(filePath);
      const content = await fs.readFile(safePath, "utf8");
      const regex = new RegExp(pattern);
      const matches = content.split("\n").filter((line) => regex.test(line));
      return { success: true, matches };
    } catch (error) {
      const message = Error.isError(error) ? error.message : "Unknown error";
      return { success: false, message };
    }
  },
});

export const lsTool = tool({
  description: "Lists files and directories",
  parameters: z.object({
    dirPath: z.string().describe("Directory path"),
  }),
  execute: async ({ dirPath }) => {
    try {
      const safePath = restrictPath(dirPath);
      const items = await fs.readdir(safePath);
      return { success: true, items };
    } catch (error) {
      const message = Error.isError(error) ? error.message : "Unknown error";
      return { success: false, message };
    }
  },
});

export const fileReadTool = tool({
  description: "Reads the contents of files",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
  }),
  execute: async ({ filePath }) => {
    try {
      const safePath = restrictPath(filePath);
      const content = await fs.readFile(safePath, "utf8");
      return { success: true, content };
    } catch (error) {
      const message = Error.isError(error) ? error.message : "Unknown error";
      return { success: false, message };
    }
  },
});

export const fileEditTool = tool({
  description: "Makes targeted edits to specific files",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    search: z.string().describe("String to replace"),
    replace: z.string().describe("Replacement string"),
  }),
  execute: async ({ filePath, search, replace }) => {
    if (!(await requestPermission(`edit file ${filePath}`))) {
      return { success: false, message: "Permission denied" };
    }

    try {
      const safePath = restrictPath(filePath);
      const content = await fs.readFile(safePath, "utf8");
      const newContent = content.replace(search, replace);

      await fs.writeFile(safePath, newContent, "utf8");
      return { success: true, message: "File edited successfully" };
    } catch (error) {
      const message = Error.isError(error) ? error.message : "Unknown error";
      return { success: false, message };
    }
  },
});

export const fileWriteTool = tool({
  description: "Creates or overwrites files",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    content: z.string().describe("Content to write"),
  }),
  execute: async ({ filePath, content }) => {
    if (!(await requestPermission(`write file ${filePath}`))) {
      return { success: false, message: "Permission denied" };
    }

    try {
      const safePath = restrictPath(filePath);

      await fs.writeFile(safePath, content, "utf8");
      return { success: true, message: "File written successfully" };
    } catch (error) {
      const message = Error.isError(error) ? error.message : "Unknown error";
      return { success: false, message };
    }
  },
});

let todoStore: Array<{
  id: string;
  content: string;
  done: boolean;
}> = [];

export const todoReadTool = tool({
  description: "Reads all todo items from memory",
  parameters: z.object({}),
  execute: async () => {
    return {
      success: true,
      todos: todoStore,
      message: todoStore
        .map((t) => `- [${t.done ? "x" : " "}] ${t.content} (${t.id})`)
        .join("\n"),
    };
  },
});

export const todoWriteTool = tool({
  description:
    "Updates the todo list with provided items. Ensure you provide all the items in the list not just the ones you're updating or creating",
  parameters: z.object({
    todos: z
      .array(
        z.object({
          id: z.string().describe("Unique identifier"),
          content: z.string().describe("Task description"),
          done: z.boolean().describe("Whether the task is completed"),
        }),
      )
      .describe("Array of todo items"),
  }),
  execute: async ({ todos }) => {
    todoStore = todos;
    return {
      success: true,
      todos: todoStore,
      message: todoStore
        .map((t) => `- [${t.done ? "x" : " "}] ${t.content} (${t.id})`)
        .join("\n"),
    };
  },
});
