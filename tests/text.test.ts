import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(full)));
    else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test("the interface copy has no em dash or en dash", async () => {
  const files = [...(await filesIn(path.join(process.cwd(), "app"))), ...(await filesIn(path.join(process.cwd(), "lib")))];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.equal(text.includes("\u2014"), false, file);
    assert.equal(text.includes("\u2013"), false, file);
  }
});
