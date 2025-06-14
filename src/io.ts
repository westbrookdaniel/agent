import { PassThrough } from "stream";

export type Unsub = () => void;

interface TtyReadable extends PassThrough {
  onKey(fn: (key: string) => void): Unsub;
}

export const stdin = new PassThrough() as TtyReadable;

// Always handle Ctrl+C
stdin.on("data", (key) => {
  if (key === "\u0003") {
    process.exit(0);
  }
});

process.stdin.pipe(stdin);

stdin.onKey = (fn) => {
  stdin.on("data", fn);
  return () => {
    stdin.removeListener("data", fn);
  };
};

export const stdout = new PassThrough();
stdout.pipe(process.stdout);

export const stderr = new PassThrough();
stderr.pipe(process.stderr);

process.stdin.setRawMode(true);
stdin.setEncoding("utf8");
