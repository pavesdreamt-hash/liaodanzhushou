import test from 'node:test';
import assert from 'node:assert/strict';
import {goTo} from '../src/source/browser.mjs';
import {columnLabel} from '../shared/reconstruct.mjs';

test('KDocs selected-cell navigation reaches product rows without submitting the rejected address box',async()=>{
 let row=273,column=19,focused=false,keys=[];
 const box={inputValue:async()=>`${columnLabel(column)}${row}`,fill:()=>assert.fail('address box must not be submitted')};
 const page={locator:selector=>selector==='input.edit-box'?box:{focus:async()=>{focused=true;}},keyboard:{press:async key=>{
   assert.ok(focused);keys.push(key);
   if(key==='Meta+Home'){row=2;column=1;}
   else if(key==='PageDown')row=Math.min(273,row+7);
   else if(key==='PageUp')row=Math.max(1,row-12);
   else if(key==='Home')column=1;
   else if(key==='ArrowDown')row=Math.min(273,row+1);
   else if(key==='ArrowUp')row=Math.max(1,row-1);
   else if(key==='ArrowRight')column++;
   else if(key==='ArrowLeft')column--;
   else assert.fail(`unexpected key ${key}`);
 }}};
 await goTo(page,'A2');assert.equal(await box.inputValue(),'A2');
 await goTo(page,'D93');assert.equal(await box.inputValue(),'D93');
 await goTo(page,'G273');assert.equal(await box.inputValue(),'G273');
 await goTo(page,'A1');assert.equal(await box.inputValue(),'A1');
 assert.ok(keys.includes('PageDown'));assert.ok(keys.includes('Meta+Home'));
});
