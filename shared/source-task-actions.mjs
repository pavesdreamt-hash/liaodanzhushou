const name=value=>String(value||'').normalize('NFKC').trim();
// Rows already carry the service's unique, confirmed mapping checks. A shared
// name in the website catalogue alone must never establish a relationship.
export function sourceTaskWebsiteRow(task,rows=[]){
  const source=task.current||task.after||task.before,matched=rows.filter(row=>name(row.name)===name(source?.sourceName));
  const row=matched[0];return source?.sourceName&&matched.length===1&&row.id&&row.businessId&&row.sourceFingerprint&&!row.blocked?row:null;
}
export function sourceTaskDisplay(task,row){
  if(!row)return task;
  return {...task,current:{...(task.current||task.after||task.before),...row.source,sourceName:row.name,sourceRow:row.sourceRow,businessId:row.businessId},businessId:row.businessId,remoteProductId:row.id,website:{name:row.websiteName||row.name,publishStatus:row.publishStatus,stockKnown:row.stockKnown,stockQuantity:row.stockQuantity,websitePriceAed:row.websitePriceAed,priceComplete:row.priceReady},localWebsiteAt:row.readAt||row.priceReadAt||row.catalogReadAt,priceAction:{guard:row.guard,accepted:row.priceAccepted,target:row.acceptedPriceAed}};
}
export function sourceTaskOperationReason(row,kind){
  if(!row)return '请先确认唯一的网站商品对应，并读取商品资料';
  if(row.blocked)return row.blocked;
  if(kind==='price')return !row.validVariants||!row.priceReady?'请先读取有效的网站规格售价':'';
  if(kind==='stock')return row.sourceStock!=='有货'?'来源无货或未知，按现有规则不修改网站库存':!row.validVariants||row.variants.some(v=>v.stockQuantity===null)?'请先读取有效的网站规格库存':'';
  const target=kind==='publish'?1:0;
  if(row.publishStatus===target)return target===1?'网站已经上架':'网站已经下架';
  if(![0,1].includes(row.publishStatus))return '网站上下架状态未知，请先读取商品记录';
  if(row.listingTarget!==target)return target===1?'来源无货或未知，暂不能上架':'来源有货或未知，不在待下架范围';
  if(target===1&&(!row.validVariants||row.variants.some(v=>v.stockQuantity===null)||!row.variants.some(v=>v.stockQuantity>0)))return '请先读取规格并补充网站库存，再上架';
  return '';
}

// Manual single-product controls follow the website state. Source availability
// remains advice; the source-driven task queue above keeps its own restrictions.
export function manualProductListingReason(row,kind){
  if(!row?.remoteProductId)return '尚未同步网站，请先关联已有网站商品或导入网站';
  if(row.blocked)return row.blocked;
  if(![0,1].includes(row.publishStatus))return '网站上下架状态未知，请先读取商品记录';
  if(row.publishStatus===(kind==='publish'?1:0))return kind==='publish'?'网站已上架，无需重复上架':'网站已下架，无需重复下架';
  return '';
}
export function manualProductListingWarning(row,kind){
  const stock=row.sourceStock||row.source?.stock;
  return kind==='publish'?(stock==='无货'?'来源当前无货，本次仍将人工上架网站商品，请确认。':stock!=='有货'?'来源有货状态尚未确认，本次将人工上架，请确认。':''):(stock==='有货'?'来源当前有货，本次仍将人工下架网站商品，请确认。':stock!=='无货'?'来源状态尚未确认，本次将人工下架，请确认。':'');
}
