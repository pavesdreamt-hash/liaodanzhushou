import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,sanitize,geometry,resizePhone,replyGeometry} from '../ui/src/order-layout-model.ts';
test('phone remains tall when window is short, fonts do not depend on viewport',()=>{
 for(const [w,h] of [[1024,1000],[1280,820],[1440,1000],[1920,1080],[820,640]]){
  const p=defaults(w,h),g=geometry(p,w);assert.equal(p.navFont,15);assert.equal(p.contentFont,15);assert.equal(p.chatFont,13);assert(Math.abs(g.phoneHeight/g.phoneWidth-2.1)<.005);assert(g.phoneHeight>=588);
 }
});
test('locked vertical resizing obeys ratio while unlocked height is independent',()=>{
 const p=defaults(1440,1000),vertical=resizePhone(p,p.phoneWidth,900,'height');assert(Math.abs(vertical.phoneHeight/vertical.phoneWidth-p.ratio)<.005);
 const free=resizePhone({...p,locked:false},400,900,'both');assert.equal(free.phoneWidth,400);assert.equal(free.phoneHeight,900);
 const resized=geometry({...p,phoneWidth:650,navWidth:340},1024);assert(resized.phoneWidth<=650);assert(resized.nav+resized.phoneWidth+resized.contentMin+72<=1024);
});
test('malformed and out-of-range stored settings fall back or clamp',()=>{
 const d=defaults(1280,820);assert.deepEqual(sanitize(null,d),d);const p=sanitize({phoneWidth:Infinity,chatFont:500,navWidth:'wide',locked:'false'},d);assert.equal(p.phoneWidth,d.phoneWidth);assert.equal(p.chatFont,20);assert.equal(p.navWidth,d.navWidth);assert.equal(p.locked,true);
});
test('reply split preserves a minimum chat area and migrates old screen preferences',()=>{
 assert.deepEqual(replyGeometry(900,450),{min:180,max:350,height:350});
 assert.equal(replyGeometry(50,700).height,180);
 const old={...defaults(1280,820),chatFont:16};delete old.composerHeight;
 const restored=sanitize(old,defaults(1280,820));assert.equal(restored.composerHeight,280);assert.equal(restored.chatFont,16);
});
