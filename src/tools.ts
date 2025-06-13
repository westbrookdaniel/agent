import { tool } from "ai";
import fs from "fs/promises";
import { promisify } from "util";
import child_process from "child_process";
import path from "path";
import { z } from "zod";

const exec = promisify(child_process.exec);

const ALLOWED_DIR = process.cwd();

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
