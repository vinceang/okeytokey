#!/usr/bin/env node
import { build } from "./build.js";

/**
 * `okeytokey build [config]` — produce artifacts from okeytokey.config.json
 * without the app, so CI can run it.
 */
const [, , command, configArg] = process.argv;

if (command !== "build") {
  console.log("Usage: okeytokey build [okeytokey.config.json]");
  process.exit(command === undefined || command === "--help" ? 0 : 1);
}

const configPath = configArg ?? "okeytokey.config.json";

build(configPath)
  .then((result) => {
    for (const file of result.files) {
      console.log(`✓ ${file.path} (${String(file.bytes)} bytes)`);
    }
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
