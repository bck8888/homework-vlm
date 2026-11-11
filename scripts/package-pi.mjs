import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "release");
const zipPath = path.join(output, "clip-defect-demo-rpi5.zip");
if (!fs.existsSync(path.join(root, "dist/index.html"))) {
  throw new Error("dist가 없습니다. npm run build를 먼저 실행하세요.");
}
fs.mkdirSync(output, { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execFileSync("/usr/bin/zip", ["-r", zipPath, "dist", "public", "data", "docs", "scripts", "native", "models", "server.mjs", "package.json", "package-lock.json", "README.md", "-x", "data/inspection-history.jsonl"], { cwd: root, stdio: "inherit" });
console.log(zipPath);
