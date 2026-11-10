import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1));

const $ = (selector) => document.querySelector(selector);
const els = {
  camera: $("#camera"), sampleImage: $("#sampleImage"), overlay: $("#overlay"), roiPreview: $("#roiPreview"),
  cameraButton: $("#cameraButton"), analyzeButton: $("#analyzeButton"), autoToggle: $("#autoToggle"),
  cameraMessage: $("#cameraMessage"), roiSize: $("#roiSize"), contrastValue: $("#contrastValue"),
  signalLamp: $("#signalLamp"), verdictLabel: $("#verdictLabel"), verdictDetail: $("#verdictDetail"), verdictMeta: $("#verdictMeta"),
  engineSelect: $("#engineSelect"), engineBadge: $("#engineBadge"), threshold: $("#threshold"), margin: $("#margin"),
  thresholdOutput: $("#thresholdOutput"), marginOutput: $("#marginOutput"), loadModelButton: $("#loadModelButton"),
  serverStatus: $("#serverStatus"), modelStatus: $("#modelStatus"), hailoStatus: $("#hailoStatus"),
  scoreBars: $("#scoreBars"), latency: $("#latency"), sampleGrid: $("#sampleGrid"), databaseTable: $("#databaseTable"),
  historyList: $("#historyList"), downloadHistory: $("#downloadHistory"), fpsBadge: $("#fpsBadge"),
};

const state = {
  db: null,
  stream: null,
  classifier: null,
  modelLoading: false,
  analyzing: false,
  autoTimer: null,
  selectedSample: null,
  history: [],
  lastAutoKey: "",
  stableCount: 0,
  lastSavedKey: "",
  lastSavedAt: 0,
};

function status(el, text, kind = "neutral") {
  el.textContent = text;
  el.className = `status ${kind}`;
}

function setStep(current) {
  document.querySelectorAll(".pipeline-step").forEach((el) => {
    const step = Number(el.dataset.step);
    el.classList.toggle("active", step === current);
    el.classList.toggle("done", step < current);
  });
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function loadDatabase() {
  state.db = await fetch("/data/defects.json?v=2", { cache: "no-store" }).then((r) => r.json());
  els.threshold.value = state.db.decision.defectThreshold;
  els.margin.value = state.db.decision.normalMargin;
  updateSettingOutputs();
  renderSamples();
  renderDatabase();
}

function renderSamples() {
  els.sampleGrid.innerHTML = "";
  for (const item of state.db.classes) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "sample-card";
    card.dataset.id = item.id;
    card.innerHTML = `<img src="${item.asset}" alt="${item.labelKo}"><strong>${item.labelKo}</strong><small>${item.group === "normal" ? "정상" : "불량"}</small>`;
    card.addEventListener("click", () => selectSample(item, card));
    els.sampleGrid.append(card);
  }
}

function renderDatabase() {
  els.databaseTable.innerHTML = state.db.classes.map((item) => `
    <div class="db-row ${item.group}">
      <span class="kind">${item.group === "normal" ? "NORMAL" : "DEFECT"}</span>
      <strong>${item.labelKo}</strong>
      <div><span>${item.descriptionKo}</span><br><code>${item.prompt}</code></div>
    </div>`).join("");
}

async function selectSample(item, card) {
  stopCamera();
  state.selectedSample = item;
  document.querySelectorAll(".sample-card").forEach((el) => el.classList.toggle("selected", el === card));
  els.sampleImage.hidden = false;
  els.camera.hidden = true;
  els.sampleImage.src = item.asset;
  await els.sampleImage.decode();
  els.cameraMessage.textContent = `${item.labelKo} 표본 선택 · 판정 버튼을 누르세요`;
  els.fpsBadge.textContent = "표본 이미지";
  resetDecision();
}

async function startCamera() {
  if (state.stream) { stopCamera(); return; }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: "environment" } },
      audio: false,
    });
    els.camera.srcObject = state.stream;
    els.camera.hidden = false;
    els.sampleImage.hidden = true;
    state.selectedSample = null;
    await els.camera.play();
    els.cameraButton.textContent = "카메라 중지";
    els.cameraMessage.textContent = "표본을 중앙 안내 영역에 맞추세요";
    els.fpsBadge.textContent = `${els.camera.videoWidth}×${els.camera.videoHeight}`;
    document.querySelectorAll(".sample-card").forEach((el) => el.classList.remove("selected"));
    resetDecision();
  } catch (error) {
    els.cameraMessage.textContent = `카메라 오류: ${error.message}`;
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  els.camera.srcObject = null;
  els.cameraButton.textContent = "카메라 시작";
  if (!state.selectedSample) els.fpsBadge.textContent = "대기";
}

function resetDecision() {
  els.signalLamp.className = "signal-lamp idle";
  els.verdictLabel.textContent = "판정 대기";
  els.verdictDetail.textContent = "현재 화면 판정을 실행하세요";
  els.verdictMeta.textContent = "판정 결과는 설명 후보 간 상대 점수입니다.";
  els.scoreBars.innerHTML = '<p class="empty">판정 후 설명별 점수가 표시됩니다.</p>';
  els.latency.textContent = "— ms";
  setStep(1);
}

function updateSettingOutputs() {
  els.thresholdOutput.value = Number(els.threshold.value).toFixed(2);
  els.marginOutput.value = Number(els.margin.value).toFixed(2);
}

async function loadModel() {
  if (state.classifier || state.modelLoading) return;
  state.modelLoading = true;
  status(els.modelStatus, "CLIP 로딩 중", "warn");
  els.loadModelButton.disabled = true;
  els.loadModelButton.textContent = "모델 내려받는 중…";
  try {
    state.classifier = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", {
      dtype: "q8",
      progress_callback: (progress) => {
        if (progress.status === "progress") {
          const pct = Math.round(progress.progress || 0);
          els.loadModelButton.textContent = `모델 로딩 ${pct}%`;
        }
      },
    });
    status(els.modelStatus, "CLIP 준비됨", "ok");
    els.loadModelButton.textContent = "CLIP 모델 준비 완료";
  } catch (error) {
    status(els.modelStatus, "CLIP 로드 실패", "bad");
    els.loadModelButton.disabled = false;
    els.loadModelButton.textContent = "CLIP 모델 다시 로드";
    throw error;
  } finally {
    state.modelLoading = false;
  }
}

function sourceToCanvas() {
  const source = state.stream ? els.camera : els.sampleImage.hidden ? null : els.sampleImage;
  if (!source) throw new Error("카메라 또는 표본 이미지를 준비하세요.");
  const width = state.stream ? source.videoWidth : 512;
  const height = state.stream ? source.videoHeight : 512;
  if (!width || !height) throw new Error("영상이 아직 준비되지 않았습니다.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (state.stream) {
    ctx.drawImage(source, 0, 0, width, height);
  } else {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 128, 128, 256, 256);
  }
  return canvas;
}

function detectTarget(source) {
  const ctx = source.getContext("2d", { willReadFrequently: true });
  const w = source.width;
  const h = source.height;
  const side = Math.floor(Math.min(w, h) * 0.68);
  const scanX = Math.floor((w - side) / 2);
  const scanY = Math.floor((h - side) / 2);
  const image = ctx.getImageData(scanX, scanY, side, side);
  let minX = side, minY = side, maxX = 0, maxY = 0, count = 0, sum = 0, sumSq = 0;
  const stride = side > 700 ? 3 : 2;
  for (let y = 0; y < side; y += stride) {
    for (let x = 0; x < side; x += stride) {
      const i = (y * side + x) * 4;
      const lum = image.data[i] * .2126 + image.data[i + 1] * .7152 + image.data[i + 2] * .0722;
      sum += lum; sumSq += lum * lum; count++;
      if (lum < 205) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    }
  }
  const mean = sum / count;
  const contrast = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  let bboxW = maxX - minX;
  let bboxH = maxY - minY;
  const detected = bboxW > side * .12 && bboxH > side * .12 && bboxW < side * .96 && bboxH < side * .96;
  if (!detected) {
    minX = side * .17; minY = side * .17; bboxW = side * .66; bboxH = side * .66;
  }
  const cropSide = Math.min(side, Math.max(bboxW, bboxH) * 1.28);
  const centerX = scanX + minX + bboxW / 2;
  const centerY = scanY + minY + bboxH / 2;
  const x = Math.max(0, Math.min(w - cropSide, centerX - cropSide / 2));
  const y = Math.max(0, Math.min(h - cropSide, centerY - cropSide / 2));
  return { x, y, size: cropSide, diameterPx: Math.round(Math.max(bboxW, bboxH)), contrast: Math.round(contrast), detected };
}

function drawRoi(source, roi) {
  const pctx = els.roiPreview.getContext("2d");
  pctx.clearRect(0, 0, 224, 224);
  pctx.fillStyle = "white"; pctx.fillRect(0, 0, 224, 224);
  pctx.drawImage(source, roi.x, roi.y, roi.size, roi.size, 0, 0, 224, 224);

  els.overlay.width = source.width;
  els.overlay.height = source.height;
  const octx = els.overlay.getContext("2d");
  octx.clearRect(0, 0, source.width, source.height);
  octx.strokeStyle = roi.detected ? "#2fd27d" : "#ffb326";
  octx.lineWidth = Math.max(3, source.width / 320);
  octx.strokeRect(roi.x, roi.y, roi.size, roi.size);
  els.roiSize.textContent = `${roi.diameterPx}px ${roi.diameterPx >= state.db.product.minimumRoiDiameterPx ? "✓" : "· 가까이 이동"}`;
  els.contrastValue.textContent = `${roi.contrast} ${roi.contrast >= 20 ? "✓" : "· 조명 확인"}`;
}

function rehearsalScores(expectedId) {
  const seed = [...(expectedId || "unknown")].reduce((a, c) => a + c.charCodeAt(0), 0);
  const raw = state.db.classes.map((item, index) => {
    if (item.id === expectedId) return .68;
    const sameGroup = state.db.classes.find((c) => c.id === expectedId)?.group === item.group;
    return (sameGroup ? .055 : .025) + ((seed * (index + 5)) % 13) / 1000;
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return state.db.classes.map((item, index) => ({ item, score: raw[index] / total }));
}

async function clipScores() {
  if (!state.classifier) await loadModel();
  const prompts = state.db.classes.map((item) => item.prompt);
  const imageUrl = els.roiPreview.toDataURL("image/jpeg", .92);
  const output = await state.classifier(imageUrl, prompts);
  const byPrompt = new Map(output.map((row) => [row.label, row.score]));
  return state.db.classes.map((item) => ({ item, score: byPrompt.get(item.prompt) || 0 })).sort((a, b) => b.score - a.score);
}

function decide(scores) {
  const bestNormal = scores.filter((x) => x.item.group === "normal").sort((a, b) => b.score - a.score)[0];
  const bestDefect = scores.filter((x) => x.item.group === "defect").sort((a, b) => b.score - a.score)[0];
  const threshold = Number(els.threshold.value);
  const margin = Number(els.margin.value);
  if (bestDefect.score >= threshold && bestDefect.score - bestNormal.score >= margin) {
    return { status: "defect", best: bestDefect, bestNormal, reason: "불량 점수가 임계값과 정상 대비 여유값을 통과" };
  }
  if (bestNormal.score >= bestDefect.score) {
    return { status: "normal", best: bestNormal, bestNormal, reason: "정상 설명 점수가 가장 높음" };
  }
  return { status: "review", best: bestDefect, bestNormal, reason: "불량 후보가 있으나 판정 조건이 부족함" };
}

function renderScores(scores) {
  els.scoreBars.innerHTML = scores.slice(0, 8).map(({ item, score }) => `
    <div class="score-row ${item.group}">
      <label title="${item.descriptionKo}">${item.labelKo}</label>
      <div class="score-track"><div class="score-fill" style="width:${Math.max(1, score * 100)}%"></div></div>
      <output>${score.toFixed(3)}</output>
    </div>`).join("");
}

function renderDecision(result, elapsed, stableText = "") {
  els.signalLamp.className = `signal-lamp ${result.status}`;
  const names = { defect: "불량", normal: "정상", review: "확인 필요" };
  els.verdictLabel.textContent = names[result.status];
  els.verdictDetail.textContent = result.best.item.labelKo;
  els.verdictMeta.textContent = `${result.reason} · ${result.best.score.toFixed(3)}${stableText}`;
  els.latency.textContent = `${elapsed} ms`;
}

async function saveDefect(result, roi, mode) {
  const now = Date.now();
  const key = result.best.item.id;
  if (state.lastSavedKey === key && now - state.lastSavedAt < 5000) return;
  const record = {
    verdict: "defect",
    defectId: key,
    labelKo: result.best.item.labelKo,
    score: Number(result.best.score.toFixed(6)),
    normalScore: Number(result.bestNormal.score.toFixed(6)),
    threshold: Number(els.threshold.value),
    margin: Number(els.margin.value),
    engine: mode,
    roi: { diameterPx: roi.diameterPx, contrast: roi.contrast },
    thumbnail: els.roiPreview.toDataURL("image/jpeg", .56),
  };
  const response = await fetch("/api/history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record) });
  if (!response.ok) throw new Error("판정 이력 저장 실패");
  state.lastSavedKey = key; state.lastSavedAt = now;
  await loadHistory();
}

async function analyze({ auto = false } = {}) {
  if (state.analyzing) return;
  state.analyzing = true;
  try {
    setStep(1);
    const source = sourceToCanvas();
    const roi = detectTarget(source);
    drawRoi(source, roi);
    await sleep(120);
    setStep(2);
    const started = performance.now();
    const mode = els.engineSelect.value;
    if (mode === "rehearsal" && !state.selectedSample) throw new Error("리허설 모드는 아래 표본을 먼저 선택하세요.");
    const scores = mode === "rehearsal" ? rehearsalScores(state.selectedSample?.id).sort((a, b) => b.score - a.score) : await clipScores();
    setStep(3);
    renderScores(scores);
    const result = decide(scores);
    const key = `${result.status}:${result.best.item.id}`;
    if (auto) {
      state.stableCount = key === state.lastAutoKey ? state.stableCount + 1 : 1;
      state.lastAutoKey = key;
    } else {
      state.stableCount = state.db.decision.stableFrames;
    }
    const stable = state.stableCount >= state.db.decision.stableFrames;
    renderDecision(result, Math.round(performance.now() - started), auto ? ` · ${state.stableCount}/${state.db.decision.stableFrames} 프레임` : "");
    if (stable) {
      setStep(4);
      if (result.status === "defect") await saveDefect(result, roi, mode);
    }
  } catch (error) {
    els.signalLamp.className = "signal-lamp review";
    els.verdictLabel.textContent = "실행 오류";
    els.verdictDetail.textContent = error.message;
    els.verdictMeta.textContent = "카메라, 모델 또는 네트워크 상태를 확인하세요.";
  } finally {
    state.analyzing = false;
  }
}

function updateAuto() {
  clearInterval(state.autoTimer);
  state.autoTimer = null;
  if (els.autoToggle.checked) {
    state.autoTimer = setInterval(() => analyze({ auto: true }), state.db.decision.analysisIntervalMs);
  }
}

async function loadHistory() {
  try { state.history = await fetch("/api/history").then((r) => r.json()); } catch { state.history = []; }
  if (!state.history.length) { els.historyList.innerHTML = '<p class="empty">저장된 불량 판정이 없습니다.</p>'; return; }
  els.historyList.innerHTML = state.history.map((item) => `
    <div class="history-item defect"><i></i><div><strong>${item.labelKo}</strong><small>${new Date(item.savedAt).toLocaleString("ko-KR")} · ${item.engine}</small></div><output>${Number(item.score).toFixed(3)}</output></div>`).join("");
}

function downloadHistory() {
  const blob = new Blob([JSON.stringify(state.history, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `defect-history-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  URL.revokeObjectURL(a.href);
}

async function checkRuntime() {
  try {
    const health = await fetch("/api/health").then((r) => r.json());
    status(els.serverStatus, health.ok ? "저장 서버 연결" : "서버 오류", health.ok ? "ok" : "bad");
    const runtime = await fetch("/api/runtime").then((r) => r.json());
    status(els.hailoStatus, runtime.hailo.available ? `${runtime.hailo.device} 감지` : "Hailo 미감지", runtime.hailo.available ? "ok" : "warn");
  } catch {
    status(els.serverStatus, "정적 모드", "warn"); status(els.hailoStatus, "확인 불가", "warn");
  }
}

els.cameraButton.addEventListener("click", startCamera);
els.analyzeButton.addEventListener("click", () => analyze());
els.autoToggle.addEventListener("change", updateAuto);
els.loadModelButton.addEventListener("click", () => loadModel().catch(() => {}));
els.engineSelect.addEventListener("change", () => { els.engineBadge.textContent = els.engineSelect.value === "clip" ? "CLIP" : "REHEARSAL"; resetDecision(); });
els.threshold.addEventListener("input", updateSettingOutputs);
els.margin.addEventListener("input", updateSettingOutputs);
els.downloadHistory.addEventListener("click", downloadHistory);
window.addEventListener("beforeunload", stopCamera);

await Promise.all([loadDatabase(), loadHistory(), checkRuntime()]);
