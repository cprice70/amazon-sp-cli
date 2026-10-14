import readline from "readline/promises";
import { Writable } from "stream";
import type { Readable } from "stream";

export interface Prompter {
  /** Ask a question, echoing what the user types. */
  ask(question: string): Promise<string>;
  /** Ask a question without echoing the answer (secrets, tokens). */
  askSecret(question: string): Promise<string>;
  close(): void;
}

export interface PrompterOptions {
  input?: Readable & { isTTY?: boolean };
  output?: Writable & { isTTY?: boolean };
  /**
   * Let readline own echoing. Required for askSecret to actually hide input:
   * in non-terminal mode the TTY driver echoes keystrokes before readline
   * ever sees them. Defaults to whether stdin is a TTY.
   */
  terminal?: boolean;
}

/**
 * Interactive prompts for the login wizard. Echo is suppressed for secrets by
 * routing readline's output through a mutable sink: while muted, everything
 * readline tries to write (the typed characters, cursor movement) is dropped
 * and we write the prompt and trailing newline ourselves.
 */
export function createPrompter(opts: PrompterOptions = {}): Prompter {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const terminal = opts.terminal ?? Boolean(input.isTTY);

  let muted = false;
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) output.write(chunk);
      callback();
    },
  });

  const rl = readline.createInterface({ input, output: sink, terminal });

  return {
    ask(question) {
      return rl.question(question);
    },
    async askSecret(question) {
      output.write(question);
      muted = true;
      try {
        return await rl.question("");
      } finally {
        muted = false;
        output.write("\n");
      }
    },
    close() {
      rl.close();
    },
  };
}
