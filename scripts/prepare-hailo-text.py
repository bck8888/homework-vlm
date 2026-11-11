"""Build-time only: prepare fixed CLIP text embeddings. Never called by the app."""
import json
from pathlib import Path
import numpy as np
import onnxruntime as ort
import onnx
from onnx import numpy_helper
from tokenizers import Tokenizer
root=Path(__file__).resolve().parents[1]
model=root/'public/models/Xenova/clip-vit-base-patch32'
classes=json.loads((root/'public/data/defects.json').read_text())['classes']
tokenizer=Tokenizer.from_file(str(model/'tokenizer.json'))
tokenizer.enable_padding(length=77,pad_id=49407,pad_token='<|endoftext|>'); tokenizer.enable_truncation(max_length=77)
tokens=tokenizer.encode_batch([x['prompt'] for x in classes])
session=ort.InferenceSession(str(model/'onnx/model.onnx'),providers=['CPUExecutionProvider'])
feeds={'input_ids':np.array([x.ids for x in tokens],np.int64),'attention_mask':np.array([x.attention_mask for x in tokens],np.int64),'pixel_values':np.zeros((1,3,224,224),np.float32)}
outputs=dict(zip([x.name for x in session.get_outputs()],session.run(None,{x.name:feeds[x.name] for x in session.get_inputs()})))
graph=onnx.load(str(model/'onnx/model.onnx'))
scale=None
for value in graph.graph.initializer:
 if value.name=='logit_scale': scale=float(np.exp(numpy_helper.to_array(value)))
# Exporters may fold exp(logit_scale) into a scalar constant. Recover exact scale
# from logits and returned normalized embeddings rather than assuming training initialization.
if scale is None:
 cosine=outputs['image_embeds']@outputs['text_embeds'].T
 denom=float(np.sum(cosine*cosine))
 if denom<1e-12: raise RuntimeError('Cannot derive logit scale')
 scale=float(np.sum(cosine*outputs['logits_per_image'])/denom)
manifest={'model':'OpenAI CLIP ViT-B/32 / Hailo Model Zoo v5.5.0','hef':'clip_vit_b_32_image_encoder.hef','prompts':[x['prompt'] for x in classes],'textVectors':outputs['text_embeds'].tolist(),'logitScale':scale,'validation':'Hailo hardware embedding parity not yet tested; text vectors generated from Xenova export of OpenAI CLIP ViT-B/32.'}
(root/'models/hailo/clip.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('Prepared',len(classes),'text vectors; logit scale',scale)
