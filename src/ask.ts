import { cyan } from "yoctocolors";
import { stdin, stdout, type Unsub } from "./io";

export async function ask(message: string): Promise<string> {
  stdout.write(cyan(message + " "));

  let unsub: Unsub | undefined;

  const response = await new Promise<string>((resolve) => {
    let input = "";

    unsub = stdin.onKey((key) => {
      // Handle Enter
      if (key === "\r" || key === "\n") {
        stdout.write("\n");
        resolve(input.trim());
        return;
      }

      // Handle Backspace
      if (key === "\u007f") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }

      // Handle regular characters
      if (key >= " " && key <= "~") {
        input += key;
        stdout.write(key);
      }
    });
  });

  unsub?.();

  return response;
}
