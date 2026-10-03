import test from 'node:test';
import assert from 'node:assert/strict';
import {projectChatProductCatalog} from '../src/orders/chat-product-catalog.mjs';

const cachedImage={status:'cached',sourceUrl:'https://images.example.invalid/private.jpg',file:'shopplus-private.jpg',sourceName:'rose-card.png',mimeType:'image/png',dataUrl:'data:image/png;base64,eA=='};
const active={remoteProductId:'fictional-rose-1',name:'Rose Gift Box',sourceName:'Original Rose Gift',productNumber:'SP-ROSE-001',sourceSpu:'RS-001',publishStatus:1,stockKnown:true,stockQuantity:7,websitePriceAed:129.5,costPriceAed:51,suggestedPriceAed:169,floorPriceAed:99,sourcePricing:{sourceStock:'有货'},image:cachedImage};
const inactive={remoteProductId:'fictional-hidden',name:'Hidden product',productNumber:'SP-HIDDEN',sourceSpu:'HIDDEN',publishStatus:0,stockKnown:true,stockQuantity:4,websitePriceAed:88,image:cachedImage};
const archived={remoteProductId:'fictional-archived',name:'Archived product',productNumber:'SP-ARCHIVED',sourceSpu:'ARCHIVED',publishStatus:1,stockKnown:true,stockQuantity:8,websitePriceAed:66,image:cachedImage};
const fixture=()=>({products:[active,inactive],archivedProducts:[archived],lastSuccessfulReadAt:'2026-09-30T01:02:03.000Z'});

test('chat product search reads only active local products and exposes a narrow field projection',()=>{
  const view=fixture(),before=JSON.stringify(view),result=projectChatProductCatalog(view,{query:'rs 001'});
  assert.deepEqual(result.lastSuccessfulReadAt,'2026-09-30T01:02:03.000Z');
  assert.equal(result.products.length,1);
  assert.deepEqual(result.products[0],{
    remoteProductId:'fictional-rose-1',name:'Rose Gift Box',productNumber:'SP-ROSE-001',sourceSpu:'RS-001',stockKnown:true,stockQuantity:7,sourceStock:'有货',websitePriceAed:129.5,costPriceAed:51,suggestedPriceAed:169,floorPriceAed:99,image:{status:'cached'}
  });
  assert.equal(JSON.stringify(view),before,'the read-only projection must not mutate the loaded catalog view');
  assert.equal(projectChatProductCatalog(view,{query:'archived'}).products.length,0,'archivedProducts must never be a chat source');
  assert.equal(projectChatProductCatalog(view,{query:'hidden'}).products.length,0,'inactive products are not selectable in chat');
});

test('only an explicitly selected current product can expose its already cached image bytes',()=>{
  const view=fixture();
  const searched=projectChatProductCatalog(view,{query:'rose'}).products[0];
  assert.equal(Object.hasOwn(searched.image,'dataUrl'),false);
  const selected=projectChatProductCatalog(view,{remoteProductId:'fictional-rose-1',includeImage:true}).products[0];
  assert.deepEqual(selected.image,{status:'cached',dataUrl:'data:image/png;base64,eA==',mimetype:'image/png',filename:'rose-card.png'});
  assert.equal(Object.hasOwn(selected.image,'sourceUrl'),false);
  assert.equal(Object.hasOwn(selected.image,'file'),false);
  assert.equal(projectChatProductCatalog(view,{remoteProductId:'fictional-hidden',includeImage:true}).products.length,0);
  assert.equal(projectChatProductCatalog(view,{remoteProductId:'fictional-archived',includeImage:true}).products.length,0);
});

test('image bytes are withheld when the local cache has no permitted image data URL',()=>{
  const view=fixture();
  view.products[0]={...active,image:{...cachedImage,dataUrl:'https://images.example.invalid/not-local.jpg'}};
  const selected=projectChatProductCatalog(view,{remoteProductId:'fictional-rose-1',includeImage:true}).products[0];
  assert.deepEqual(selected.image,{status:'unavailable'});
  assert.throws(()=>projectChatProductCatalog(view,{includeImage:true}),/选择商品后/);
  assert.throws(()=>projectChatProductCatalog(view,{remoteProductId:{bad:true}}),/商品选择无效/);
});

test('a cached GIF is not advertised as a sendable chat image',()=>{
  const view=fixture();
  view.products[0]={...active,image:{...cachedImage,dataUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}};
  const selected=projectChatProductCatalog(view,{remoteProductId:'fictional-rose-1',includeImage:true}).products[0];
  assert.deepEqual(selected.image,{status:'unavailable'});
});
