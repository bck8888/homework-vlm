"""Apple Silicon GPU inference via PyTorch MPS; CPU model fallback is disabled."""
import os
os.environ['PYTORCH_ENABLE_MPS_FALLBACK']='0'
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import numpy as np

clip_model=None
text_cache={}
siamese_model=None

def available():
    try:
        import torch
        return torch.backends.mps.is_available()
    except ImportError:
        return False

def require_device():
    if not available(): raise RuntimeError('Apple MPS GPU가 없습니다. Apple Silicon 및 PyTorch MPS 환경을 확인하세요. CPU 대체는 하지 않습니다.')
    return 'mps'

def load_clip(path):
    global clip_model
    import torch
    from transformers import CLIPModel
    if clip_model is None:
        device=require_device()
        clip_model=CLIPModel.from_pretrained(str(path),local_files_only=True,torch_dtype=torch.float32,attn_implementation='eager').eval().to(device)
    return clip_model

def embedding(rgb,path):
    import torch
    model=load_clip(path)
    pixels=(np.asarray(rgb,dtype=np.float32)/255-np.array([.48145466,.4578275,.40821073],np.float32))/np.array([.26862954,.26130258,.27577711],np.float32)
    tensor=torch.from_numpy(np.ascontiguousarray(pixels.transpose(2,0,1)[None])).to('mps')
    with torch.inference_mode():
        pooled=model.vision_model(pixel_values=tensor).pooler_output
        vector=model.visual_projection(pooled)
        vector=vector/vector.norm(dim=-1,keepdim=True)
        result=vector[0].cpu().numpy()
    return result

def text_scores(rgb,prompts,path):
    import torch
    from tokenizers import Tokenizer
    model=load_clip(path)
    key=tuple(prompts)
    if key not in text_cache:
        tokenizer=Tokenizer.from_file(str(path/'tokenizer.json'))
        tokenizer.enable_padding(length=77,pad_id=49407,pad_token='<|endoftext|>');tokenizer.enable_truncation(max_length=77)
        tokens=tokenizer.encode_batch(prompts)
        ids=torch.tensor([x.ids for x in tokens],dtype=torch.long,device='mps')
        mask=torch.tensor([x.attention_mask for x in tokens],dtype=torch.long,device='mps')
        with torch.inference_mode():
            vectors=model.text_projection(model.text_model(input_ids=ids,attention_mask=mask).pooler_output)
            vectors=vectors/vectors.norm(dim=-1,keepdim=True)
            text_cache[key]=vectors.cpu().numpy()
    vector=embedding(rgb,path)
    logits=(text_cache[key]@vector)*float(model.logit_scale.exp().item())
    scores=np.exp(logits-logits.max());return scores/scores.sum()

def prepare_siamese(weights,bias,references):
    global siamese_model
    import torch
    device=require_device()
    w=torch.tensor(weights,dtype=torch.float32,device=device).reshape(32,256)
    b=torch.tensor(bias,dtype=torch.float32,device=device).reshape(32)
    with torch.inference_mode():
        torch.tanh(torch.nn.functional.linear(torch.zeros((1,256),device=device),w,b)).cpu()
    siamese_model=(w,b,np.asarray(references,np.float32))

def siamese_scores(pixels):
    import torch
    if siamese_model is None:raise RuntimeError('Apple GPU에 Siamese 모델을 먼저 준비하세요.')
    w,b,refs=siamese_model
    with torch.inference_mode():
        x=torch.tensor(pixels,dtype=torch.float32,device='mps').reshape(1,256)
        vector=torch.tanh(torch.nn.functional.linear(x,w,b))[0].cpu().numpy()
    logits=-8*np.linalg.norm(refs-vector,axis=1);scores=np.exp(logits-logits.max());return scores/scores.sum()
