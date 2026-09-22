import test from 'node:test';
import assert from 'node:assert/strict';
import {openOrderDatabase} from '../src/orders/database.mjs';
import {OrderRepository} from '../src/orders/order-repository.mjs';
import {OrderService} from '../src/orders/order-service.mjs';
import {OrderAppService,extractAedPrice} from '../src/orders/order-app-service.mjs';

const item=(sku,status='signed')=>({sku_code:sku,product_name_snapshot:`Fictional ${sku}`,quantity:1,unit_list_price:'50',unit_actual_price:'50',unit_cost_snapshot:'10',package_status:status});
const input=(orderNo,items)=>({source:'manual',shopplus_order_no:orderNo,shopplus_created_at:'2026-09-20T04:00:00.000Z',currency:'AED',order_status:'new',delivery_status:'unshipped',payment_method:'COD',customer_full_name:'Fictional Customer',customer_phone:'+971500000001',country:'UAE',city:'Dubai',street:'Fictional Street',residence:'Fictional Building',items});

test('1.0.0经营数据迁移保存商品资料和多币种每日成本',async t=>{
  const database=await openOrderDatabase({databaseFile:':memory:'});t.after(()=>database.close());
  const app=new OrderAppService({database,clock:()=>new Date('2026-09-20T08:00:00.000Z')});
  const profile=app.saveProductProfile({businessId:'ky02',displayName:'Fictional Product',category:'Demo',websiteUrl:'https://example.invalid/products/ky02',actualPrice:'75',chatEnabled:true,imagePaths:['/tmp/fictional.webp']});
  assert.equal(profile.businessId,'KY02');assert.equal(profile.actualPriceFils,7500);assert.deepEqual(profile.imagePaths,['/tmp/fictional.webp']);
  app.syncInventoryProducts([{businessId:'KY02',cost:'20',suggestedPrice:'85',stock:'无货'}]);const synced=app.productProfiles()[0];assert.equal(synced.sourceCost,'20');assert.equal(synced.suggestedPrice,'85');assert.equal(synced.inventoryStatus,'无货');
  app.saveDailyCosts({day:'2026-09-20',adUsd:'10',usdCnyRate:'7',accountCostCny:'20'});
  const row=app.profitDashboard({}).rows[0];assert.equal(row.adUsdCents,1000);assert.equal(row.adCostCnyFen,7000);assert.equal(row.accountCostCnyFen,2000);
});

test('网站售价检查只生成待确认变化，人工采用后才覆盖实际售价',async t=>{
  assert.equal(extractAedPrice('<script type="application/ld+json">{"@type":"Product","offers":{"priceCurrency":"AED","price":"79.50"}}</script>'),7950);
  const database=await openOrderDatabase({databaseFile:':memory:'});t.after(()=>database.close());
  const fetchImpl=async()=>({ok:true,status:200,text:async()=>'<meta property="product:price:amount" content="82.00">'}),app=new OrderAppService({database,fetchImpl,clock:()=>new Date('2026-09-20T08:00:00.000Z')});
  app.saveProductProfile({businessId:'KY02',websiteUrl:'https://example.invalid/ky02',actualPrice:'75'});
  const checked=await app.checkProductPrices({businessId:'KY02'});assert.equal(checked.pending,1);let profile=app.productProfiles()[0];assert.equal(profile.actualPriceFils,7500);assert.equal(profile.pendingPriceFils,8200);
  profile=app.confirmProductPrice({businessId:'KY02',decision:'accept'});assert.equal(profile.actualPriceFils,8200);assert.equal(profile.pendingPriceFils,null);
});

test('应用锁只保存加盐哈希并在新会话要求正确密码',async t=>{
  const database=await openOrderDatabase({databaseFile:':memory:'});t.after(()=>database.close());
  const first=new OrderAppService({database});assert.deepEqual(first.appLockStatus(),{enabled:false,requiresUnlock:false});first.configureAppLock({enabled:true,password:'fictional-824'});const stored=database.prepare("SELECT value FROM app_preferences WHERE key='app_lock'").get().value;assert.equal(stored.includes('fictional-824'),false);assert.equal(first.appLockStatus().requiresUnlock,false);
  const restarted=new OrderAppService({database});assert.equal(restarted.appLockStatus().requiresUnlock,true);assert.throws(()=>restarted.unlockApp({password:'wrong-password'}),/不正确/);assert.equal(restarted.unlockApp({password:'fictional-824'}).requiresUnlock,false);restarted.configureAppLock({enabled:false,currentPassword:'fictional-824'});assert.equal(restarted.appLockStatus().enabled,false);
});

test('库存无货在订单详情和TXT后端校验中阻止发货',async t=>{
  const database=await openOrderDatabase({databaseFile:':memory:'});t.after(()=>database.close());
  const service=new OrderService(new OrderRepository(database)),created=service.createOrder(input('OUT-OF-STOCK-824',[item('KY02')])),app=new OrderAppService({database});
  app.syncInventoryProducts([{businessId:'KY02',cost:'10',suggestedPrice:'75',stock:'无货'}]);
  const listRow=app.list({}).find(row=>row.id===created.id);assert.equal(listRow.outOfStock,true);assert.equal(listRow.needsReview,true);
  const detail=app.detail({id:created.id});assert.deepEqual(detail.outOfStockItems.map(row=>row.businessId),['KY02']);assert.equal(detail.report.readiness.ok,false);assert.equal(detail.report.readiness.checks.find(row=>row.key==='inventory').ok,false);
  const preview=app.previewPackageTxt({packageId:created.packages[0].id});assert.equal(preview.ok,false);assert.equal(preview.problems.some(row=>row.code==='REPORT_INVENTORY_BLOCKED'),true);
});

test('真实收益不重复累计多包裹运费且不扣商品账面成本',async t=>{
  const database=await openOrderDatabase({databaseFile:':memory:'});t.after(()=>database.close());
  const clock=()=>new Date('2026-09-20T08:00:00.000Z'),service=new OrderService(new OrderRepository(database),{clock}),created=service.createOrder(input('PROFIT-MULTI',[item('KY02','signed'),item('YB17','refused')])),app=new OrderAppService({database,clock});
  app.confirmOrder({orderId:created.id});
  for(const parcel of created.packages)app.confirmPackageFee({packageId:parcel.id,amountAed:'5'});
  app.recordRemittance({orderId:created.id,amountCny:'100',registeredAt:'2026-09-20'});
  app.saveDailyCosts({day:'2026-09-20',adUsd:'10',usdCnyRate:'7',accountCostCny:'20'});
  const dashboard=app.profitDashboard({}),row=dashboard.rows.find(value=>value.day==='2026-09-20');
  assert.equal(row.shippingAedFils,1000);assert.equal(row.shippingCnyFen,1800);assert.equal(row.remittanceCnyFen,10000);assert.equal(row.realProfitCnyFen,-800);
  const detail=app.dailyProfit({day:'2026-09-20'});assert.equal(detail.orders.length,1);assert.equal(detail.orders[0].shippingAedFils,1000);assert.equal(detail.orders[0].contributionCnyFen,8200);
});

test('无履约订单进入回收站可恢复和永久删除，有履约记录订单只能作废',async t=>{
  const database=await openOrderDatabase({databaseFile:':memory:'});t.after(()=>database.close());
  let tick=0;const app=new OrderAppService({database,clock:()=>new Date(1758355200000+tick++),tokenFactory:()=>`event-${tick}-${Math.random()}`});
  const draft=app.drafts.create({requestId:'fictional-draft-824'});
  assert.equal(app.removeOrder({orderId:draft.id}).state,'recycle');assert.equal(app.list({}).length,0);assert.equal(app.list({lifecycle:'removed'})[0].lifecycleState,'recycle');
  app.restoreOrder({orderId:draft.id});assert.equal(app.list({})[0].id,draft.id);
  app.removeOrder({orderId:draft.id});assert.equal(app.permanentlyDeleteOrder({orderId:draft.id,confirmed:true}).deleted,true);assert.equal(app.detail({id:draft.id}),null);
  const created=new OrderService(new OrderRepository(database)).createOrder(input('VOID-824',[item('KY02')]));app.confirmOrder({orderId:created.id});
  assert.equal(app.removeOrder({orderId:created.id}).state,'void');assert.throws(()=>app.permanentlyDeleteOrder({orderId:created.id,confirmed:true}),/只有无履约记录/);assert.equal(app.list({lifecycle:'removed'})[0].lifecycleState,'void');
});
