"""Local JSON-line worker. No download and no inference CPU fallback."""
import base64
import io
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'public/models/Xenova/clip-vit-base-patch32'
if not MODEL.exists():
    MODEL = ROOT / 'dist/models/Xenova/clip-vit-base-patch32'
PROVIDERS = {'cuda': 'CUDAExecutionProvider', 'directml': 'DmlExecutionProvider', 'migraphx': 'MIGraphXExecutionProvider'}
sessions = {}
siamese = None

def status():
    try:
        import onnxruntime as ort
        ort.disable_telemetry_events()
        providers = ort.get_available_providers()
    except ImportError:
        providers = []
    import importlib.util
    from apple_gpu import available
    return {'providers': providers, 'hailoRuntimeInstalled': importlib.util.find_spec('hailo_platform') is not None,
            'appleMPSAvailable': available(), 'cpuFallback': False, 'note': 'Provider availability is not proof of a successful device inference.'}

def session(model, backend, key):
    import onnxruntime as ort
    ort.disable_telemetry_events()
    provider = PROVIDERS.get(backend)
    if provider is None or provider not in ort.get_available_providers():
        raise RuntimeError(f'{backend}: required GPU provider unavailable. CPU fallback disabled.')
    if key not in sessions:
        if backend == "cuda" and hasattr(ort, "preload_dlls"):
            ort.preload_dlls()
        options = ort.SessionOptions()
        options.add_session_config_entry('session.disable_cpu_ep_fallback', '1')
        if backend == 'directml':
            options.enable_mem_pattern = False
            options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        runtime = ort.InferenceSession(model, sess_options=options, providers=[provider])
        runtime.disable_fallback()
        if runtime.get_providers()[0] != provider:
            raise RuntimeError('Requested GPU provider was not selected.')
        sessions[key] = runtime
    return sessions[key]

def image(data):
    from PIL import Image
    return Image.open(io.BytesIO(base64.b64decode(data.split(',',1)[-1], validate=True))).convert('RGB').resize((224,224), Image.Resampling.BICUBIC)

def clip(data):
    import numpy as np
    backend = data['backend']
    if backend == 'mps':
        from apple_gpu import text_scores
        scores=text_scores(image(data['image']),[c['prompt'] for c in data['classes']],MODEL)
        return {'scores':scores.tolist(),'provider':'Apple GPU / PyTorch MPS','model':'CLIP ViT-B/32 FP32','cpuFallback':False}
    if backend == 'hailo10h':
        return hailo_clip(data)
    from tokenizers import Tokenizer
    model = MODEL / 'onnx/model.onnx'
    if not model.exists():
        raise RuntimeError('GPU용 FP32 model.onnx가 없습니다. 오프라인 배포 준비를 먼저 완료하세요.')
    runtime = session(str(model),backend,('clip',backend))
    tokenizer = Tokenizer.from_file(str(MODEL/'tokenizer.json'))
    tokenizer.enable_truncation(max_length=77)
    tokenizer.enable_padding(length=77,pad_id=49407,pad_token='<|endoftext|>')
    encoded = tokenizer.encode_batch([r['prompt'] for r in data['classes']])
    pixels = np.asarray(image(data['image']),dtype=np.float32)/255.0
    pixels = (pixels - np.array([.48145466,.4578275,.40821073],np.float32))/np.array([.26862954,.26130258,.27577711],np.float32)
    feeds = {'pixel_values': pixels.transpose(2,0,1)[None],
             'input_ids': np.array([x.ids for x in encoded],np.int64),
             'attention_mask': np.array([x.attention_mask for x in encoded],np.int64)}
    result = dict(zip([x.name for x in runtime.get_outputs()],runtime.run(None,{x.name:feeds[x.name] for x in runtime.get_inputs()})))
    logits = result['logits_per_image'][0]
    scores = np.exp(logits-logits.max()); scores /= scores.sum()
    return {'scores': scores.tolist(), 'provider': PROVIDERS[backend], 'model':'CLIP ViT-B/32 FP32', 'cpuFallback':False}

def prepare_siamese(data):
    global siamese
    import numpy as np
    if data['backend']=='mps':
        from apple_gpu import prepare_siamese as prepare
        prepare(data['weights'],data['bias'],data['references'])
        return {'provider':'Apple GPU / PyTorch MPS','model':'shared Siamese 256→32','cpuFallback':False}
    import onnx
    from onnx import helper, numpy_helper, TensorProto
    if data['backend'] == 'hailo10h':
        raise RuntimeError('Siamese Hailo-10H HEF가 아직 준비되지 않았습니다. ONNX export → calibration → DFC compile → 실기 검증이 필요합니다.')
    w=np.asarray(data['weights'],np.float32).reshape(32,256)
    b=np.asarray(data['bias'],np.float32).reshape(32)
    graph=helper.make_graph([helper.make_node('Gemm',['input','W','B'],['z'],transB=1),helper.make_node('Tanh',['z'],['embedding'])], 'siamese',
        [helper.make_tensor_value_info('input',TensorProto.FLOAT,[1,256])],
        [helper.make_tensor_value_info('embedding',TensorProto.FLOAT,[1,32])],
        [numpy_helper.from_array(w,'W'),numpy_helper.from_array(b,'B')])
    model=helper.make_model(graph,opset_imports=[helper.make_opsetid('',13)]); model.ir_version=8
    onnx.checker.check_model(model)
    sessions.pop(('siamese',data['backend']),None)
    runtime=session(model.SerializeToString(),data['backend'],('siamese',data['backend']))
    # Reference encodings were produced by the same shared encoder; FP32 conversion is checked on the target.
    siamese={'runtime':runtime,'backend':data['backend'],'references':np.array(data['references'],np.float32)}
    runtime.run(None,{'input':np.zeros((1,256),np.float32)})
    return {'provider':PROVIDERS[data['backend']],'model':'shared Siamese 256→32','cpuFallback':False}

def infer_siamese(data):
    import numpy as np
    if data['backend']=='mps':
        from apple_gpu import siamese_scores
        return {'scores':siamese_scores(data['pixels']).tolist(),'provider':'Apple GPU / PyTorch MPS','model':'shared Siamese 256→32','cpuFallback':False}
    if siamese is None or siamese['backend'] != data['backend']:
        raise RuntimeError('선택한 GPU에 Siamese 모델을 준비하세요.')
    query=siamese['runtime'].run(None,{'input':np.asarray(data['pixels'],np.float32).reshape(1,256)})[0][0]
    distances=np.linalg.norm(siamese['references']-query,axis=1)
    logits=-8*distances; scores=np.exp(logits-logits.max()); scores/=scores.sum()
    return {'scores':scores.tolist(),'provider':PROVIDERS[data['backend']],'model':'shared Siamese 256→32','cpuFallback':False}

hailo_runtime = None
fingerprints = {}

def model_fingerprint(backend):
    import hashlib
    file = ROOT/'models/hailo/clip_vit_b_32_image_encoder.hef' if backend == 'hailo10h' else MODEL/'onnx/model.onnx'
    if backend=='mps': file=MODEL/'pytorch_model.bin'
    key = (str(file),file.stat().st_mtime_ns)
    if key not in fingerprints:
        digest = hashlib.sha256()
        with file.open('rb') as handle:
            for chunk in iter(lambda:handle.read(1024*1024), b''): digest.update(chunk)
        fingerprints[key] = digest.hexdigest()
    return fingerprints[key]

def hailo_embedding(rgb):
    global hailo_runtime
    import numpy as np
    from contextlib import ExitStack
    from hailo_platform import VDevice, FormatType
    if hailo_runtime is None:
        import atexit
        stack = ExitStack()
        try:
            device = stack.enter_context(VDevice())
            infer = device.create_infer_model(str(ROOT/'models/hailo/clip_vit_b_32_image_encoder.hef'))
            infer.set_batch_size(1)
            infer.input().set_format_type(FormatType.UINT8)
            infer.output().set_format_type(FormatType.FLOAT32)
            configured = stack.enter_context(infer.configure())
            hailo_runtime = (stack, device, infer, configured)
            atexit.register(stack.close)
        except Exception:
            stack.close(); raise
    _, device, infer, configured = hailo_runtime
    output = np.empty(infer.output().shape,dtype=np.float32)
    binding = configured.create_bindings()
    binding.input().set_buffer(np.ascontiguousarray(rgb))
    binding.output().set_buffer(output)
    configured.run([binding],10000)
    return output.flatten()

def image_embedding(data):
    import numpy as np
    backend = data['backend']
    rgb = np.asarray(image(data['image']))
    if backend=='mps':
        from apple_gpu import embedding
        return embedding(rgb,MODEL), 'Apple GPU / PyTorch MPS'
    if backend == 'hailo10h':
        return hailo_embedding(rgb), 'HailoRT / Hailo-10H'
    path = MODEL/'onnx/image_encoder.onnx'
    if not path.exists(): raise RuntimeError('이미지 인코더가 없습니다. scripts/export-clip-image.py를 실행하세요.')
    runtime = session(str(path),backend,('image',backend))
    pixels=(rgb.astype(np.float32)/255-np.array([.48145466,.4578275,.40821073],np.float32))/np.array([.26862954,.26130258,.27577711],np.float32)
    vector = runtime.run(['image_embeds'],{'pixel_values':pixels.transpose(2,0,1)[None]})[0][0]
    return vector, PROVIDERS[backend]

def hailo_clip(data):
    import numpy as np
    manifest=json.loads((ROOT/'models/hailo/clip.json').read_text())
    if manifest['prompts'] != [c['prompt'] for c in data['classes']]: raise RuntimeError('설명 DB가 저장된 벡터와 다릅니다.')
    vector, provider = image_embedding(data)
    vector/=max(np.linalg.norm(vector),1e-12)
    texts=np.asarray(manifest['textVectors'],np.float32)
    texts/=np.maximum(np.linalg.norm(texts,axis=1,keepdims=True),1e-12)
    logits=(texts@vector)*float(manifest['logitScale'])
    scores=np.exp(logits-logits.max()); scores/=scores.sum()
    return {'scores':scores.tolist(),'provider':provider,'model':manifest['model'],'cpuFallback':False}

def reference_path(backend):
    return Path(os.environ.get('APP_DATA_DIR',ROOT/'data'))/f'reference-embeddings-{backend}.json'

def reference_db(data):
    from reference_db import build, save, match
    backend=data['backend']; action=data['action']; path=reference_path(backend)
    if action == 'prepare_references':
        rows=[]
        for row in data['references']:
            vector,provider=image_embedding({'backend':backend,'image':row['image']})
            rows.append({**row,'embedding':vector})
        db=build(rows,model_fingerprint(backend),{'provider':provider,'backend':backend,'source':'8 reference SVG images; not video answer sequence'})
        save(db,path)
        return {'count':len(rows),'provider':provider,'model':db['model'],'cpuFallback':False}
    if not path.exists() and backend in PROVIDERS:
        path=ROOT/'models/references/clip-fp32.json'
    if not path.exists(): raise RuntimeError('선택 장치의 기준 벡터 DB가 없습니다. 기준 DB 만들기를 실행하세요.')
    db=json.loads(path.read_text(encoding='utf-8'))
    if action == 'export_references': return db
    vector,provider=image_embedding(data)
    scores=match(db,vector,model_fingerprint(backend),[c['id'] for c in data['classes']])
    return {'scores':scores,'provider':provider,'model':db['model'],'cpuFallback':False,'metric':'cosine','referenceCreatedAt':db['createdAt']}

def dispatch(data):
    if data['action'] in ['prepare_references','match_references','export_references']: return reference_db(data)
    return {'status':status,'clip':lambda:clip(data),'prepare_siamese':lambda:prepare_siamese(data),'siamese':lambda:infer_siamese(data)}[data['action']]()

if __name__=='__main__':
    for line in sys.stdin:
        try:
            request=json.loads(line)
            result=dispatch(request)
            print(json.dumps({'id':request['id'],'ok':True,'result':result}),flush=True)
        except Exception as exc:
            print(json.dumps({'id':locals().get('request',{}).get('id'),'ok':False,'error':str(exc)}),flush=True)
