import test from 'node:test';
import assert from 'node:assert/strict';
import {googleMapsSearchUrl} from '../src/orders/google-maps-link.mjs';

test('Google Maps地址核对链接只使用明确地址组件并正确编码',()=>{const url=new URL(googleMapsSearchUrl({street:'Fictional Street شارع',residence:'Unit 8',doorNumber:'D-2',city:'Example City',province:'Example Province',postalCode:'00000',country:'Example Country'}));assert.equal(url.origin,'https://www.google.com');assert.equal(url.pathname,'/maps/search/');assert.equal(url.searchParams.get('api'),'1');assert.equal(url.searchParams.get('query'),'Fictional Street شارع, Unit 8, D-2, Example City, Example Province, 00000, Example Country');});
test('空地址和超长地址不会打开Google Maps',()=>{assert.throws(()=>googleMapsSearchUrl({}),/没有可用于/);assert.throws(()=>googleMapsSearchUrl({street:'x'.repeat(2100)}),/过长/);});
