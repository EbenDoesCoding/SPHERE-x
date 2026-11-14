import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
test('server serves HTML, modules, CSS, sample metadata and actual PNG assets',async()=>{
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0'}});
 try {
  const base=await new Promise((resolve,reject)=>{child.stdout.once('data',chunk=>resolve(chunk.toString().match(/http:\/\/[^\s]+/)[0]));child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});
  for(const [file,type] of [['/','text/html'],['/app.js','text/javascript'],['/styles.css','text/css'],['/assets/sample.json','application/json']]){const res=await fetch(base+file);assert.equal(res.status,200,file);assert.ok(res.headers.get('content-type').startsWith(type));}
  const sample=await (await fetch(base+'/assets/sample.json')).json();assert.equal(sample.frames.length,17);
  for(const f of sample.frames){const r=await fetch(base+'/'+f.image_url);assert.equal(r.status,200);const b=new Uint8Array(await r.arrayBuffer());assert.equal(b[0],137);assert.equal(b[1],80);}
  assert.equal((await fetch(base+'/missing')).status,404);
 }finally{child.kill();}
});
