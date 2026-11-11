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
