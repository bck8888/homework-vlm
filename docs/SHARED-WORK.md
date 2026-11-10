# Shared repository

Canonical repository: https://github.com/bck8888/homework-vlm

This initial implementation is the browser CLIP demo from chat 01a1c041-c147-7ea2-804e-9d2da5f19886.

## Verified scope

- Browser CLIP ViT-B/32 ONNX/WASM inference, JSON prompts, SVG targets, UI and JSONL storage.
- Rehearsal mode uses generated scores and is not model inference.
- Hailo device detection only; NPU inference is not implemented.
- Siamese training is not implemented.
- Raspberry Pi installation and physical camera accuracy have not been verified on hardware.

## Coordination

Fetch the current remote state before working. Use a separate feature branch for each chat and review changes before merging. Keep private camera captures, history, dependencies and generated release archives out of Git. Compare the second implementation before replacing this one.
