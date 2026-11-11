"""Extract the image-only graph: no text encoder is executed during reference matching."""
from pathlib import Path
import onnx
root=Path(__file__).resolve().parents[1]
p=root/'public/models/Xenova/clip-vit-base-patch32/onnx'
onnx.utils.extract_model(str(p/'model.onnx'),str(p/'image_encoder.onnx'),['pixel_values'],['image_embeds'])
print(p/'image_encoder.onnx')
