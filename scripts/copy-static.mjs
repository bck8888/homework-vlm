import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const name of ["assets", "data"]) {
  await fs.cp(path.join(root, "public", name), path.join(root, "dist", name), { recursive: true, force: true });
}
await fs.copyFile(path.join(root, "public", "manual.html"), path.join(root, "dist", "manual.html"));
console.log("Copied static target assets and JSON database to dist");
