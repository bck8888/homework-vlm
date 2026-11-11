"""Run once while online; model inference never uses this script."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--target',choices=['cuda','directml','hailo10h'],required=True);p.add_argument('--verify-only',action='store_true');args=p.parse_args()
for item in json.loads((root/'models/downloads.json').read_text()):
 if args.target not in item['targets']: continue
 target=root/item['target']
 def valid():
  return target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==item['sha256']
 if not valid():
  if args.verify_only: raise SystemExit(f'Missing/corrupt: {target}')
  target.parent.mkdir(parents=True,exist_ok=True)
  partial=target.with_name(target.name+'.part')
  print('Downloading',item['target'],flush=True)
  urllib.request.urlretrieve(item['url'],partial)
  if hashlib.sha256(partial.read_bytes()).hexdigest()!=item['sha256']: raise SystemExit('Checksum mismatch')
  partial.replace(target)
 print('Verified',item['target'],flush=True)

if args.target != 'hailo10h' and not args.verify_only:
 import subprocess,sys
 subprocess.run([sys.executable,str(root/'scripts/export-clip-image.py')],check=True)
