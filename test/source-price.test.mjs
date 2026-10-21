import test from 'node:test';import assert from 'node:assert/strict';
import {sourcePrice} from '../shared/source-price.mjs';
test('来源明确标价与不单卖成本可识别，保留原文由调用方展示',()=>{
 for(const [raw,kind,price]of [['90.0','cost',90],['20（不单卖）','cost',20],['销售价320','suggested',320],['销售价300','suggested',300],['库存少，最低销售价250','suggested',250],['最低销售价800\n运费150AED','suggested',800],['建议售价：19.90 AED','suggested',19.9]])assert.deepEqual(sourcePrice(raw,kind),{value:price,issue:null});
});
test('价格区间不猜端点，运费和任意注释不提取成售价',()=>{
 for(const raw of ['260-280','260–280','260～280']){const r=sourcePrice(raw);assert.equal(r.value,null);assert.match(r.issue,/区间/);}
 for(const raw of ['',null,'运费150AED','abc320def','NaN','250+运费150',Infinity,-5,'销售价320/300'])assert.equal(sourcePrice(raw).value,null);
});
