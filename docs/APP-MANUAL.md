# CLIP 양불량 판정 시연 앱 매뉴얼

## 실행

```bash
npm start
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 빠른 시연

1. 실행 엔진을 `리허설 · 결정론적 점수`로 변경합니다.
2. 정상 A를 선택하고 `현재 화면 판정`을 누릅니다.
3. 초록 신호등과 정상 점수를 확인합니다.
4. 표면 긁힘을 선택해 다시 판정합니다.
5. 빨간 신호등, 유사도 막대와 저장 이력을 확인합니다.
6. `CLIP 모델 로드`를 누르고 실제 CLIP 엔진으로 변경합니다.
7. 동일 표본을 판정해 zero-shot 결과와 리허설 결과를 비교합니다.

## 판정 상태

- 정상: 정상 설명 점수가 가장 높습니다.
- 불량: 불량 점수가 임계값 이상이고 정상 점수보다 설정된 여유값 이상 높습니다.
- 확인 필요: 불량 후보는 있지만 판정 조건이 부족합니다.

자동 판정에서는 같은 결과가 3프레임 연속으로 나와야 불량을 저장합니다.

## 카메라 조건

- 표본 지름: ROI에서 180 px 이상 권장
- 영상 대비: 20 이상 권장
- 출력물: 배율 100%, 페이지 맞춤 해제
- 촬영: 무광 용지와 균일한 조명 권장

## Raspberry Pi 5

```bash
unzip clip-defect-demo-rpi5.zip -d clip-defect-demo
cd clip-defect-demo
./scripts/install-pi.sh
./scripts/start.sh
```

Pi의 Chromium에서 `http://localhost:4173`을 엽니다.

부팅 자동 실행:

```bash
./scripts/install-service.sh
```

Hailo 상태 확인:

```bash
./scripts/check-hailo.sh
```

현재 기본 CLIP 추론은 브라우저 ONNX/WASM 경로입니다. 실제 Hailo 가속에는 Hailo용 HEF와 inference worker 연결이 필요합니다.
