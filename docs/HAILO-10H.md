# Raspberry Pi 5 + Hailo-10H 연결 안내

## 현재 패키지의 경계

웹 UI, 카메라, JSON DB, 판정 로직과 저장 기능은 Hailo 없이도 동작합니다. 기본 추론 엔진은 브라우저의 ONNX Runtime WASM입니다.

Hailo-10H는 일반 ONNX 파일을 자동으로 실행하지 않습니다. Hailo용 HEF와 HailoRT 기반 파이프라인이 필요합니다. 따라서 UI가 `Hailo 감지`를 표시하더라도 현재 CLIP 점수는 `browser-onnx-wasm`에서 계산됩니다.

## 공식 지원 경로

Raspberry Pi 문서는 Pi 5와 AI HAT+ 2의 Hailo-10H 조합을 지원합니다.

- Raspberry Pi AI software: https://www.raspberrypi.com/documentation/computers/ai.html
- Hailo Apps: https://github.com/hailo-ai/hailo-apps
- Hailo CLIP 앱: https://github.com/hailo-ai/hailo-apps/tree/main/hailo_apps/python/pipeline_apps/clip
- Hailo-10H zero-shot model list: https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO10H/HAILO10H_zero_shot_classification.rst

공식 CLIP 구조는 영상 인코더를 Hailo에서 실행하고, 텍스트 임베딩은 호스트에서 미리 계산한 뒤 유사도를 비교합니다. 이 시연의 JSON 설명 DB도 같은 분리 구조를 따릅니다.

## 장치 확인

```bash
hailortcli fw-control identify
```

웹 앱의 `/api/runtime`도 같은 명령을 호출해 장치 감지 결과를 표시합니다.

## Hailo Apps 확인

Hailo의 최신 설치 지침에 따라 `hailo-apps`를 설치한 뒤 다음 명령이 제공되는지 확인합니다.

```bash
hailo-clip --help
```

카메라 입력은 공식 앱 설명에 따라 USB 카메라 또는 Raspberry Pi Camera를 선택합니다.

```bash
hailo-clip
```

## 이 UI에 실제 Hailo 추론을 연결할 때

하드웨어에서 다음 정보가 확인되어야 어댑터를 고정할 수 있습니다.

1. `hailortcli fw-control identify` 출력과 HailoRT 버전
2. `hailo-clip --help` 출력
3. 설치된 CLIP HEF의 입력 크기와 출력 임베딩 차원
4. 공식 앱이 생성하는 text embedding JSON 형식

그 다음 서버에 Hailo inference worker를 추가하고, 브라우저가 ROI JPEG를 `/api/infer`로 전송하도록 연결합니다. 반환 형식은 현재 UI가 사용하는 `{classId, score}` 배열로 맞추면 나머지 판정·신호등·저장 로직은 그대로 유지됩니다.

