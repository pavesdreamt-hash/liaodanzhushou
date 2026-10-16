import {assignSourceKeys,normalizedSourceName,sourceModel} from '../mapping/source-key.mjs';
import {coreText} from '../../shared/text.mjs';
import {stableHash} from '../core/files.mjs';

export const sourceRows=product=>[...new Set((product?.sourceRows?.length?product.sourceRows.map(row=>Number(typeof row==='number'?row:row.sourceRow)):[Number(product?.sourceRow)]).filter(row=>Number.isSafeInteger(row)&&row>0))].sort((a,b)=>a-b);
const name=value=>(normalizedSourceName(value)||coreText(value).normalize('NFKC').toLowerCase()).replace(/\([^)]*[a-z]{1,8}\d[a-z0-9-]*[^)]*\)/gi,'').replace(/\s+/g,'').trim();
// A row number and an occurrence index are positions, never product identities.
export const sameSourceIdentity=(a,b)=>{
  const left=sourceModel(a?.sourceName),right=sourceModel(b?.sourceName);
  return Boolean(name(a?.sourceName)&&name(a?.sourceName)===name(b?.sourceName)&&(!left||!right||left===right));
};
const records=products=>assignSourceKeys((products||[]).filter(row=>coreText(row.sourceName)));
export function matchSourceProducts(beforeProducts,afterProducts){
  const before=records(beforeProducts),after=records(afterProducts),pairs=[],usedBefore=new Set(),usedAfter=new Set();
  for(const current of after){
    const candidates=before.filter(old=>sameSourceIdentity(old,current)),currentPeers=after.filter(peer=>sameSourceIdentity(peer,current));
    if(candidates.length===1&&currentPeers.length===1&&!usedBefore.has(candidates[0])){
      pairs.push({before:candidates[0],after:current});usedBefore.add(candidates[0]);usedAfter.add(current);
    }
  }
  return {before,after,pairs,missing:before.filter(row=>!usedBefore.has(row)),added:after.filter(row=>!usedAfter.has(row))};
}
const mapped=(product,mappings)=>{
  if(!product)return null;
  const all=(mappings||[]).filter(row=>row.businessId&&['正常','来源已移除'].includes(row.status)&&sameSourceIdentity(row,product)),active=all.filter(row=>row.status==='正常'),candidates=active.length?active:all;
  return candidates.length===1?{...product,businessId:candidates[0].businessId}:product;
};
const brief=row=>row?{sourceKey:row.sourceKey,sourceName:row.sourceName,sourceRow:row.sourceRow,sourceRows:sourceRows(row),businessId:row.businessId||null,cost:row.cost??'',suggestedPrice:row.suggestedPrice??'',stock:row.stock??'',additionalInfo:row.additionalInfo??''}:null;
export const changeCounts=rows=>({added:rows.filter(row=>row.kind==='added').length,removed:rows.filter(row=>row.kind==='removed').length,replaced:rows.filter(row=>row.kind==='replacement').length,suspected:rows.filter(row=>row.kind==='suspected').length,stock:rows.filter(row=>row.fields.some(field=>field.field==='stock')).length,price:rows.filter(row=>row.fields.some(field=>['cost','suggestedPrice','websitePriceAed'].includes(field.field))).length,modified:rows.filter(row=>row.kind==='modified').length,moved:rows.filter(row=>row.moved).length,review:rows.filter(row=>row.kind==='review').length});
export function buildSourceChangeReport({previous,snapshot,mappings=[]}){
  const matches=matchSourceProducts(previous?.products,snapshot.products),rows=[],firstBaseline=!previous?.products?.length;
  const add=(kind,before,after,fields=[],extra={})=>{
    const left=brief(mapped(before,mappings)),right=brief(mapped(after,mappings));
    const eventKey=stableHash({kind,before:left,after:right}).slice(0,24);
    rows.push({id:`${snapshot.capturedAt}:${eventKey}`,eventKey,kind,before:left,after:right,fields,moved:Boolean(left&&right&&JSON.stringify(left.sourceRows)!==JSON.stringify(right.sourceRows)),...extra});
  };
  if(firstBaseline)for(const after of matches.after)add('baseline',null,after);
  else{
    for(const pair of matches.pairs){
      const fields=['stock','cost','suggestedPrice','additionalInfo','sourceName'].filter(field=>coreText(pair.before[field])!==coreText(pair.after[field])).map(field=>({field,before:pair.before[field]??'',after:pair.after[field]??''}));
      const moved=JSON.stringify(sourceRows(pair.before))!==JSON.stringify(sourceRows(pair.after));
      if(fields.length||moved)add(fields.length?'modified':'moved',pair.before,pair.after,fields);
    }
    const usedOld=new Set(),usedNew=new Set();
    const ambiguous=row=>matches.before.filter(peer=>sameSourceIdentity(peer,row)).length>1||matches.after.filter(peer=>sameSourceIdentity(peer,row)).length>1;
    // Pair only unique unmatched occupants. The pairing is explicitly a review
    // suggestion; it never authorizes transfer of a website mapping.
    const related=(old,current)=>sourceRows(old).some(row=>sourceRows(current).includes(row))||Boolean(sourceModel(old.sourceName)&&sourceModel(old.sourceName)===sourceModel(current.sourceName));
    for(const old of matches.missing){
      if(ambiguous(old))continue;
      const candidates=matches.added.filter(current=>!ambiguous(current)&&related(old,current));
      if(candidates.length===1&&matches.missing.filter(other=>related(other,candidates[0])).length===1){add('suspected',old,candidates[0],[],{decision:null});usedOld.add(old);usedNew.add(candidates[0]);}
    }
    for(const old of matches.missing)if(!usedOld.has(old))add(ambiguous(old)?'review':'removed',old,null);
    for(const current of matches.added)if(!usedNew.has(current))add(ambiguous(current)?'review':'added',null,current);
  }
  return {schemaVersion:1,id:snapshot.capturedAt,at:snapshot.capturedAt,previousAt:previous?.capturedAt||null,firstBaseline,sheet:snapshot.sheet||'Sheet1',rawRows:snapshot.quality?.rawNamedRows??matches.after.reduce((total,row)=>total+sourceRows(row).length,0),previousRawRows:previous?.quality?.rawNamedRows??(previous?matches.before.reduce((total,row)=>total+sourceRows(row).length,0):null),summary:changeCounts(rows),rows,websiteCheck:'pending',websiteCheckedAt:null};
}
export function taskSeeds(report){
  return report.rows.flatMap(row=>{
    if(row.kind==='moved')return [];
    if(['review','suspected'].includes(row.kind))return [{id:row.id,changeId:row.id,kind:'review',before:row.before,after:row.after,createdAt:report.at,sheet:report.sheet}];
    const seeds=[];
    const prices=(row.fields||[]).filter(field=>['cost','suggestedPrice','websitePriceAed'].includes(field.field));
    if(prices.length)seeds.push({id:row.id+':price',changeId:row.id,kind:'price',before:row.before,after:row.after,fields:prices,createdAt:report.at,sheet:report.sheet});
    if(['removed','replacement'].includes(row.kind))seeds.push({id:row.id+':old',changeId:row.id,kind:'removed',before:row.before,after:null,createdAt:report.at,sheet:report.sheet});
    if(row.after&&(row.kind!=='modified'||row.fields.some(field=>field.field==='stock')))seeds.push({id:row.id+':current',changeId:row.id,kind:row.kind==='baseline'?'unmapped':row.kind==='replacement'?'added':row.kind,...(['added','replacement'].includes(row.kind)?{originKind:'added',newProductPending:true}:{}),before:row.before,after:row.after,createdAt:report.at,sheet:report.sheet});
    return seeds;
  });
}
const normalizedId=value=>coreText(value).normalize('NFKC').toUpperCase().replace(/[\s_-]+/g,'');
export function evaluateSourceTasks({tasks,snapshot,mappings=[],catalog={},websiteCheck='pending',allowAutoResolve=true}){
  const latest=records(snapshot?.products),webByRemote=new Map();
  for(const product of [...(catalog.mappingCatalog||[]),...(catalog.products||[]),...(catalog.archivedProducts||[])]){
    const old=webByRemote.get(product.remoteProductId);
    if(!old||String(product.updatedAt||product.capturedAt||'')>=String(old.updatedAt||old.capturedAt||''))webByRemote.set(product.remoteProductId,product);
  }
  return tasks.map(task=>{
    const reference=task.after||task.before,candidates=latest.filter(row=>sameSourceIdentity(row,reference)),current=candidates.length===1?candidates[0]:null;
    const relation=current?mapped(current,mappings):task.before;
    const ignored=current&&(mappings||[]).some(row=>row.status==='本机已忽略'&&sameSourceIdentity(row,current));
    const businessId=(task.kind==='review'?task.before?.businessId:null)||relation?.businessId||reference?.businessId||null,webCandidates=businessId?[...webByRemote.values()].filter(product=>normalizedId(product.productNumber)===normalizedId(businessId)):[],website=webCandidates.length===1?webCandidates[0]:null;
    const ambiguousRelation=businessId&&(mappings||[]).filter(row=>row.status==='正常'&&normalizedId(row.businessId)===normalizedId(businessId)).length>1;
    const isNew=task.originKind==='added'||task.kind==='added',confirmed=current&&(mappings||[]).filter(row=>row.status==='正常'&&row.businessId&&sameSourceIdentity(row,current));
    const uniqueRelation=confirmed?.length===1&&!ambiguousRelation&&normalizedId(confirmed[0].businessId)===normalizedId(businessId);
    const newProductMatch=isNew&&uniqueRelation&&website?.remoteProductId&&allowAutoResolve&&websiteCheck==='verified'&&snapshot?.quality?.passed===true?{businessId,remoteProductId:website.remoteProductId,at:catalog.mappingCatalogRun?.at||catalog.lastSuccessfulReadAt||new Date().toISOString()}:task.newProductMatch;
    const newProductPending=isNew&&(candidates.length>0||snapshot?.quality?.passed!==true)&&!(uniqueRelation&&newProductMatch?.remoteProductId&&normalizedId(newProductMatch.businessId)===normalizedId(businessId));
    let action='verify',reason='网站状态尚未核对，请完成一键同步。',resolved=false;
    if(task.kind==='price'){action='price';reason='价格发生变化，必须人工核对并确认已查看；来源与网站价格一致也不会自动关闭。';}
    else if(task.kind==='review'){action='review';reason='商品身份待核对；请确认是否替换，或到来源同步与核对页确认对应关系。';}
    else if(ambiguousRelation){action='review';reason='同一网站编号对应多个来源商品，必须先人工更正对应关系。';}
    else if(ignored&&!newProductPending){resolved=true;reason='该来源商品已在本机明确忽略。';}
    else if(task.kind==='removed'&&current){resolved=true;reason='来源商品已重新出现，删除待办已取消。';}
    else if(task.kind!=='removed'&&!current){resolved=true;reason='此待办对应的来源商品已消失，由最新删除／替换记录核对。';}
    else if(websiteCheck!=='verified'){}
    else if(task.kind==='removed'){
      if(!businessId){action='review';reason='来源已删除；原网站对应关系未确认，请人工核对是否需要下架。';}
      else if(!website){action='verify';reason='网站目录未返回原商品，不能确认是否已经下架。';}
      else if(website.publishStatus===1){action='unpublish';reason='来源已删除，原网站商品仍上架，需要人工下架。';}
      else if(website.publishStatus===0){resolved=true;reason='原网站商品已下架，回读确认完成。';}else{reason='原网站商品的上架状态未知，请重新核对。';}
    }else if(!['有货','无货'].includes(coreText(current.stock))){action='review';reason='来源库存状态不明确，请核对原表。';}
    else if(!businessId){
      action=coreText(current.stock)==='有货'?'create':'review';reason=action==='create'?'来源有货；请人工创建或选择网站商品、保存对应关系，并上架。':'来源无货，暂不上架；请确认对应关系或在来源页明确忽略。';
    }else if(!website){action='verify';reason='网站目录未返回对应商品，请重新读取或更正对应关系。';}
    else if(![0,1].includes(website.publishStatus)){action='verify';reason='网站上架状态未知，请重新核对。';}
    else if(coreText(current.stock)==='无货'){
      if(website.publishStatus===1){action='unpublish';reason='来源无货，网站仍上架，需要人工下架。';}else{resolved=true;reason='来源无货，网站已下架。';}
    }else if(!website.stockKnown){action='verify';reason='来源有货，网站库存未知，请先核对库存。';}
    else if(Number(website.stockQuantity)<=0){action='replenish';reason=`来源有货，网站库存为 0，请补具体规格库存${website.publishStatus===0?'后上架':''}。`;}
    else if(website.publishStatus===0){action='publish';reason='来源有货，网站库存大于 0，需要人工上架。';}
    else{resolved=true;reason='来源有货，网站已上架且库存大于 0，回读确认完成。';}
    // Only a newly completed source + website read can prove stock alignment.
    // Cached facts, invalid source quality, and a missing stock quantity cannot.
    if(resolved&&!ignored&&task.kind!=='removed'&&current&&coreText(current.stock)==='有货'&&(!Number.isFinite(Number(website?.stockQuantity))||website?.stockQuantity===null||website?.stockQuantity===undefined)){resolved=false;action='verify';reason='网站库存数量无效或未返回，不能确认完成。';}
    if(resolved&&!ignored&&(!allowAutoResolve||snapshot?.quality?.passed!==true)) {resolved=false;reason='尚未完整回读确认，请刷新核对；也可明确人工确认已处理。';}
    if(newProductPending){resolved=false;if(candidates.length>1){action='review';reason='来源商品身份有歧义，请先核对对应关系。';}else if(!current){action='verify';reason='来源快照尚未完整核对，不能确认商品已消失。';}reason=`新增商品尚未确认网站对应关系；可人工核对后关闭本次提醒。${reason}`;}
    return {...task,...(isNew?{originKind:'added',newProductPending,newProductMatch}:{}),current:brief(current?relation:null),businessId,remoteProductId:website?.remoteProductId||task.remoteProductId||null,website:website?{name:website.name||website.sourceName,publishStatus:website.publishStatus,stockKnown:website.stockKnown,stockQuantity:website.stockQuantity,websitePriceAed:website.websitePriceAed}:null,action,reason,resolved,completion:resolved?{type:ignored?'manual-ignore':'system',at:new Date().toISOString(),reason}:undefined};
  });
}
