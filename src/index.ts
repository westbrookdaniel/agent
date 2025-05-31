import { dim, magenta } from "yoctocolors";
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
import { promisify } from "util";

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

let idle = true;

const exec = promisify(child_process.exec);

watch(".", { recursive: true }, async (eventType, filename) => {
  if (idle && eventType === "change" && filename) {
    const gitCheck = await exec(
      `git ls-files --error-unmatch "${filename}" 2>/dev/null`,
    );
    if (gitCheck.exitCode !== 0) {
      console.log(`${dim("[not in git]")} ${filename} (not in git)`);
      return;
    }

    const contents = readFileSync(filename, "utf8");

    if (!contents.includes("AI:")) {
      console.log(`${dim("[no AI:]")} ${filename}`);
      return;
    }

    idle = false;
    console.log(magenta(`[start]  ${filename}\n`));

    const prompt = `File \`${filename}\` was modified. Please analyze the changes and provide assistance if needed.
The codebase you're working in is large, be careful with your tool usages to keep context length reasonable.
Unless the contents of the file instruct your assitance keep your response exteremly minimal.
The contents of the changed file are:\n\n${contents}`;

    await createAgent(prompt, prompt, tools);

    console.log(magenta("[end]"));
    idle = true;
  }
});
