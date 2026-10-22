import {stat} from 'node:fs/promises';

// Atomic replacements and same-size writes must both invalidate local read caches.
export async function fileRevision(file){
  try{const s=await stat(file,{bigint:true});return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;}
  catch(error){if(error.code==='ENOENT')return 'missing';throw error;}
}
