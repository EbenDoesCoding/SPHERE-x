import {writeFile} from 'node:fs/promises';
const base='https://sphere-x.onrender.com';
const results=[];
const q='ra=133.79513&dec=-7.24515&size=0.05';
for(const endpoint of ['/health','/resolve?q=133.79513%20-7.24515','/presets',`/frames?${q}`,`/stars?ra=133.79513&dec=-7.24515&size=3`,`/overlay?${q}`]){
 const start=Date.now();console.log('Testing '+endpoint);
 try {const response=await fetch(base+endpoint,{signal:AbortSignal.timeout(180000)});const body=await response.json();results.push({endpoint,status:response.status,ms:Date.now()-start,body});console.log(JSON.stringify({endpoint,status:response.status,ms:Date.now()-start,keys:Object.keys(body),frames:body.frames?.length,stars:body.stars?.length,error:body.error}));if(endpoint.startsWith('/frames')&&response.ok)await writeFile('live-frames.json',JSON.stringify(body,null,2));}
 catch(e){results.push({endpoint,error:e.message,ms:Date.now()-start});console.log(e.message);}
 await writeFile('live-test-results.json',JSON.stringify(results,null,2));
}
