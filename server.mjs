import { accelerator } from './native/bridge.mjs';
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(root, "dist");
const fallbackRoot = path.join(root, "public");
const historyDir = process.env.APP_DATA_DIR || path.join(root, "data");
const historyPath = path.join(historyDir, "inspection-history.jsonl");
const port = Number(process.env.PORT || 4173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
  ".mjs": "text/javascript; charset=utf-8",
  ".onnx": "application/octet-stream",
  ".map": "application/json; charset=utf-8",
};

function json(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function bodyJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function hailoStatus() {
  return new Promise((resolve) => {
    execFile("hailortcli", ["fw-control", "identify"], { timeout: 3500 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ available: false, detail: stderr.trim() || "hailortcli not found" });
        return;
      }
      const device = stdout.match(/Device Architecture:\s*(.+)/i)?.[1]?.trim()
        || stdout.match(/Hailo-\w+/i)?.[0]
        || "Hailo device";
      resolve({ available: true, device, detail: stdout.trim().slice(0, 600) });
    });
  });
}

async function serveFile(res, requestPath) {
  const safe = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, "");
  const relative = safe === "/" ? "index.html" : safe.replace(/^\//, "");
  for (const base of [staticRoot, fallbackRoot]) {
    const candidate = path.join(base, relative);
    if (!candidate.startsWith(base)) continue;
    try {
      const info = await stat(candidate);
      if (!info.isFile()) continue;
      const data = await readFile(candidate);
      const ext = path.extname(candidate);
      res.writeHead(200, {
        "content-type": mime[path.extname(candidate)] || "application/octet-stream",
        "content-security-policy": "default-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; img-src 'self' data: blob:; media-src 'self' blob:",
        "cache-control": [".html", ".json", ".svg"].includes(ext) ? "no-cache" : "public, max-age=3600",
      });
      res.end(data);
      return true;
    } catch {
      // Try next root.
    }
  }
  return false;
}

await mkdir(historyDir, { recursive: true });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/accelerator/status" && req.method === "GET") {
      json(res, 200, await accelerator({action:'status'})); return;
    }
    if (url.pathname === "/api/accelerator" && req.method === "POST") {
      const data = await bodyJson(req);
      if (!['clip','prepare_siamese','siamese','prepare_references','match_references','export_references'].includes(data.action) || !['cuda','directml','migraphx','hailo10h','mps'].includes(data.backend)) {
        json(res,400,{error:'Unsupported accelerator request'}); return;
      }
      json(res,200,await accelerator(data)); return;
    }
    if (url.pathname === "/api/health") {
      json(res, 200, { ok: true, app: "inspection-offline", runtime: "node", time: new Date().toISOString() });
      return;
    }
    if (url.pathname === "/api/runtime") {
      json(res, 200, { platform: process.platform, inference: "native-gpu-npu", cpuFallback: false, hailo: await hailoStatus() });
      return;
    }
    if (url.pathname === "/api/history" && req.method === "GET") {
      let lines = [];
      try {
        lines = (await readFile(historyPath, "utf8")).trim().split("\n").filter(Boolean).slice(-100).map(JSON.parse).reverse();
      } catch {
        // Empty history is valid.
      }
      json(res, 200, lines);
      return;
    }
    if (url.pathname === "/api/history" && req.method === "POST") {
      const record = await bodyJson(req);
      record.savedAt = new Date().toISOString();
      await appendFile(historyPath, `${JSON.stringify(record)}\n`, "utf8");
      json(res, 201, { ok: true, savedAt: record.savedAt });
      return;
    }
    if (await serveFile(res, url.pathname)) return;
    if (await serveFile(res, "/index.html")) return;
    res.writeHead(404).end("Not found");
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`CLIP defect demo: http://localhost:${port}`);
});
