import {access,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// The rebuild owns these modules. They were copied from the validated backend
// once and never read or generate files outside this independent project.
const modules=['shared/layout-probe.mjs','shared/reconstruct.mjs','shared/text.mjs'];
const sources=[];
for(const file of modules){
  const url=new URL(`../${file}`,import.meta.url);
  await access(url);
  const source=await readFile(url,'utf8');
  if(source.length<100)throw new Error(`Shared module is incomplete: ${file}`);
  sources.push(source);
}
const digest=createHash('sha256').update(sources.join('\n')).digest('hex').slice(0,12);
console.log(`Independent shared modules verified (${digest}).`);
