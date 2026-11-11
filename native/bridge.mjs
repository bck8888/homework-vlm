import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
let processHandle, sequence=0;
const pending=new Map();
function failAll(error) { for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(error);} pending.clear(); processHandle=null; }
export function accelerator(request) {
 if (!processHandle) {
  const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'accelerator.py');
  processHandle=spawn(process.env.INSPECTION_PYTHON || (process.platform==='win32'?'python':'python3'),[script],{stdio:['pipe','pipe','pipe']});
  processHandle.on('error',e=>failAll(new Error(`가속기 실행 환경 없음: ${e.message}`)));
  processHandle.on('exit',()=>failAll(new Error('가속기 프로세스가 종료되었습니다.')));
  processHandle.stderr.on('data',chunk=>console.error(String(chunk).trim()));
  createInterface({input:processHandle.stdout}).on('line',line=>{
   let data;try {data=JSON.parse(line);}catch{return;}
   const task=pending.get(data.id);if(!task)return;
   clearTimeout(task.timer);pending.delete(data.id);
   data.ok?task.resolve(data.result):task.reject(new Error(data.error));
  });
 }
 return new Promise((resolve,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{ pending.delete(id); reject(new Error('가속기 응답 시간 초과')); },120000);
  pending.set(id,{resolve,reject,timer});
  processHandle.stdin.write(JSON.stringify({...request,id})+'\n');
 });
}
process.on('exit',()=>processHandle?.kill());
