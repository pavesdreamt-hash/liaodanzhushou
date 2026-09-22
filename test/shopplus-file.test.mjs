import test from 'node:test';
import assert from 'node:assert/strict';
import {shopPlusExtension,validateShopPlusUpload} from '../src/orders/shopplus-file.mjs';

test('ShopPlus上传按扩展名和实际文件签名接收xlsx、xls、csv',()=>{
  assert.equal(shopPlusExtension('orders.XLSX'),'.xlsx');
  assert.equal(validateShopPlusUpload('orders.xlsx',Buffer.from([0x50,0x4b,0x03,0x04])),'.xlsx');
  assert.equal(validateShopPlusUpload('orders.xls',Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])),'.xls');
  assert.equal(validateShopPlusUpload('orders.csv',Buffer.from('\uFEFF订单号,商品名称\nTEST,KY02','utf8')),'.csv');
});

test('ShopPlus上传拒绝改后缀的伪xlsx、伪xls、二进制csv及其他格式',()=>{
  assert.throws(()=>validateShopPlusUpload('orders.xlsx',Buffer.from('plain text')),error=>error.code==='SHOPPLUS_XLSX_INVALID');
  assert.throws(()=>validateShopPlusUpload('orders.xls',Buffer.from('plain text')),error=>error.code==='SHOPPLUS_XLS_INVALID');
  assert.throws(()=>validateShopPlusUpload('orders.csv',Buffer.from([0x41,0x00,0x42,0x00])),error=>error.code==='SHOPPLUS_CSV_INVALID');
  assert.throws(()=>shopPlusExtension('orders.ods'),error=>error.code==='SHOPPLUS_FILE_TYPE_UNSUPPORTED');
});
