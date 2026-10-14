#!/usr/bin/env node
import { createRequire } from "module";
import { loadConfig } from "./config.js";
import { createClient } from "./sp-client.js";
import { CliError } from "./errors.js";
import { printError } from "./output.js";
import { buildProgram } from "./cli.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof CliError) {
    printError(err.message);
    process.exit(err.exitCode);
  }
  throw err;
}

buildProgram(config, { createClient, version }).parse();
