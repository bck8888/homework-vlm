"""Versioned reference embeddings. Similarity scores are cosines, not probabilities."""
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

def normalize(vector):
    vector=np.asarray(vector,dtype=np.float32).reshape(-1)
    if len(vector)!=512 or not np.isfinite(vector).all() or np.linalg.norm(vector)<1e-12:
        raise ValueError('Expected a finite, nonzero 512D CLIP embedding')
    return vector/np.linalg.norm(vector)

def build(rows, fingerprint, provenance):
    if len(rows)!=8 or len({r['id'] for r in rows})!=8: raise ValueError('Eight distinct references required')
    return {'schemaVersion':1,'model':'CLIP ViT-B/32 image encoder','modelFingerprint':fingerprint,'dimension':512,'metric':'cosine','preprocessing':'rgb224-clip-v1','createdAt':datetime.now(timezone.utc).isoformat(),'provenance':provenance,
            'references':[{**{k:r[k] for k in ['id','labelKo','group']},'embedding':normalize(r['embedding']).tolist()} for r in rows]}

def match(db, vector, fingerprint, ids):
    if db.get('schemaVersion')!=1 or db.get('modelFingerprint')!=fingerprint or db.get('preprocessing')!='rgb224-clip-v1':
        raise ValueError('Reference DB/model mismatch; rebuild DB on selected device')
    refs=db['references']
    if len(refs)!=len(ids) or {r['id'] for r in refs}!=set(ids): raise ValueError('Reference class IDs differ from DB')
    q=normalize(vector)
    lookup={r['id']:float(np.clip(np.dot(q,normalize(r['embedding'])),-1,1)) for r in refs}
    return [lookup[key] for key in ids]

def save(db,path):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(db,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(path)
