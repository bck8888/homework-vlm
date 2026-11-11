# GPU/NPU 장비 검증용 실행 안내

브랜치: `feat/siamese-demo`. 이 브랜치는 장비 검증용입니다. 현재 Mac에서 AMD/NVIDIA/Hailo의 실기 추론 성공을 확인한 상태가 아닙니다. 이전 브라우저 CPU 추론은 기본 실행 경로에서 제거했습니다.

| 장비 | 선택할 장치 | CLIP | Siamese |
|---|---|---|---|
| Ryzen 7 6800H, Windows 11 | AMD Radeon 680M · DirectML | FP32 ONNX GPU 어댑터 구현, 실기 미검증 | GPU 추론 어댑터 구현, 실기 미검증 |
| RTX 3060, Windows | NVIDIA RTX 3060 · CUDA | FP32 ONNX GPU 어댑터 구현, 실기 미검증 | GPU 추론 어댑터 구현, 실기 미검증 |
| Pi 5, Pi OS 64비트, RAM 16GB, Hailo-10H | Hailo-10H · NPU | 공식 HEF + HailoRT 어댑터 구현, 실기 미검증 | **미지원: 별도 HEF 컴파일 필요** |

Siamese의 현재 쌍 학습은 브라우저 CPU에서 수행하며, 학습된 인코더의 **추론**은 선택한 GPU에서 실행합니다. CPU 전처리·거리 계산은 남아 있습니다. 모델 추론의 CPU fallback은 금지합니다. 런타임 존재는 장치 추론 성공을 뜻하지 않습니다. 지원되지 않는 연산이 있으면 실행을 중단하며, CPU로 몰래 전환하지 않습니다.

## 1. 공통 준비 — 인터넷이 연결된 상태에서 한 번

- Node.js 22 이상, Python 3.12 64비트, 최신 Edge/Chrome 또는 Pi Chromium 필요.
- Windows는 Microsoft Visual C++ Redistributable x64 및 해당 GPU 드라이버가 필요합니다.
- Pi는 **Hailo-10H와 일치하는** HailoRT 드라이버/펌웨어/Python 패키지를 먼저 설치해야 합니다. Hailo-8용 패키지를 재사용하지 마세요. Pi OS 릴리스와 HailoRT 호환 버전은 실제 장비에서 확인해야 합니다.
- 아래 명령은 저장소 루트에서 실행합니다. 새 장비는 `git clone --branch feat/siamese-demo https://github.com/bck8888/homework-vlm.git` 후 해당 폴더로 이동합니다. 기존 작업 폴더에 미커밋 변경이 있으면 별도 clone으로 검증하세요.

```sh
npm ci
npm run build
```

### AMD Windows 11

```bat
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r native\requirements-directml.txt
.venv\Scripts\python scripts\download-models.py --target directml
```

### NVIDIA Windows

```bat
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r native\requirements-cuda.txt
.venv\Scripts\python scripts\download-models.py --target cuda
```

CUDA/cuDNN DLL이 누락되면 실행이 실패합니다. ONNX Runtime의 `preload_dlls()`를 호출하며, CUDA용 extra 의존성을 설치합니다. 실제 선택된 ORT 버전, CUDA/cuDNN, NVIDIA 드라이버 호환성을 현장에서 확인해야 합니다. 서로 다른 ORT 배포판을 한 venv에 섞지 마세요.

### Raspberry Pi + Hailo-10H

HailoRT를 설치한 시스템 Python 버전으로 venv를 만듭니다. `hailortcli fw-control identify`가 먼저 성공해야 합니다.

```sh
python3 -m venv --system-site-packages .venv
.venv/bin/python -m pip install -r native/requirements-hailo.txt
.venv/bin/python scripts/download-models.py --target hailo10h
.venv/bin/python -c "import hailo_platform; print('HailoRT import OK')"
```

CLIP 설명 벡터는 `models/hailo/clip.json`에 미리 저장되어 있습니다. 설명 DB가 변경되면 일치 검사가 실패합니다. 새 설명 벡터는 `scripts/prepare-hailo-text.py`로 별도 빌드 환경에서 생성해야 합니다. Hailo 양자화 영상 벡터와 이 텍스트 벡터의 대응 및 판정 임계값은 **실기 검증 전**입니다.

## 2. 인터넷을 끊고 실행

준비를 완료한 동일 장비에서 Wi-Fi/유선 인터넷을 끊습니다. 루프백 주소는 계속 작동합니다. 실행 중 모델 다운로드나 pip/npm 설치를 하지 않습니다.

- Windows: `scripts\start-windows.cmd` 더블클릭.
- Pi: `bash scripts/start-pi.sh` 실행 후 `http://127.0.0.1:4174/` 접속.
- 다른 장비에서 접속하는 서버가 아니라 각 장비 내부에서 실행하는 앱입니다.
- 종료: 서버 터미널에서 Ctrl+C. 브라우저 창만 닫아도 서버는 남아 있습니다.

앱에서 **추론 장치 선택 → 가속기 확인 → 정상/불량 표본 선택 → 현재 화면 판정**을 실행합니다. 실제 성공 응답에 provider 이름이 표시되는지 확인합니다. Siamese는 먼저 쌍 학습을 실행합니다. Hailo에서 Siamese 버튼을 누르면 미완료 이유와 함께 실패하는 것이 현재 정상입니다.

## 3. 카운팅 검증 (아직 전체 영상 실기 검증 전)

1. `랜덤 32개 영상 검사`를 누릅니다.
2. 영상은 2분 8초이며, 추론 중 일시정지하므로 실제 종료 시간은 더 길 수 있습니다.
3. 정답은 표본별 4개, 정상 총 8개, 불량 총 24개입니다.
4. 카운트는 실제 중앙 통과 검출과 모델 판정으로 집계합니다. 정답 JSON은 추론에 사용하지 않습니다.
5. 종료 후 `카운팅 JSON 저장` 및 `JSON 내보내기`를 누릅니다.
6. 총 32개만 맞는 것으로 통과 처리하지 마세요. 표본별 개수, 확인 필요 건수, 오분류, 중복/누락을 확인합니다. 정상 A/B는 학습상 같은 정상 클래스이므로 둘 사이 구분은 약할 수 있습니다.
7. 시간별 정답 비교: `public/assets/videos/inspection-conveyor-random-4x.json`의 `order`는 DB classes 순서의 0부터 시작하는 인덱스입니다. 각 표본은 영상시간 약 0, 4, 8, …, 124초에 중앙을 지납니다. 실제 기록의 videoTime과 대조합니다.

결과 공유 시: 장비/OS, `python -m pip freeze`, 드라이버/HailoRT 버전, 가속기 화면, 카운팅 JSON, 오류 로그를 첨부합니다. Git에 개인 카메라 영상이나 이력을 커밋하지 마세요.

## 4. 오프라인 재설치용 의존성 보관

초기 온라인 설치가 성공한 **동일 OS·CPU 아키텍처·Python 버전**에서:

```sh
python -m pip freeze > requirements-device.lock
python -m pip download -r requirements-device.lock -d wheelhouse
```

이후 해당 장비에서 `python -m pip install --no-index --find-links wheelhouse -r requirements-device.lock`으로 복원합니다. HailoRT 시스템 드라이버/펌웨어와 Windows GPU 드라이버는 별도 공식 설치 파일이 필요합니다. Git clone만으로 드라이버와 대용량 모델까지 설치되는 완성형 오프라인 설치 프로그램은 아직 아닙니다.

## 근거

- https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
- https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO10H/HAILO10H_zero_shot_classification.rst
- https://github.com/hailo-ai/hailo_model_zoo/blob/master/hailo_model_zoo/cfg/base/clip.yaml
