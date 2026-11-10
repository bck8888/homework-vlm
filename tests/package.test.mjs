import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = JSON.parse(await fs.readFile(path.join(root, "public/data/defects.json"), "utf8"));

test("database contains two normal and six defect classes", () => {
  assert.equal(db.classes.length, 8);
  assert.equal(db.classes.filter((item) => item.group === "normal").length, 2);
  assert.equal(db.classes.filter((item) => item.group === "defect").length, 6);
});

test("each class has a 10 mm printable SVG", async () => {
  for (const item of db.classes) {
    const svg = await fs.readFile(path.join(root, "public", item.asset), "utf8");
    assert.match(svg, /width="10mm" height="10mm"/);
    assert.ok(item.prompt.length > 30);
  }
});

test("print sheet includes a 50 mm verification scale", async () => {
  const sheet = await fs.readFile(path.join(root, "public/assets/targets/print-sheet.svg"), "utf8");
  assert.match(sheet, /검증 눈금 50 mm/);
  assert.match(sheet, /x1="20" y1="177" x2="70"/);
});
