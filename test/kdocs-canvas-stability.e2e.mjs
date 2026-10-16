import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {installLayoutProbe} from '../shared/layout-probe.mjs';
import {decodeLayout,combineLayouts} from '../shared/reconstruct.mjs';
import {sourceStartPosition} from '../src/source/collector.mjs';
import {goTo,usedEnd} from '../src/source/browser.mjs';

test('real Canvas parent clipping excludes hidden frozen-pane rows, including after resize; visible body data stays correct',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.setContent('<canvas id="et_canvas" width="1435" height="614"></canvas>');await page.evaluate(installLayoutProbe);
 for(const resize of [false,true]){
  const raw=await page.evaluate(resize=>{
   const canvas=document.getElementById('et_canvas');if(resize){canvas.height=613;canvas.height=614;}const ctx=canvas.getContext('2d');window.__KD_LAYOUT.reset();
   const clip=(x,y,width,height,draw)=>{ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();draw();ctx.restore();};
   const header=(row,y,height)=>clip(0,y,39,height,()=>{ctx.font='12px ET-HEADERS-FONT';ctx.fillText(String(row),10,y+16);});
   const cell=(column,y,height,text)=>clip(40+70*column,y,69,height,()=>{ctx.font='12px Arial';ctx.fillText(text,44+70*column,y+16);});
   for(let i=0;i<19;i++)clip(40+i*70,0,69,23,()=>{ctx.font='12px ET-HEADERS-FONT';ctx.fillText(String.fromCharCode(65+i),45+i*70,16);});
   clip(0,62,1435,552,()=>{header(212,62,103);cell(0,62,103,'Visible-212');cell(3,62,103,'20.0');});
   clip(0,24,1435,39,()=>{header(1,24,37);cell(0,24,37,'名称');header(2,62,97);cell(0,62,97,'Hidden-2');cell(3,62,97,'999.0');});
   return window.__KD_LAYOUT.snapshot();
  },resize);
  const hidden=raw.events.find(e=>e.kind==='text'&&e.text==='2');assert.equal(hidden.paintBounds.height,1);
  const layout=decodeLayout(raw);assert.deepEqual(layout.rows.map(r=>r.row),[1,212]);assert.equal(layout.cells.find(c=>c.address==='D212').text,'20.0');assert.equal(layout.cells.some(c=>c.row===2),false);assert.equal(layout.cells.find(c=>c.address==='A1').text,'名称');assert.equal(sourceStartPosition(layout,'S215').address,'A2');
 }
});

test('a parent-clipped body row cannot contaminate the frozen header or count as a complete empty row',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.setContent('<canvas id="et_canvas" width="1435" height="614"></canvas>');await page.evaluate(installLayoutProbe);
 const layouts=[];
 for(const partial of [false,true]){
  const raw=await page.evaluate(partial=>{
   const ctx=document.getElementById('et_canvas').getContext('2d');window.__KD_LAYOUT.reset();
   const clip=(x,y,w,h,draw)=>{ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();draw();ctx.restore();};
   const header=(row,y,h,baseline)=>clip(0,y,39,h,()=>{ctx.font='12px ET-HEADERS-FONT';ctx.fillText(String(row),10,baseline);});
   const cell=(col,y,h,text,baseline)=>clip(40+70*col,y,69,h,()=>{ctx.font='12px Arial';ctx.fillText(text,44+70*col,baseline);});
   for(let i=0;i<19;i++)clip(40+i*70,0,69,23,()=>{ctx.font='12px ET-HEADERS-FONT';ctx.fillText(String.fromCharCode(65+i),45+i*70,16);});
   const y=partial?24:62;
   clip(0,62,1435,552,()=>{header(50,y,103,y+51);cell(0,y,103,'Product-50',y+51);cell(3,y,103,'40.0',y+51);});
   clip(0,24,1435,38,()=>{header(1,24,37,47);cell(0,24,37,'名称',47);});
   return window.__KD_LAYOUT.snapshot();
  },partial);
  const layout=decodeLayout(raw);layouts.push(layout);assert.equal(layout.cells.find(c=>c.address==='A1').text,'名称');
  assert.equal(layout.completeRows.includes(50),!partial);assert.equal(layout.cells.some(c=>c.row===50),!partial);
 }
 const combined=combineLayouts(layouts,'S50');assert.equal(combined.rows[49].cells.A,'Product-50');assert.equal(combined.rows[49].cells.D,'40.0');assert.deepEqual(combined.coverage.conflicts,[]);
});

test('navigation requires focus acknowledgement, retries a delayed handler, and refuses a mere address echo',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.setContent('<input class="edit-box" value="A1"><input class="edit-proxy-runs">');
 await page.evaluate(()=>{window.fixture={ready:false,enters:0};const input=document.querySelector('.edit-box'),editor=document.querySelector('.edit-proxy-runs');input.addEventListener('keydown',e=>{if(e.key==='Enter'){window.fixture.enters++;if(window.fixture.ready)editor.focus();}});setTimeout(()=>window.fixture.ready=true,100);editor.addEventListener('keydown',e=>{if(e.key==='End'&&e.metaKey)input.value='S215';});});
 await goTo(page,'A93');assert.equal(await page.evaluate(()=>window.fixture.enters),2);assert.equal(await usedEnd(page),'S215');
 await page.evaluate(()=>window.fixture.ready=false);await assert.rejects(goTo(page,'A100'),e=>e.code==='KDOCS_NAVIGATION_UNVERIFIED');assert.equal(await page.locator('.edit-box').inputValue(),'A100');
});
