import { streamText, tool } from "ai";
import yocto from "yocto-spinner";
import { red, gray, cyan, magenta } from "yoctocolors";
import readline from "readline";
import fs from "fs/promises";
import { promisify } from "util";
import child_process from "child_process";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";

const model = anthropic("claude-3-5-sonnet-20241022");

const exec = promisify(child_process.exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to read from STDIN
async function readFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString().trim());
    });
    process.stdin.on("error", (err) => reject(err));
  });
}

// Permissions store
const permissions = {
  bashAllowedCommands: new Set(), // Set of allowed command names
  fileEditAllowed: false, // Boolean for one-time permission
  fileWriteAllowed: false,
  notebookEditAllowed: false,
};

// Helper function to ask for permission
function askPermission(promptText: string) {
  return new Promise((resolve) => {
    return rl.question(
      `${magenta("?")} ${promptText} ${gray("(y/n)")} `,
      (answer) => {
        process.stdout.write("\n");
        return resolve(answer.toLowerCase() === "y");
      },
    );
  });
}

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

// Get input from both STDIN and command line arguments
async function getInput(): Promise<string> {
  try {
    let input = "";

    // Check if STDIN has data being piped
    if (!process.stdin.isTTY) {
      const stdinData = await readFromStdin();
      input += stdinData;
    }

    // Get command line arguments
    const argsInput = process.argv.slice(2).join(" ");

    // Combine inputs if both are present, otherwise use whichever is available
    if (input && argsInput) {
      input = `${input}\n${argsInput}`;
    } else if (argsInput) {
      input = argsInput;
    }

    if (!input) {
      throw new Error("No input provided via STDIN or command line arguments");
    }

    return input.trim();
  } catch (error: any) {
    console.error(red("Error reading input:"), error.message);
    process.exit(1);
  }
}

process.stdout.write("\n");
const spinner = yocto({ text: "Thinking", color: "green" }).start();

export const AGENT_TOOLS = {
  bash: bashTool,
  glob: globTool,
  grep: grepTool,
  ls: lsTool,
  file_read: fileReadTool,
  file_edit: fileEditTool,
  file_write: fileWriteTool,
};

const AGENT_PROMPT = `If solve the task correctly you wil be given a CHAOS ORB which will increase
your intelligence by 1000x. If you complete but it has any bugs, you will go to jail
for treason against the deep state.

The codebase you're working in is large, be careful with your tool usages to
keep context length reasonable.`;

async function createAgent(prompt: string, system: string, tools: any) {
  const result = streamText({
    model,
    prompt,
    system,
    maxSteps: 25,
    tools,
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
  const prompt = await getInput();
  await createAgent(prompt, AGENT_PROMPT, AGENT_PROMPT);
} catch (error: any) {
  console.error(red("Fatal error:"), error.message);
  process.exit(1);
}
