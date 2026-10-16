import test from 'node:test';
import assert from 'node:assert/strict';
import {websitePriceGuard} from '../ui/src/website-price-guard.ts';
test('建议100：网站119.99提醒，120或以上符合；不使用手动底价或成本代替建议价',()=>{
  const product={suggestedPriceAed:100,websitePriceAed:119.99,costPriceAed:10,floorPriceAed:1};
  const guard=websitePriceGuard(product);assert.equal(guard.status,'low');assert.equal(guard.minimumFils,12000);assert.equal(guard.shortfallFils,1);assert.match(guard.message,/AED 100\.00.*AED 120\.00/);assert.match(guard.message,/请到网站后台修改/);
  assert.equal(websitePriceGuard({...product,websitePriceAed:120}).status,'ok');assert.equal(websitePriceGuard({...product,websitePriceAed:130}).status,'ok');assert.equal(product.websitePriceAed,119.99);
});
test('AED分币边界精确比较，不因浮点误差把相等误报为低价',()=>{
  assert.equal(websitePriceGuard({suggestedPriceAed:100.1,websitePriceAed:120.1}).status,'ok');
  assert.equal(websitePriceGuard({suggestedPriceAed:'100.01',websitePriceAed:'120.00'}).shortfallFils,1);
  assert.equal(websitePriceGuard({suggestedPriceAed:'100.01',websitePriceAed:'120.01'}).status,'ok');
  assert.equal(websitePriceGuard({suggestedPriceAed:0.29,websitePriceAed:20.29}).status,'ok');
});
test('数字0仍参与价格约束，空白、缺失、负数和无效价格只标为待核对',()=>{
  const zero=websitePriceGuard({suggestedPriceAed:0,websitePriceAed:0});assert.equal(zero.status,'low');assert.equal(zero.minimumFils,2000);
  for(const invalid of [null,undefined,'','   ','未知',-1,'-1',NaN,Infinity,true,'100 AED','100.999']){
    assert.equal(websitePriceGuard({suggestedPriceAed:invalid,websitePriceAed:120}).status,'unknown',String(invalid));
    assert.equal(websitePriceGuard({suggestedPriceAed:100,websitePriceAed:invalid}).status,'unknown',String(invalid));
  }
  assert.equal(websitePriceGuard({suggestedPriceAed:Number.MAX_SAFE_INTEGER,websitePriceAed:100}).status,'unknown');
});
test('提醒随已保存网站价或建议价更新，查询不修改商品或网站上下架/库存',()=>{
  const product={suggestedPriceAed:100,websitePriceAed:110,publishStatus:1,stockQuantity:5},saved=structuredClone(product);
  assert.equal(websitePriceGuard(product).status,'low');assert.deepEqual(product,saved);
  assert.equal(websitePriceGuard({...product,websitePriceAed:120}).status,'ok');
  assert.equal(websitePriceGuard({...product,websitePriceAed:120,suggestedPriceAed:110}).status,'low');
  assert.equal(websitePriceGuard({...product,publishStatus:0,stockQuantity:0}).status,'low');
});
