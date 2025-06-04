import yocto from "yocto-spinner";
import readline from "readline";
import Anthropic from "@anthropic-ai/sdk";

const Color = {
  Gray: "\x1b[90m",
  Cyan: "\x1b[96m",
  Reset: "\x1b[0m",
  Dim: "\x1b[2m",
};

const client = new Anthropic();

try {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: process.argv.slice(2).join(" ").trim() || (await ask()),
    },
  ];

  while (true) {
    process.stdout.write("\n");

    const stream = client.messages.stream({
      model: "claude-4-sonnet-20250514",
      max_tokens: 1024,
      messages,
      tool_choice: { type: "auto" },
      tools: [{ name: "web_search", type: "web_search_20250305", max_uses: 3 }],
    });

    const spinner = yocto({ text: "Thinking", color: "cyan" }).start();

    for await (const e of stream) {
      if (spinner.isSpinning) spinner.stop().clear();

      if (e.type === "content_block_delta") {
        if (e.delta.type === "thinking_delta") {
          process.stdout.write(
            `${Color.Gray}${e.delta.thinking}${Color.Reset}`,
          );
        }
        if (e.delta.type === "text_delta") {
          process.stdout.write(e.delta.text);
        }
      }
    }

    messages.push(
      ...stream.receivedMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    );

    process.stdout.write("\n");
    messages.push({ role: "user", content: await ask() });
  }
} catch (error: any) {
  console.error("Fatal error:", error.message);
  process.exit(1);
}

async function ask() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  process.stdout.write("\n");

  const prompt = await new Promise<string>((resolve) => {
    rl.question(`${Color.Cyan}? ${Color.Reset}${Color.Dim}`, resolve);
  });

  rl.close();
  process.stdout.write(Color.Reset);
  return prompt;
}
