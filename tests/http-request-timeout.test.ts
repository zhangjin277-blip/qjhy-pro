import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preload = resolve(process.cwd(), "scripts/http-request-timeout.mjs");

function readRequestTimeout(envValue?: string): number {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      preload,
      "--eval",
      'console.log(require("node:http").createServer().requestTimeout)',
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ...(envValue === undefined ? {} : { HTTP_REQUEST_TIMEOUT_MS: envValue }),
      },
    },
  );

  return Number(output.trim());
}

describe("HTTP request timeout preload", () => {
  it("defaults to ten minutes", () => {
    expect(readRequestTimeout()).toBe(600_000);
  });

  it("supports an explicit deployment override", () => {
    expect(readRequestTimeout("900000")).toBe(900_000);
  });
});
