import { cyan } from "yoctocolors";

export async function ask(): Promise<string> {
  process.stdout.write(cyan("You: "));

  return new Promise((resolve) => {
    let input = "";
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");

    const onData = (key: string) => {
      // Handle Ctrl+C
      if (key === "\u0003") {
        process.exit(0);
      }

      // Handle Enter
      if (key === "\r" || key === "\n") {
        process.stdout.write("\n");
        process.stdin.setRawMode(false);
        process.stdin.removeListener("data", onData);
        resolve(input.trim());
        return;
      }

      // Handle Backspace
      if (key === "\u007f") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }

      // Handle regular characters
      if (key >= " " && key <= "~") {
        input += key;
        process.stdout.write(key);
      }
    };

    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}
