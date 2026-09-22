import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {ManualProductImages} from '../src/manual-product-images.mjs';
test('manual images persist, serialize concurrent additions, isolate products and preserve imported images',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'manual-images-'));try{
 const bytes=Buffer.from('fictional-jpeg'),file='product-abcdef-1234.jpg';await writeFile(path.join(dir,file),bytes);
 const profiles=()=>[{businessId:'IMPORTED',displayName:'Imported fixture',imagePaths:[`product-media:${file}`,'product-media:../../secret.jpg']}];
 const library=new ManualProductImages(dir,{profiles,encode:()=>bytes});
 const [a,b]=await Promise.all(['KY02','KY03'].map(sku=>library.add({sku,name:sku,dataUrl:'data:image/jpeg;base64,eA=='})));
 assert.notEqual(a.id,b.id);assert.equal((await library.list()).length,3);assert.equal((await library.list('KY02')).length,1);
 const reopened=new ManualProductImages(dir,{profiles,encode:()=>bytes});assert.equal((await reopened.list()).length,3);
 assert.equal(await reopened.remove(`product-media:${file}`),false);assert.equal(await reopened.remove(a.id),true);assert.equal((await reopened.list()).length,2);assert.equal((await readFile(path.join(dir,file))).toString(),bytes.toString());
 await assert.rejects(library.add({sku:'KY02',dataUrl:'file:///tmp/private'}));await assert.rejects(library.add({sku:'',dataUrl:'data:image/jpeg;base64,eA=='}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
