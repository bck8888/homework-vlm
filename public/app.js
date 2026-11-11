import { LineTracker, InspectionQueue } from './inspection-queue.js';
import { targetBounds } from './target-region.js';
import { decideReference } from './reference-decision.js';
import { PassageCounter } from './counting.js';
import { pixels, trainSiamese } from './siamese.js';
let siamese = null;
let siameseTraining = false;

function prepareSiamese(canvas) {
  const roi = detectTarget(canvas);
  const crop = document.createElement('canvas'); crop.width = crop.height = 224;
  crop.getContext('2d').drawImage(canvas, roi.x, roi.y, roi.size, roi.size, 0, 0, 224, 224);
  return crop;
}

async function trainSharedEncoder() {
  if (siameseTraining) return;
  siameseTraining = true;
  const button = document.querySelector('#trainSiamese');
  const progress = document.querySelector('#siameseProgress');
  button.disabled = true;
  try {
    siamese = await trainSiamese(state.db.classes, prepareSiamese, (epoch, loss) => {
      progress.textContent = `실제 쌍 학습 ${epoch}/80 · contrastive loss ${loss.toFixed(4)}`;
    });
    await nativeRequest('prepare_siamese', {
      weights:Array.from(siamese.model.w),bias:Array.from(siamese.model.b),references:siamese.references.map(r=>Array.from(r.vector))
    });
    const { before, after } = siamese;
    progress.textContent = `학습 완료 · 양성 거리 ${before.positive.toFixed(3)} → ${after.positive.toFixed(3)} / 음성 거리 ${before.negative.toFixed(3)} → ${after.negative.toFixed(3)}. 합성 변형 내부 점검이며 실제 카메라 정확도는 별도 검증이 필요합니다.`;
  } catch (error) { siamese = null; progress.textContent = `학습 실패: ${error.message}`; }
  finally { button.disabled = false; siameseTraining = false; }
}

async function siameseScores() {
  if (!siamese || siameseTraining) throw new Error('Siamese 모델 준비를 먼저 완료하세요.');
  const output = await nativeRequest('siamese',{pixels:Array.from(pixels(els.roiPreview))});
  return siamese.references.map(({item},index)=>({item,score:output.scores[index]})).sort((a,b)=>b.score-a.score);
}

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
  videoInput: false,
  counter: null,
  videoTimer: null,
  videoBusy: false,
  runVersion: 0,
  queue: null,
  frameHandle: null,
  inputEnded: false,
  skipped: [],
  processedFrames: 0,
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
  stopCamera();
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
  state.runVersion++;
  state.queue?.cancel(); state.queue=null;
  if(state.frameHandle!==null){
    if(els.camera.cancelVideoFrameCallback)els.camera.cancelVideoFrameCallback(state.frameHandle);
    else cancelAnimationFrame(state.frameHandle);
  }
  state.frameHandle=null;
  for(const id of ['engineSelect','acceleratorSelect','buildReferenceDB','trainSiamese','analyzeButton','autoToggle','threshold','margin','referenceMinimum','referenceMargin']) $('#'+id).disabled=false;
  clearInterval(state.videoTimer);
  state.videoTimer = null;
  state.videoInput = false;
  els.camera.pause();
  els.camera.removeAttribute("src");
  $("#videoPause").disabled = true;
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

async function nativeRequest(action, extra = {}) {
  const requestVersion=state.runVersion;
  const response = await fetch('/api/accelerator', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,backend:$('#acceleratorSelect').value,...extra})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '가속기 실행 실패');
  if (data.provider && requestVersion===state.runVersion) {
  state.lastInference = {provider:data.provider,model:data.model,backend:$('#acceleratorSelect').value,cpuFallback:data.cpuFallback};
  status(els.modelStatus, 'GPU/NPU 추론 확인', 'ok');
  $('#acceleratorStatus').textContent = `${data.provider} · ${data.model} · CPU 대체 없음`;
  }
  return data;
}

async function loadModel() {
  const response = await fetch('/api/accelerator/status');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '가속기 확인 실패');
  const backend = $('#acceleratorSelect').value;
  const names = {cuda:'CUDAExecutionProvider',directml:'DmlExecutionProvider'};
  if (backend === 'mps' ? !data.appleMPSAvailable : backend === 'hailo10h' ? !data.hailoRuntimeInstalled : !data.providers.includes(names[backend])) {
    status(els.modelStatus,'가속기 준비 안 됨','bad');
    throw new Error('선택한 GPU/NPU 실행 환경이 없습니다. CPU로 대체하지 않습니다.');
  }
  status(els.modelStatus,'런타임 확인 · 추론 미검증','warn');
  $('#acceleratorStatus').textContent = '런타임 설치 확인됨. 실제 판정 성공 후 사용 장치를 표시합니다.';
}

function sourceToCanvas() {
  const moving = state.stream || state.videoInput;
  const source = moving ? els.camera : els.sampleImage.hidden ? null : els.sampleImage;
  if (!source) throw new Error("카메라 또는 표본 이미지를 준비하세요.");
  const width = moving ? source.videoWidth : 512;
  const height = moving ? source.videoHeight : 512;
  if (!width || !height) throw new Error("영상이 아직 준비되지 않았습니다.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (moving) {
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
  const component = targetBounds(image.data, side, stride);
  if (component) ({minX,minY,maxX,maxY} = component);
  else {minX=side;minY=side;maxX=maxY=0;}
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
  return { x, y, centerX, size: cropSide, diameterPx: Math.round(Math.max(bboxW, bboxH)), contrast: Math.round(contrast), detected };
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

async function referenceScores() {
  const output = await nativeRequest('match_references',{image:els.roiPreview.toDataURL('image/png'),classes:state.db.classes});
  $('#referenceStatus').textContent = `저장된 기준 DB 사용 · ${output.referenceCreatedAt} · 코사인 유사도`;
  return state.db.classes.map((item,index)=>({item,score:output.scores[index]})).sort((a,b)=>b.score-a.score);
}

async function buildReferenceDB() {
  if (state.analyzing || state.videoBusy) return;
  const button=$('#buildReferenceDB');button.disabled=true;
  stopCamera();button.disabled=true;els.autoToggle.checked=false;updateAuto();
  $('#referenceStatus').textContent='8개 기준 이미지를 인코딩하고 JSON DB에 저장 중…';
  try {
    const references=[];
    for(const item of state.db.classes) {
      const img=new Image();img.src=item.asset;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,512,512);ctx.drawImage(img,128,128,256,256);
      references.push({id:item.id,labelKo:item.labelKo,group:item.group,image:prepareSiamese(canvas).toDataURL('image/png')});
    }
    const output=await nativeRequest('prepare_references',{references});
    $('#referenceStatus').textContent=`JSON DB 저장 완료 · ${output.count}개 · ${output.provider}`;
  } catch(error) { $('#referenceStatus').textContent=`DB 생성 실패: ${error.message}`; }
  finally {button.disabled=false;}
}
$('#buildReferenceDB').addEventListener('click',buildReferenceDB);
$('#exportReferenceDB').addEventListener('click',async()=>{
 try {
  const db=await nativeRequest('export_references');
  const url=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='reference-embeddings.json';a.click();URL.revokeObjectURL(url);
 } catch(error){$('#referenceStatus').textContent=error.message;}
});

async function clipScores() {
  const output = await nativeRequest('clip',{image:els.roiPreview.toDataURL('image/png'),classes:state.db.classes});
  return state.db.classes.map((item,index)=>({item,score:output.scores[index]})).sort((a,b)=>b.score-a.score);
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

async function saveDefect(result, roi, mode, capture = null) {
  const now = Date.now();
  const key = result.best.item.id;
  if (!capture && state.lastSavedKey === key && now - state.lastSavedAt < 5000) return;
  const record = {
    verdict: "defect",
    capture,
    defectId: key,
    labelKo: result.best.item.labelKo,
    score: Number(result.best.score.toFixed(6)),
    normalScore: Number(result.bestNormal.score.toFixed(6)),
    metric: mode === 'clip-reference' ? 'cosine' : 'relative-score',
    threshold: Number(mode === 'clip-reference' ? $('#referenceMinimum').value : els.threshold.value),
    margin: Number(mode === 'clip-reference' ? $('#referenceMargin').value : els.margin.value),
    engine: mode,
    inference: state.lastInference,
    roi: { diameterPx: roi.diameterPx, contrast: roi.contrast },
    thumbnail: els.roiPreview.toDataURL("image/jpeg", .56),
  };
  const response = await fetch("/api/history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record) });
  if (!response.ok) throw new Error("판정 이력 저장 실패");
  state.lastSavedKey = key; state.lastSavedAt = now;
  await loadHistory();
}

async function analyze({ auto = false, source: captured = null, capture = null, runVersion = state.runVersion } = {}) {
  if (state.analyzing) return;
  state.analyzing = true;
  try {
    setStep(1);
    const source = captured || sourceToCanvas();
    const roi = detectTarget(source);
    drawRoi(source, roi);
    setStep(2);
    const started = performance.now();
    const mode = els.engineSelect.value;
    if (mode === "rehearsal" && !state.selectedSample) throw new Error("리허설 모드는 아래 표본을 먼저 선택하세요.");
    const scores = mode === "rehearsal" ? rehearsalScores(state.selectedSample?.id).sort((a, b) => b.score - a.score) : mode === 'siamese' ? await siameseScores() : mode === 'clip-reference' ? await referenceScores() : await clipScores();
    if(runVersion !== state.runVersion) return null;
    setStep(3);
    renderScores(scores);
    const decision = mode === 'clip-reference' ? decideReference(scores,Number($('#referenceMinimum').value),Number($('#referenceMargin').value)) : decide(scores);
    const result = {...decision, inference:state.lastInference, capture};
    const key = `${result.status}:${result.best.item.id}`;
    if (auto) {
      state.stableCount = key === state.lastAutoKey ? state.stableCount + 1 : 1;
      state.lastAutoKey = key;
    } else {
      state.stableCount = state.db.decision.stableFrames;
    }
    const stable = state.stableCount >= state.db.decision.stableFrames;
    renderDecision(result, Math.round(performance.now() - started), capture ? ` · 표본 #${capture.trackId} · 촬영 ${capture.videoTime.toFixed(2)}초` : auto ? ` · ${state.stableCount}/${state.db.decision.stableFrames} 프레임` : "");
    if (stable) {
      setStep(4);
      if (result.status === "defect") await saveDefect(result, roi, mode, capture);
    }
    return result;
  } catch (error) {
    if(runVersion !== state.runVersion) return null;
    if(capture) throw error;
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
    if(runtime.platform && runtime.platform !== 'darwin' && $('#acceleratorSelect').value === 'mps') $('#acceleratorSelect').value = runtime.platform === 'linux' ? 'hailo10h' : 'directml';
    status(els.hailoStatus, runtime.hailo.available ? `${runtime.hailo.device} 감지` : "Hailo 미감지", runtime.hailo.available ? "ok" : "warn");
  } catch {
    status(els.serverStatus, "정적 모드", "warn"); status(els.hailoStatus, "확인 불가", "warn");
  }
}

els.cameraButton.addEventListener("click", startCamera);
els.analyzeButton.addEventListener("click", () => analyze());
els.autoToggle.addEventListener("change", updateAuto);
els.loadModelButton.addEventListener("click", () => loadModel().catch(error => { $("#acceleratorStatus").textContent = error.message; }));
document.querySelector('#trainSiamese').addEventListener('click', trainSharedEncoder);
els.engineSelect.addEventListener("change", () => {
  stopCamera();
  els.autoToggle.checked = false; updateAuto();
  const mode = els.engineSelect.value;
  els.engineBadge.textContent = mode === 'clip-reference' ? 'CLIP 이미지 DB' : mode === 'clip' ? 'CLIP' : mode === 'siamese' ? 'SIAMESE' : 'REHEARSAL';
  document.querySelector('.vector-flow').textContent = mode === 'clip-reference' ? 'ROI · CLIP 이미지 인코더 · 저장된 기준 이미지 벡터 · 코사인 유사도' : mode === 'siamese' ? 'ROI · 공유 인코더 f · 기준 이미지 벡터 · 거리 기반 상대 점수' : 'ROI · CLIP · 설명 벡터 · 상대 점수';
  resetDecision();
});
els.threshold.addEventListener("input", updateSettingOutputs);
els.margin.addEventListener("input", updateSettingOutputs);
els.downloadHistory.addEventListener("click", downloadHistory);
window.addEventListener("beforeunload", stopCamera);

function renderCount(complete = false) {
  if (!state.counter) return;
  const report = state.counter.report(state.db.classes, complete);
  report.pending = state.queue?.pending || 0;
  report.unprocessed = state.skipped;
  report.processedFrames = state.processedFrames;
  report.detectedPassages = report.actualTotal + report.pending + state.skipped.length;
  report.countMatch = report.countMatch && !state.skipped.length;
  $('#queueStatus').textContent = `감지된 통과 ${report.detectedPassages} · 판정 완료 ${report.actualTotal} · 대기/처리 중 ${report.pending} · 미처리/오류 ${state.skipped.length} · 검사 프레임 ${state.processedFrames}`;
  localStorage.setItem('inspection-last-run', JSON.stringify(report));
  $('#countSummary').textContent = `${complete ? '완료' : '진행 중'} · 통과 ${report.actualTotal}/32 · 확인 필요 ${report.review} · ${complete ? (report.countMatch ? '개수 일치 (정확도 검증과 별개)' : '개수 불일치 — 결과 확인 필요') : '각 종류 정답 4개'}`;
  $('#countRows').textContent = report.counts.map(c => `${c.label}: ${c.actual}/4`).join('  ·  ');
}

async function startVideo() {
  const button = $('#videoStart'); button.disabled = true;
  try {
    stopCamera(); els.autoToggle.checked = false; updateAuto();
    if (els.engineSelect.value === 'rehearsal') throw new Error('영상 검사는 CLIP 또는 Siamese를 선택하세요.');
    if (els.engineSelect.value === 'siamese' && !siamese) await trainSharedEncoder();
    if (els.engineSelect.value === 'siamese' && !siamese) throw new Error('Siamese 학습을 완료하지 못했습니다.');
    if (els.engineSelect.value.startsWith('clip')) await loadModel();
    // Wait for a previous cancelled inference to finish before starting a new queue.
    if(state.analyzing) throw new Error('이전 판정이 끝난 뒤 다시 시작하세요.');
    const runVersion=state.runVersion;
    state.selectedSample=null;state.counter=new PassageCounter();state.skipped=[];state.inputEnded=false;state.processedFrames=0;
    const tracker=new LineTracker();
    const update=()=>{
      if(runVersion!==state.runVersion)return;
      const complete=state.inputEnded && state.queue.pending===0;
      renderCount(complete);
      if(complete){
        els.cameraMessage.textContent='영상 및 대기 중 판정 완료';
        for(const id of ['engineSelect','acceleratorSelect','buildReferenceDB','trainSiamese','analyzeButton','autoToggle','threshold','margin','referenceMinimum','referenceMargin']) $('#'+id).disabled=false;
      }
    };
    state.queue=new InspectionQueue({
      worker:async item=>{
        const result=await analyze({source:item.source,capture:{trackId:item.trackId,videoTime:item.videoTime},runVersion});
        if(!result)throw new Error('판정 결과 없음');return result;
      },
      onResult:(item,result)=>state.counter.add(result,item.videoTime),
      onError:(item,error)=>state.skipped.push({trackId:item.trackId,videoTime:item.videoTime,reason:error.message}),
      onDrop:item=>state.skipped.push({trackId:item.trackId,videoTime:item.videoTime,reason:'대기열 한도 16개 초과'}),
      onChange:update,limit:16
    });
    els.camera.srcObject=null;els.camera.src='/assets/videos/inspection-conveyor-random-4x.mp4';
    els.camera.loop=false;els.camera.hidden=false;els.sampleImage.hidden=true;state.videoInput=true;
    for(const id of ['engineSelect','acceleratorSelect','buildReferenceDB','trainSiamese','analyzeButton','autoToggle','threshold','margin','referenceMinimum','referenceMargin']) $('#'+id).disabled=true;
    let lastTime=-1;
    const frame=(now,metadata)=>{
      if(runVersion!==state.runVersion||!state.videoInput||state.inputEnded)return;
      const time=metadata?.mediaTime ?? els.camera.currentTime;
      if(!els.camera.paused&&time!==lastTime){
        lastTime=time;state.processedFrames++;
        const source=sourceToCanvas(),roi=detectTarget(source);
        const passage=tracker.observe(roi,source.width,time);
        if(passage)state.queue.enqueue({...passage,source});
      }
      schedule();
    };
    const schedule=()=>{
      state.frameHandle=els.camera.requestVideoFrameCallback ? els.camera.requestVideoFrameCallback(frame) : requestAnimationFrame(frame);
    };
    els.camera.playbackRate=Number($('#videoSpeed').value);
    schedule();await els.camera.play();
    $('#videoPause').disabled=false;$('#videoPause').textContent='영상 일시정지';
    els.fpsBadge.textContent='연속 재생 · 비동기 판정';
    els.cameraMessage.textContent='영상은 계속 재생 · 중앙 통과 이미지만 복사 · 결과는 표본 ID로 표시';
    resetDecision();update();
  } catch (error) { els.cameraMessage.textContent = `영상 오류: ${error.message}`; }
  finally { button.disabled = false; }
}
$('#acceleratorSelect').addEventListener('change', () => {
  stopCamera(); siamese = null; els.autoToggle.checked = false; updateAuto(); resetDecision();
  $('#acceleratorStatus').textContent = '선택한 가속기에서 아직 추론하지 않았습니다.';
});
function setVideoSpeed(value) {
  const rate=Math.min(4,Math.max(.25,Number(value)||1));
  $('#videoSpeed').value=String(rate);
  $('#videoSpeedOutput').value=`${rate}×`;
  document.querySelectorAll('.speed-preset').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.speed)===rate)));
  if(state.videoInput)els.camera.playbackRate=rate;
}
$('#videoSpeed').addEventListener('input',event=>setVideoSpeed(event.target.value));
document.querySelectorAll('.speed-preset').forEach(button=>button.addEventListener('click',()=>setVideoSpeed(button.dataset.speed)));
$('#videoStart').addEventListener('click', startVideo);
$('#videoPause').addEventListener('click', async () => {
  if (els.camera.paused) { await els.camera.play(); $('#videoPause').textContent = '영상 일시정지'; }
  else { els.camera.pause(); $('#videoPause').textContent = '영상 계속 재생'; }
});
els.camera.addEventListener('ended', () => {
  if (!state.videoInput) return;
  state.inputEnded=true;
  if(state.queue?.pending===0)for(const id of ['engineSelect','acceleratorSelect','buildReferenceDB','trainSiamese','analyzeButton','autoToggle','threshold','margin','referenceMinimum','referenceMargin']) $('#'+id).disabled=false;
  renderCount(state.queue?.pending===0);
  els.cameraMessage.textContent=state.queue?.pending ? "영상 종료 · 남은 판정 처리 중" : "영상 및 판정 완료";
  $('#videoPause').disabled = true;
});
$('#downloadCount').addEventListener('click', () => {
  const text = localStorage.getItem('inspection-last-run');
  if (!text) return;
  const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'inspection-counts.json'; a.click(); URL.revokeObjectURL(url);
});

await Promise.all([loadDatabase(), loadHistory(), checkRuntime()]);
