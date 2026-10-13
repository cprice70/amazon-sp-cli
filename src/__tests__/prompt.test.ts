import { describe, it, expect } from "vitest";
import { PassThrough } from "stream";
import { createPrompter } from "../prompt.js";

function setup() {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = "";
  output.on("data", (chunk) => {
    written += String(chunk);
  });
  // terminal: true makes readline own the echo, which is what lets us mute it.
  const prompter = createPrompter({ input, output, terminal: true });
  return { input, prompter, out: () => written };
}

describe("createPrompter", () => {
  it("ask shows the prompt and echoes the typed answer", async () => {
    const { input, prompter, out } = setup();
    const answer = prompter.ask("Client ID: ");
    input.write("amzn1.app\n");
    expect(await answer).toBe("amzn1.app");
    expect(out()).toContain("Client ID: ");
    expect(out()).toContain("amzn1.app");
    prompter.close();
  });

  it("askSecret shows the prompt but never echoes the answer", async () => {
    const { input, prompter, out } = setup();
    const answer = prompter.askSecret("Client Secret: ");
    input.write("hunter2\n");
    expect(await answer).toBe("hunter2");
    expect(out()).toContain("Client Secret: ");
    expect(out()).not.toContain("hunter2");
    prompter.close();
  });

  it("askSecret ends the line so the next prompt starts fresh", async () => {
    const { input, prompter, out } = setup();
    const answer = prompter.askSecret("Token: ");
    input.write("abc\n");
    await answer;
    expect(out().endsWith("\n")).toBe(true);
    prompter.close();
  });

  it("echo resumes for a normal question after a secret one", async () => {
    const { input, prompter, out } = setup();
    const secret = prompter.askSecret("Secret: ");
    input.write("s3cret\n");
    await secret;
    const plain = prompter.ask("Region: ");
    input.write("eu\n");
    await plain;
    expect(out()).not.toContain("s3cret");
    expect(out()).toContain("eu");
    prompter.close();
  });
});
