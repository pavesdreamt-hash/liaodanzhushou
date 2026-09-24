import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ShopPlusConnection,buildShopPlusRequest,signShopPlusParameters} from '../src/orders/shopplus-api.mjs';
import {migrateOrderDatabase} from '../src/orders/database.mjs';
import {OrderAppService} from '../src/orders/order-app-service.mjs';
import {createCostCatalog} from '../src/orders/cost-catalog.mjs';

const fakeStorage={isEncryptionAvailable:async()=>true,encryptString:async value=>Buffer.from(value),decryptString:async value=>Buffer.from(value).toString('utf8')};
const rawOrder=(number='SHOPPLUS-FICTIONAL-1')=>({id:'10001',orderNo:number,orderName:'7',shopId:'86885',status:1,fulfillmentStatus:0,currency:'AED',email:'fictional@example.invalid',phone:'+000000001',createTime:'2026-09-22 10:30:00',updateTime:'2026-09-22 10:31:00',payTime:'2026-09-22 10:30:10',gateway:'Fictional Gateway',sourceName:'web',domain:'example.invalid',payTotalAmount:'55.00',payItemAmount:'50.00',itemsAmount:'50.00',discountsAmount:'0.00',payTaxAmount:'0.00',tipAmount:'0.00',orderShipping:{payShipAmount:'5.00'},shippingAddress:{firstName:'Fictional',lastName:'Buyer',phone:'+000000001',country:'Example Country',province:'Example Province',city:'Example City',address1:'Fictional Street',address2:'Fictional Residence',zip:'00000'},billingAddress:{firstName:'Fictional',lastName:'Buyer',phone:'+000000001',country:'Example Country',province:'Example Province',city:'Example City',address1:'Fictional Street',address2:'Fictional Residence',zip:'00000'},orderItems:[{id:'20001',productId:'30001',variantId:'40001',title:'YB17 Fictional Product',quantity:1,skuCode:'YB17',variantPrice:'50.00',saleAmount:'50.00',payAmount:'50.00',financialStatus:'Paid',fulfillmentStatus:'Pending'}],fulfillments:[]});

test('ShopPlus 签名遵循参数排序，并且请求体不包含 API Secret',async()=>{
  const signed=signShopPlusParameters({timestamp:'2026-09-22 10:30:00',name:'Order.list',data:'%7B%7D',version:'1.0',app_key:'fictional-app-key'},'fictional-secret');
  assert.match(signed,/^[A-F0-9]{32}$/);
  const request=buildShopPlusRequest({appKey:'fictional-app-key',secret:'fictional-secret',name:'Order.list',timestamp:'2026-09-22 10:30:00',data:{limit:1,page:1,orderStatus:-2}});
  assert.equal(request.name,'Order.list');assert.equal(request.version,'1.0');assert.equal(request.data,encodeURIComponent(JSON.stringify({limit:1,page:1,orderStatus:-2})));assert.equal(JSON.stringify(request).includes('fictional-secret'),false);
  const directory=await mkdtemp(path.join(os.tmpdir(),'shopplus-api-'));let received;
  try{
    const connection=new ShopPlusConnection({userDataPath:directory,safeStorage:fakeStorage,promptCredential:async label=>label==='ShopPlus App Key'?'fictional-app-key':'fictional-secret',now:()=>new Date('2026-09-22T10:30:00Z'),fetchImpl:async(_url,options)=>{received=JSON.parse(options.body);return {ok:true,json:async()=>({code:'0',data:{orders:[]}})};}});
    const configured=await connection.configure();assert.equal(configured.canceled,false);await connection.verify();assert.equal(received.name,'Order.list');assert.equal(received.app_key,'fictional-app-key');assert.equal(JSON.stringify(received).includes('fictional-secret'),false);assert.equal((await connection.status()).test.status,'verified');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('ShopPlus API 同步按订单区分重复商品编号，缺成本保留待核对而不用零替代',async t=>{
  const database=new DatabaseSync(':memory:');migrateOrderDatabase(database);t.after(()=>database.close());
  const app=new OrderAppService({database,userDataPath:'/fictional',clock:()=>new Date('2026-09-22T12:00:00Z'),costCatalogLoader:async()=>createCostCatalog([]),beforeCommit:async()=>{}}),order=rawOrder(),sameItemIdDifferentOrder=rawOrder('SHOPPLUS-FICTIONAL-2');
  // Real ShopPlus payloads can repeat an item id in different orders. This must
  // not turn a valid whole-batch sync into a SQLite unique-index failure.
  sameItemIdDifferentOrder.orderItems[0].id=order.orderItems[0].id;
  const first=await app.syncShopPlusApiOrders({orders:[order,sameItemIdDifferentOrder],fetchedAt:'2026-09-22T12:00:00.000Z'});assert.deepEqual({fetched:first.fetched,imported:first.imported,existing:first.existing,blocked:first.blocked},{fetched:2,imported:2,existing:0,blocked:0});
  const stored=database.prepare('SELECT source,shopplus_order_no,order_total FROM orders WHERE shopplus_order_no=?').get(order.orderNo),itemReferences=database.prepare('SELECT shopplus_sub_order_id,unit_cost_snapshot,needs_review FROM order_items ORDER BY shopplus_sub_order_id').all().map(row=>({...row}));assert.deepEqual({...stored},{source:'shopplus_api',shopplus_order_no:order.orderNo,order_total:5500});assert.deepEqual(itemReferences,[{shopplus_sub_order_id:'SHOPPLUS-FICTIONAL-1::20001::1',unit_cost_snapshot:null,needs_review:1},{shopplus_sub_order_id:'SHOPPLUS-FICTIONAL-2::20001::1',unit_cost_snapshot:null,needs_review:1}]);
  const orderId=database.prepare('SELECT id FROM orders WHERE shopplus_order_no=?').get(order.orderNo).id,customerConfirmed=app.confirmCustomerInformation({orderId,note:'fictional customer profile confirmation'});assert.ok(customerConfirmed.customerInformationConfirmedAt);
  const corrected=app.correctOrderStatus({orderId,status:'outbound_processing',reason:'fictional fulfillment status correction'});assert.equal(corrected.trackingStatus,'outbound_processing');assert.equal(database.prepare("SELECT COUNT(*) count FROM order_events WHERE order_id=? AND event_type='package_status_corrected'").get(orderId).count,1);
  const again=await app.syncShopPlusApiOrders({orders:[order,sameItemIdDifferentOrder],fetchedAt:'2026-09-22T12:05:00.000Z'});assert.deepEqual({imported:again.imported,existing:again.existing,blocked:again.blocked},{imported:0,existing:2,blocked:0});assert.equal(database.prepare('SELECT COUNT(*) count FROM orders').get().count,2);assert.equal(database.prepare("SELECT COUNT(*) count FROM order_events WHERE event_type='shopplus_api_imported'").get().count,2);
});

test('本机订单编辑可添加、删除商品并重算数量、单价和订单金额',async t=>{
  const database=new DatabaseSync(':memory:');migrateOrderDatabase(database);t.after(()=>database.close());
  const app=new OrderAppService({database,userDataPath:'/fictional',clock:()=>new Date('2026-09-23T12:00:00Z'),costCatalogLoader:async()=>createCostCatalog([]),beforeCommit:async()=>{}}),synced=await app.syncShopPlusApiOrders({orders:[rawOrder('SHOPPLUS-EDIT-FICTIONAL')],fetchedAt:'2026-09-23T12:00:00.000Z'}),orderId=database.prepare('SELECT id FROM orders WHERE shopplus_order_no=?').get('SHOPPLUS-EDIT-FICTIONAL').id,first=app.detail({id:orderId}),packageId=first.packages[0].id,original=first.items[0];
  assert.equal(synced.imported,1);
  const added=app.editOrder({orderId,status:'outbound_processing',reason:'fictional customer corrected quantity and price',items:[{id:original.id,productName:original.productName,businessCode:original.businessCode,packageId,quantity:'2',unitActualPrice:'45.50'},{productName:'Extra Fictional Product',businessCode:'EXTRA-01',packageId,quantity:'1',unitActualPrice:'10.00'}]});
  assert.equal(added.items.length,2);assert.equal(added.amounts.orderTotal,10100);assert.deepEqual(added.items.map(item=>({code:item.businessCode,quantity:item.quantity,price:item.unitActualPriceFils})),[{code:'YB17',quantity:2,price:4550},{code:'EXTRA-01',quantity:1,price:1000}]);
  const remaining=added.items.find(item=>item.businessCode==='EXTRA-01');
  const removed=app.editOrder({orderId,status:'outbound_processing',reason:'fictional customer removed the first product',items:[{id:remaining.id,productName:remaining.productName,businessCode:remaining.businessCode,packageId,quantity:'3',unitActualPrice:'11.00'}]});
  assert.equal(removed.items.length,1);assert.equal(removed.items[0].quantity,3);assert.equal(removed.items[0].unitActualPriceFils,1100);assert.equal(removed.amounts.orderTotal,3300);assert.equal(database.prepare('SELECT count(*) count FROM order_items WHERE order_id=?').get(orderId).count,1);assert.equal(database.prepare("SELECT count(*) count FROM order_events WHERE order_id=? AND event_type='order_items_edited'").get(orderId).count,2);
});
