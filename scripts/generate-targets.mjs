import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public/assets/targets");
await fs.mkdir(out, { recursive: true });

const commonStart = (id, title, viewBox = "0 0 100 100") => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="${viewBox}" role="img" aria-labelledby="${id}-title">
  <title id="${id}-title">${title}</title>
  <rect width="100" height="100" fill="#fff"/>
`;
const commonEnd = `</svg>\n`;
const base = `<circle cx="50" cy="50" r="45" fill="#dbe8ed" stroke="#102a43" stroke-width="5"/>`;

const targets = [
  ["normal-clean-a", "정상 A", `${base}<circle cx="50" cy="50" r="31" fill="#eaf2f4"/><circle cx="50" cy="50" r="4" fill="#9db7c2"/>`],
  ["normal-clean-b", "정상 B", `${base}<circle cx="50" cy="50" r="34" fill="none" stroke="#b8ccd4" stroke-width="2"/><circle cx="50" cy="50" r="3" fill="#9db7c2"/>`],
  ["defect-radial-crack", "방사형 균열", `${base}<path d="M50 50 L61 42 L68 29 L78 18" fill="none" stroke="#d94b43" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M62 41 L72 48" fill="none" stroke="#d94b43" stroke-width="3"/>`],
  ["defect-edge-chip", "가장자리 깨짐", `${base}<path d="M82 19 L72 31 L88 39 L97 30 L97 8 Z" fill="#fff"/><path d="M80 18 L71 31 L88 39" fill="none" stroke="#d94b43" stroke-width="5" stroke-linecap="round"/>`],
  ["defect-scratch", "표면 긁힘", `${base}<path d="M20 67 C38 58 56 45 82 31" fill="none" stroke="#d94b43" stroke-width="5" stroke-linecap="round"/><path d="M23 74 C45 60 64 51 79 41" fill="none" stroke="#ef8b85" stroke-width="2"/>`],
  ["defect-contamination", "이물 오염", `${base}<g fill="#293a49"><circle cx="33" cy="34" r="8"/><circle cx="62" cy="59" r="11"/><circle cx="71" cy="31" r="5"/><circle cx="35" cy="69" r="4"/></g>`],
  ["defect-deformation", "형상 변형", `<ellipse cx="50" cy="50" rx="46" ry="35" fill="#dbe8ed" stroke="#d94b43" stroke-width="5"/><ellipse cx="50" cy="50" rx="31" ry="22" fill="none" stroke="#b8ccd4" stroke-width="2"/>`],
  ["defect-pinhole", "핀홀", `${base}<circle cx="59" cy="44" r="10" fill="#102a43"/><circle cx="59" cy="44" r="4" fill="#fff"/><circle cx="59" cy="44" r="13" fill="none" stroke="#d94b43" stroke-width="2"/>`],
];

for (const [id, title, content] of targets) {
  await fs.writeFile(path.join(out, `${id}.svg`), `${commonStart(id, title)}  ${content}\n${commonEnd}`, "utf8");
}

const cards = targets.map(([id, title, content], index) => {
  const x = 24 + (index % 4) * 43;
  const y = 45 + Math.floor(index / 4) * 55;
  return `<g transform="translate(${x} ${y}) scale(0.1)"><rect width="100" height="100" fill="#fff"/>${content}</g><text x="${x + 5}" y="${y + 16}" text-anchor="middle">${index + 1}. ${title}</text>`;
}).join("\n");
const sheetSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">
  <rect width="210" height="297" fill="white"/>
  <style>text{font-family:Arial,'Noto Sans KR',sans-serif;fill:#102a43;font-size:3.2px}.title{font-size:7px;font-weight:bold}.note{font-size:3.5px;fill:#526d82}</style>
  <text x="20" y="20" class="title">CLIP 양불량 판정용 10 mm 표본</text>
  <text x="20" y="28" class="note">인쇄 배율 100% · 페이지 맞춤 해제 · 출력 후 아래 50 mm 눈금으로 확인</text>
  ${cards}
  <line x1="20" y1="177" x2="70" y2="177" stroke="#102a43" stroke-width="0.5"/>
  <line x1="20" y1="174" x2="20" y2="180" stroke="#102a43" stroke-width="0.5"/>
  <line x1="70" y1="174" x2="70" y2="180" stroke="#102a43" stroke-width="0.5"/>
  <text x="45" y="185" text-anchor="middle">검증 눈금 50 mm</text>
  <text x="20" y="202" class="note">권장 촬영: 무광 용지, 균일 조명, 표본 지름이 카메라 ROI에서 180 px 이상</text>
</svg>`;
await fs.writeFile(path.join(out, "print-sheet.svg"), sheetSvg, "utf8");

const printHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>10 mm 검사 표본 인쇄</title><style>@page{size:A4;margin:0}html,body{margin:0;width:210mm;height:297mm}img{display:block;width:210mm;height:297mm}.tip{position:fixed;right:8mm;bottom:8mm;background:#071b2e;color:white;padding:3mm;font:12px sans-serif;border-radius:2mm}@media print{.tip{display:none}}</style></head><body><img src="print-sheet.svg?v=4" alt="10 mm 검사 표본 인쇄 시트"><div class="tip">인쇄 설정: 배율 100%, 페이지 맞춤 해제</div></body></html>`;
await fs.writeFile(path.join(out, "print-sheet.html"), printHtml, "utf8");

console.log(`Generated ${targets.length} targets in ${out}`);
