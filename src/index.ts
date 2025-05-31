import { dim } from "yoctocolors";
import { readFileSync, watch } from "fs";
import {
  bashTool,
  globTool,
  grepTool,
  lsTool,
  fileReadTool,
  fileEditTool,
  fileWriteTool,
} from "./tools";
import { createAgent } from "./agent";

process.stdout.write(`\n${dim("[agent]")}\n\n`);

const tools = {
  bash: bashTool,
  glob: globTool,
  grep: grepTool,
  ls: lsTool,
  file_read: fileReadTool,
  file_edit: fileEditTool,
  file_write: fileWriteTool,
};

let idle = false;

watch(".", { recursive: true }, async (eventType, filename) => {
  if (idle && eventType === "change" && filename) {
    console.log(`\n${dim("[change]")} ${filename}`);

    idle = false;

    const contents = readFileSync(filename, "utf8");

    const prompt = `File \`${filename}\` was modified. Please analyze the changes and provide assistance if needed.
The codebase you're working in is large, be careful with your tool usages to keep context length reasonable.
The contents of the changed file are:\n\n${contents}`;

    await createAgent(prompt, prompt, tools);

    idle = true;
  }
});
