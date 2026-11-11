# GPU/NPU 장비 검증 브랜치

추가: 기준 이미지 8개의 CLIP 벡터 JSON DB 매칭, 글자 제외 표본 검출, 영상 연속 재생과 비동기 추론 대기열, 표본 ID별 결과·누락 기록. 기본 기준 DB는 포함되어 있고 이미지 전용 모델은 설치 시 추출합니다.

현재 변경의 설치·실행 방법은 [ACCELERATOR-SETUP.md](docs/ACCELERATOR-SETUP.md)를 먼저 보세요. AMD DirectML / NVIDIA CUDA / Hailo-10H 어댑터를 추가했으며 실기 검증은 아직 완료되지 않았습니다. Hailo용 Siamese는 미완료입니다. 아래 기존 안내의 브라우저 CPU 실행 및 과거 패키지는 이전 버전 설명입니다.

# CLIP 양불량 판정 로컬 시연

## Siamese 시연

실행 엔진에서 `Siamese · 기준 이미지 쌍 비교`를 선택한 다음 `Siamese 쌍 학습 시작`을 누릅니다. 학습이 완료되면 표본 또는 카메라 입력으로 `현재 화면 판정`을 실행합니다. 신호등과 불량 저장은 CLIP과 동일한 흐름입니다.

모델은 16×16 흑백 입력을 32차원 tanh 표현으로 변환하는 공유 인코더입니다. 8개 표본의 크기·회전 변형 쌍을 80 epoch 동안 contrastive loss로 학습합니다. 정상 A와 B는 같은 정상 클래스로 학습합니다. 설명 텍스트는 결과 표시용이며, Siamese 추론은 입력 이미지와 기준 이미지의 벡터 거리를 비교합니다. 점수는 exp(-8×거리)를 후보 전체에서 정규화한 값이며 CLIP 점수와 직접 비교하거나 확률로 해석할 수 없습니다. 임계값은 엔진별로 교정해야 합니다.

학습은 브라우저 메모리에서 실행되며 새로고침하면 다시 학습해야 합니다. 표시하는 학습 전후 거리는 같은 원본의 합성 변형에 대한 내부 점검입니다. 생산 데이터나 실제 카메라의 일반화 성능을 입증하지 않습니다. Hailo 가속은 사용하지 않습니다.

카메라에서 10 mm 원형 표본을 촬영하고, CLIP 이미지 표현과 정상·불량 설명을 비교해 판정 과정을 단계별로 보여주는 로컬 웹 앱입니다.

## 포함된 기능

- 10 mm SVG 검사 표본 8개: 정상 2개, 서로 다른 불량 6개
- A4 인쇄 시트와 50 mm 검증 눈금
- USB 웹캠 및 브라우저에서 접근 가능한 Raspberry Pi Camera 입력
- 중앙 ROI 검출, 대비와 픽셀 크기 확인
- CLIP ViT-B/32 ONNX/WASM zero-shot 비교
- 정상·불량 설명 JSON DB
- 설명별 상대 점수, 가상 신호등, 단계별 처리 상태
- 불량 판정만 `data/inspection-history.jsonl`에 저장
- 모델이 없어도 UI를 연습할 수 있는 리허설 모드
- HailoRT 장치 감지 상태 표시

## 로컬 실행

Node.js 20 이상이 필요합니다.

```bash
npm install
npm run generate:targets
npm run build
npm start
```

브라우저에서 <http://localhost:4173>을 엽니다. 최초 CLIP 실행은 약 150 MB의 양자화 모델을 내려받으며, 브라우저 캐시에 저장됩니다.

개발 모드에서는 터미널 두 개를 사용합니다.

```bash
npm start
npm run dev
```

Vite 화면은 <http://localhost:5173>에서 열립니다.

## 표본 인쇄

앱에서 `인쇄 시트 열기`를 선택하거나 다음 파일을 엽니다.

```text
public/assets/targets/print-sheet.html
```

인쇄 설정은 `배율 100%`, `페이지 맞춤 해제`입니다. 출력 후 50 mm 검증 눈금을 자로 확인하십시오. 카메라 영상에서 표본 지름이 180 px 이상 보이도록 카메라 거리를 조정해야 합니다.

## 판정 조건

CLIP 결과는 결함 확률이 아니라 등록된 설명 후보 사이의 상대 점수입니다. 다음 조건을 모두 만족하면 불량으로 저장합니다.

1. 가장 높은 불량 점수가 임계값 이상
2. 불량 점수가 가장 높은 정상 점수보다 설정된 여유값만큼 높음
3. 자동 판정에서는 같은 결과가 3개 프레임에서 반복됨

임계값과 여유값은 UI에서 조정할 수 있습니다. 생산 적용 전에는 실제 제품, 조명, 렌즈, 배경별 검증이 필요합니다.

## Raspberry Pi 5 패키지

개발 PC에서 다음 명령으로 배포 ZIP을 만듭니다.

```bash
npm run package:pi
```

Pi에서 압축을 풀고 다음을 실행합니다.

```bash
./scripts/install-pi.sh
./scripts/start.sh
```

같은 네트워크의 PC에서는 `http://<라즈베리파이-IP>:4173`으로 접속할 수 있습니다. 브라우저 카메라 권한은 보안 정책상 `localhost` 또는 HTTPS에서 가장 안정적입니다. Pi에 연결된 모니터에서 Chromium으로 `http://localhost:4173`을 여는 구성을 권장합니다.

부팅 시 자동 실행은 다음 명령을 사용합니다.

```bash
./scripts/install-service.sh
```

## Hailo-10H

이 앱의 기본 CLIP 추론은 브라우저 ONNX/WASM 경로입니다. Hailo가 장착된 Pi에서도 즉시 실행되지만, 기본 경로가 NPU를 사용한다고 표시하지 않습니다.

Hailo-10H 가속은 Hailo용으로 컴파일된 HEF와 HailoRT 파이프라인이 필요합니다. 공식 `hailo-apps`에는 `hailo-clip` zero-shot 앱이 있고 Hailo-10H Model Zoo에는 CLIP image encoder HEF가 제공됩니다. 설치와 연결 절차는 [docs/HAILO-10H.md](docs/HAILO-10H.md)를 참고하십시오.

## 데이터 구조

- `public/data/defects.json`: 정상·불량 설명, CLIP prompt, 판정 기본값
- `public/assets/targets/`: 10 mm SVG 및 인쇄 시트
- `data/inspection-history.jsonl`: 저장된 불량 판정
- `dist/`: Raspberry Pi에서 실행할 빌드 결과

## 시연 권장 순서

1. 리허설 모드에서 8개 표본과 UI 흐름을 먼저 확인합니다.
2. CLIP 모델을 로드하고 표본 이미지를 직접 분류합니다.
3. 카메라를 시작하고 표본이 ROI에서 180 px 이상 보이도록 조정합니다.
4. 임계값을 낮게 설정해 점수 분포를 관찰한 후 정상 표본과 불량 표본 사이에서 임계값을 교정합니다.
5. 자동 판정을 켜고 불량 저장 이력과 신호등 변화를 보여줍니다.

