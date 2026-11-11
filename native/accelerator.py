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
    return {'providers': providers, 'hailoRuntimeInstalled': importlib.util.find_spec('hailo_platform') is not None,
            'cpuFallback': False, 'note': 'Provider availability is not proof of a successful device inference.'}

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
    from tokenizers import Tokenizer
    backend = data['backend']
    if backend == 'hailo10h':
        return hailo_clip(data)
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
    if siamese is None or siamese['backend'] != data['backend']:
        raise RuntimeError('선택한 GPU에 Siamese 모델을 준비하세요.')
    query=siamese['runtime'].run(None,{'input':np.asarray(data['pixels'],np.float32).reshape(1,256)})[0][0]
    distances=np.linalg.norm(siamese['references']-query,axis=1)
    logits=-8*distances; scores=np.exp(logits-logits.max()); scores/=scores.sum()
    return {'scores':scores.tolist(),'provider':PROVIDERS[data['backend']],'model':'shared Siamese 256→32','cpuFallback':False}

def hailo_clip(data):
    import numpy as np
    from hailo_platform import VDevice, FormatType
    manifest_path=ROOT/'models/hailo/clip.json'
    if not manifest_path.exists():
        raise RuntimeError('Hailo 모델 manifest와 동일 CLIP의 설명 벡터가 없습니다. 배포 준비가 필요합니다.')
    manifest=json.loads(manifest_path.read_text())
    if manifest['prompts'] != [c['prompt'] for c in data['classes']]:
        raise RuntimeError('설명 DB가 저장된 Hailo 설명 벡터와 다릅니다. 벡터를 다시 생성하세요.')
    # The official HEF incorporates input normalization (0..255 RGB input).
    rgb=np.asarray(image(data['image']),dtype=np.uint8)
    with VDevice() as device:
        infer=device.create_infer_model(str(ROOT/'models/hailo'/manifest['hef']))
        infer.set_batch_size(1)
        infer.input().set_format_type(FormatType.UINT8)
        infer.output().set_format_type(FormatType.FLOAT32)
        with infer.configure() as configured:
            output=np.empty(infer.output().shape,dtype=np.float32)
            binding=configured.create_bindings()
            binding.input().set_buffer(np.ascontiguousarray(rgb))
            binding.output().set_buffer(output)
            configured.run([binding],10000)
    vector=output.flatten(); vector/=max(np.linalg.norm(vector),1e-12)
    texts=np.asarray(manifest['textVectors'],np.float32)
    texts/=np.maximum(np.linalg.norm(texts,axis=1,keepdims=True),1e-12)
    logits=(texts@vector)*float(manifest['logitScale'])
    scores=np.exp(logits-logits.max()); scores/=scores.sum()
    return {'scores':scores.tolist(),'provider':'HailoRT / Hailo-10H','model':manifest['model'],'cpuFallback':False}

def dispatch(data):
    return {'status':status,'clip':lambda:clip(data),'prepare_siamese':lambda:prepare_siamese(data),'siamese':lambda:infer_siamese(data)}[data['action']]()

if __name__=='__main__':
    for line in sys.stdin:
        try:
            request=json.loads(line)
            result=dispatch(request)
            print(json.dumps({'id':request['id'],'ok':True,'result':result}),flush=True)
        except Exception as exc:
            print(json.dumps({'id':locals().get('request',{}).get('id'),'ok':False,'error':str(exc)}),flush=True)
