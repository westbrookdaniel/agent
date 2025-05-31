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

watch(".", { recursive: true }, async (eventType, filename) => {
  // AI: make this ignore files that arent in git here
  // with an if early return

  if (idle && eventType === "change" && filename) {
    const gitCheck = await tools.bash({ command: `git ls-files --error-unmatch ${filename}` });
    if (gitCheck.exitCode !== 0) {
      console.log(`\n${dim("[ignore]")} ${filename} (not in git)`);
      return;
    }

    console.log(`\n${dim("[change]")} ${filename}`);

    const contents = readFileSync(filename, "utf8");

    if (!contents.includes("AI:")) return;

    idle = false;
    console.log(magenta("[start]\n"));

    const prompt = `File \`${filename}\` was modified. Please analyze the changes and provide assistance if needed.
The codebase you're working in is large, be careful with your tool usages to keep context length reasonable.
Unless the contents of the file instruct your assitance keep your response exteremly minimal.
The contents of the changed file are:\n\n${contents}`;

    await createAgent(prompt, prompt, tools);

    console.log(magenta("[end]"));
    idle = true;
  }
});
