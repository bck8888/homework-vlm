# Shared repository

Canonical: https://github.com/bck8888/homework-vlm
Active branch: feat/siamese-demo

## Current device-validation change

- AMD Ryzen 7 6800H / Windows 11: DirectML GPU adapter.
- NVIDIA RTX 3060 / Windows: CUDA GPU adapter.
- Raspberry Pi 5 / 64-bit Pi OS / 16GB RAM / Hailo-10H: HailoRT CLIP HEF adapter.
- Runtime inference CPU fallback is prohibited. CPU image preprocessing and postprocessing remain.
- Siamese training currently runs on browser CPU, inference uses selected GPU. Hailo Siamese HEF compilation is NOT implemented.
- Official CLIP GPU model and Hailo HEF are excluded from Git. Download pinned files with scripts/download-models.py; SHA256 is checked.
- All target-device inference, throughput, camera accuracy and the full 32-object counting run remain unverified.
- Unit tests verify counting state and accelerator-selection/fallback guards. These do not certify GPU/NPU hardware operation.
- Setup: docs/ACCELERATOR-SETUP.md. Earlier CPU release archives are obsolete for this requirement.

## Coordination

Fetch current remote before changes. Preserve other work; use separate feature branches. Do not commit camera captures, inspection history, dependency directories or generated release archives. Device validation must record runtime versions, actual provider, errors, and per-class counts.

## Reference DB / asynchronous video update

- CLIP image-reference JSON DB added; includes FP32 build-time embeddings for 8 SVG references.
- GPU runtime uses extracted image-only ONNX; Hailo regenerates its own reference vectors on-device.
- Largest connected dark component excludes labels from ROI.
- Video no longer pauses per inference. Frame callbacks → line-crossing IDs → bounded 16-item FIFO → result tied to original ID/time.
- End of video waits for queue drain. Overflow, failures, and cancelled runs are explicit.
- Synthetic center-frame diagnostic reached 32/32 with image matching, versus text top-1 8/32. This is not a target-device benchmark or live camera validation.

## Apple Silicon support

- Mac Apple GPU uses PyTorch MPS with CPU model fallback disabled. CLIP image embeddings and Siamese inference supported.
- Original OpenAI CLIP PyTorch weights are pinned and SHA256 checked by `download-models.py --target mps`. Runtime is offline-only.
- Rebuild the image-reference DB on MPS; Windows FP32 and Hailo DBs are not silently reused.
- `scripts/start-mac.command` starts the local app. Setup uses Python 3.12 and tested package pins in native/requirements-mac.txt.

- Mac MPS live browser 1x video verified: 32/32 passages, 4/class, ordered labels 32/32, no errors or dropped queued items. Artifact: docs/evaluation/mac-mps-live-video.json.
- Playback speed presets 0.5/1/2/4x and 0.25–4x slider added; live 4x→2x change verified.
