import { gray, magenta } from "yoctocolors";

import readline from "readline";

export const permissions = {
  bashAllowedCommands: new Set(), // Set of allowed command names
  fileEditAllowed: false, // Boolean for one-time permission
  fileWriteAllowed: false,
  notebookEditAllowed: false,
};

export function askPermission(promptText: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

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
