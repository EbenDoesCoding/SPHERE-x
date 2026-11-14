export function validateQuery({ra,dec,size,detector='',mode='best',group_id=''}) {
  if (String(ra).trim()==='' || !Number.isFinite(Number(ra)) || +ra<0 || +ra>360) throw Error('Right ascension must be between 0° and 360°.');
  if (String(dec).trim()==='' || !Number.isFinite(Number(dec)) || +dec< -90 || +dec>90) throw Error('Declination must be between −90° and +90°.');
  if (!Number.isFinite(Number(size)) || +size<0.01 || +size>0.30) throw Error('Field of view must be between 0.01° and 0.30°.');
  if (!['best','group','stack','all'].includes(mode)) throw Error('Choose a supported frame mode.');
  if (detector!=='' && (!Number.isInteger(+detector) || +detector<1 || +detector>6)) throw Error('Detector must be 1–6 or automatic.');
  if (mode==='group' && (group_id==='' || !Number.isInteger(+group_id) || +group_id<0)) throw Error('Enter a wavelength group ID from the frame metadata.');
  const q={ra:+ra,dec:+dec,size:+size,mode};
  if(detector!=='') q.detector=+detector;
  if(mode==='group') q.group_id=+group_id;
  return q;
}
export function endpointParams(endpoint,q,search='') {
  if(endpoint==='/resolve') return {q:search};
  if(endpoint==='/health'||endpoint==='/presets') return {};
  if(endpoint==='/stars') return {ra:q.ra,dec:q.dec,size:q.size*60};
  return q;
}
export function apiURL(base,endpoint,params={}) {
  const parsed=new URL(base);
  if(!['http:','https:'].includes(parsed.protocol)) throw Error('Use an HTTP or HTTPS backend URL.');
  const url=new URL(base.replace(/\/$/,'')+endpoint);
  for(const [k,v] of Object.entries(params)) if(v!==undefined && v!=='') url.searchParams.set(k,v);
  return url.toString();
}
export function imageURL(base,url) {
  const parsed=new URL(url,base.replace(/\/$/,'')+'/');
  if(!['http:','https:'].includes(parsed.protocol)) throw Error('Unsupported image URL.');
  return parsed.href;
}
export function mjdISO(mjd) {return new Date((mjd-40587)*86400000).toISOString();}
export function orderedFrames(frames) {return frames.map((f,i)=>({...f,sourceIndex:i})).sort((a,b)=>a.t_mjd-b.t_mjd);}
export function scientificWarnings(data) {
  const warnings=[...(data.meta?.warnings || [])];
  if(data.meta?.mode==='all') warnings.push('Mixed wavelengths: brightness flicker can reflect colour, rather than motion or variability.');
  const epochs=new Set(data.frames.map(f=>f.epoch).filter(v=>v!==undefined));
  if(epochs.size<2) warnings.push('Fewer than two confirmed epochs. Motion cannot be assessed.');
  const selected=data.meta?.selected_groups || [];
  if(data.meta?.groups?.some(g=>selected.includes(g.id)&&g.usable_for_motion===false)) warnings.push('The selected wavelength group is not suitable for motion assessment.');
  return [...new Set(warnings)];
}
