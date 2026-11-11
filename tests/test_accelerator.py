import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('accelerator',Path(__file__).parents[1]/'native/accelerator.py')
a=importlib.util.module_from_spec(spec); spec.loader.exec_module(a)
class Guards(unittest.TestCase):
 def test_cpu_only_machine_rejected(self):
  ort=types.SimpleNamespace(get_available_providers=lambda:['CPUExecutionProvider'],disable_telemetry_events=lambda:None)
  with patch.dict(sys.modules,{'onnxruntime':ort}):
   with self.assertRaisesRegex(RuntimeError,'CPU fallback disabled'): a.session('not-used','cuda','test')
 def test_provider_and_fallback_options(self):
  calls={}
  class Options:
   def add_session_config_entry(self,k,v): calls[k]=v
  class Runtime:
   def __init__(self,model,sess_options,providers): calls['providers']=providers;calls['options']=sess_options
   def disable_fallback(self): calls['disabled']=True
   def get_providers(self): return ['DmlExecutionProvider']
  ort=types.SimpleNamespace(SessionOptions=Options,InferenceSession=Runtime,ExecutionMode=types.SimpleNamespace(ORT_SEQUENTIAL=0),get_available_providers=lambda:['DmlExecutionProvider','CPUExecutionProvider'],disable_telemetry_events=lambda:None)
  with patch.dict(sys.modules,{'onnxruntime':ort}): a.session(b'x','directml','test-dml')
  self.assertEqual(calls['providers'],['DmlExecutionProvider'])
  self.assertEqual(calls['session.disable_cpu_ep_fallback'],'1')
  self.assertTrue(calls['disabled']);self.assertFalse(calls['options'].enable_mem_pattern)
if __name__=='__main__': unittest.main()
