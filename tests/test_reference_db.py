import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'native'))
import unittest
import numpy as np
from reference_db import build,match,normalize
class ReferenceTests(unittest.TestCase):
 def setUp(self):
  self.rows=[{'id':str(i),'labelKo':str(i),'group':'normal' if i<2 else 'defect','embedding':np.eye(8,512)[i]} for i in range(8)]
  self.db=build(self.rows,'fp','test')
 def test_round_trip_and_id_order(self):
  import json
  db=json.loads(json.dumps(self.db));ids=[str(i) for i in reversed(range(8))]
  self.assertEqual(match(db,self.rows[3]['embedding'],'fp',ids).index(1),4)
 def test_wrong_model_rejected(self):
  with self.assertRaises(ValueError):match(self.db,self.rows[0]['embedding'],'other',[str(i) for i in range(8)])
 def test_invalid_vector_rejected(self):
  for vector in [np.zeros(512),np.ones(20),np.full(512,np.nan)]:
   with self.assertRaises(ValueError):normalize(vector)
if __name__=='__main__':unittest.main()
