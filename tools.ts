import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import yocto from "yocto-spinner";
import { red, gray } from "yoctocolors";
import readline from "readline";
import fs from "fs/promises";
import { promisify } from "util";
import child_process from "child_process";
import glob from "glob";

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
const askPermission = (promptText) =>
  new Promise((resolve) =>
    rl.question(promptText, (answer) => resolve(answer.toLowerCase() === "y")),
  );

const agentTool = {
  name: "agent",
  description: "Runs a sub-agent to handle complex, multi-step tasks",
  parameters: {
    type: "object",
    properties: {
      task: { type: "string", description: "The task to perform" },
    },
    required: ["task"],
  },
  execute: async ({ task }) => ({
    success: true,
    message: `Sub-agent executed task: ${task}`,
  }),
};

const bashTool = {
  name: "bash",
  description: "Executes shell commands in your environment",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute" },
    },
    required: ["command"],
  },
  execute: async ({ command }) => {
    const commandName = command.split(" ")[0];
    if (!permissions.bashAllowedCommands.has(commandName)) {
      const allow = await askPermission(
        `Allow executing command '${commandName}'? (y/n) `,
      );
      if (allow) {
        permissions.bashAllowedCommands.add(commandName);
      } else {
        return {
          success: false,
          message: `Permission denied for command '${commandName}'`,
        };
      }
    }
    try {
      const { stdout, stderr } = await exec(command);
      return { success: true, output: stdout + stderr };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};

const globTool = {
  name: "glob",
  description: "Finds files based on pattern matching",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "The glob pattern" },
    },
    required: ["pattern"],
  },
  execute: async ({ pattern }) => {
    try {
      const files = glob.sync(pattern);
      return { success: true, files };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};

const grepTool = {
  name: "grep",
  description: "Searches for patterns in file contents",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the file" },
      pattern: { type: "string", description: "Regex pattern to search" },
    },
    required: ["filePath", "pattern"],
  },
  execute: async ({ filePath, pattern }) => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const regex = new RegExp(pattern);
      const matches = content.split("\n").filter((line) => regex.test(line));
      return { success: true, matches };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};

const lsTool = {
  name: "ls",
  description: "Lists files and directories",
  parameters: {
    type: "object",
    properties: {
      dirPath: { type: "string", description: "Directory path" },
    },
    required: ["dirPath"],
  },
  execute: async ({ dirPath }) => {
    try {
      const items = await fs.readdir(dirPath);
      return { success: true, items };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};

const fileReadTool = {
  name: "file_read",
  description: "Reads the contents of files",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the file" },
    },
    required: ["filePath"],
  },
  execute: async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return { success: true, content };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};

const fileEditTool = {
  name: "file_edit",
  description: "Makes targeted edits to specific files",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the file" },
      search: { type: "string", description: "String to replace" },
      replace: { type: "string", description: "Replacement string" },
    },
    required: ["filePath", "search", "replace"],
  },
  execute: async ({ filePath, search, replace }) => {
    if (!permissions.fileEditAllowed) {
      const allow = await askPermission(`Allow editing files? (y/n) `);
      if (allow) {
        permissions.fileEditAllowed = true;
      } else {
        return {
          success: false,
          message: "Permission denied for file editing",
        };
      }
    }
    try {
      const content = await fs.readFile(filePath, "utf8");
      const newContent = content.replace(search, replace);
      await fs.writeFile(filePath, newContent, "utf8");
      return { success: true, message: "File edited successfully" };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};

const fileWriteTool = {
  name: "file_write",
  description: "Creates or overwrites files",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the file" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["filePath", "content"],
  },
  execute: async ({ filePath, content }) => {
    if (!permissions.fileWriteAllowed) {
      const allow = await askPermission(`Allow writing files? (y/n) `);
      if (allow) {
        permissions.fileWriteAllowed = true;
      } else {
        return {
          success: false,
          message: "Permission denied for file writing",
        };
      }
    }
    try {
      await fs.writeFile(filePath, content, "utf8");
      return { success: true, message: "File written successfully" };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};

const notebookReadTool = {
  name: "notebook_read",
  description: "Reads and displays Jupyter notebook contents",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the notebook" },
    },
    required: ["filePath"],
  },
  execute: async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const notebook = JSON.parse(content);
      return { success: true, notebook: JSON.stringify(notebook, null, 2) };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};

const notebookEditTool = {
  name: "notebook_edit",
  description: "Modifies Jupyter notebook cells",
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to the notebook" },
      cellIndex: { type: "integer", description: "Index of the cell to edit" },
      newContent: { type: "string", description: "New content for the cell" },
    },
    required: ["filePath", "cellIndex", "newContent"],
  },
  execute: async ({ filePath, cellIndex, newContent }) => {
    if (!permissions.notebookEditAllowed) {
      const allow = await askPermission(`Allow editing notebooks? (y/n) `);
      if (allow) {
        permissions.notebookEditAllowed = true;
      } else {
        return {
          success: false,
          message: "Permission denied for notebook editing",
        };
      }
    }
    try {
      const content = await fs.readFile(filePath, "utf8");
      const notebook = JSON.parse(content);
      if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
        return { success: false, message: "Cell index out of range" };
      }
      notebook.cells[cellIndex].source = newContent.split("\n");
      await fs.writeFile(filePath, JSON.stringify(notebook, null, 2), "utf8");
      return { success: true, message: "Notebook cell edited successfully" };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};

export const tools = {
  agent: agentTool,
  bash: bashTool,
  glob: globTool,
  grep: grepTool,
  ls: lsTool,
  file_read: fileReadTool,
  file_edit: fileEditTool,
  file_write: fileWriteTool,
  notebook_read: notebookReadTool,
  notebook_edit: notebookEditTool,
};
