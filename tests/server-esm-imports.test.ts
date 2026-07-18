import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Vercel server imports", () => {
  it("uses Node ESM-compatible relative specifiers", async () => {
    const extensionless: string[] = [];

    for (const directory of ["api", "lib"]) {
      const files = await readdir(new URL(`../${directory}/`, import.meta.url), { recursive: true });

      for (const file of files.filter((path) => path.endsWith(".ts"))) {
        const source = await readFile(new URL(`../${directory}/${file}`, import.meta.url), "utf8");

        for (const match of source.matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g)) {
          if (!match[1].endsWith(".js")) extensionless.push(`${directory}/${file}: ${match[1]}`);
        }
      }
    }

    expect(extensionless).toEqual([]);
  });
});
