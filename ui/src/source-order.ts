const position=(value:any)=>{
  const rows=Array.isArray(value?.sourceRows)?value.sourceRows.map((row:any)=>Number(typeof row==='number'?row:row.sourceRow)):[];
  rows.push(Number(value?.sourceRow));
  const known=rows.filter((row:number)=>Number.isSafeInteger(row)&&row>0);
  return known.length?Math.min(...known):null;
};
const identifier=(value:any)=>String(value||'').normalize('NFKC').toUpperCase().replace(/[\s_-]+/g,'');
export function productSourceRow(product:any,sourceOrder:any[]|null=null):number|null{
  if(sourceOrder){const matches=sourceOrder.filter(row=>identifier(row.businessId)===identifier(product.productNumber));return matches.length===1?position(matches[0]):null;}
  return ['matched','matched_empty'].includes(product.sourcePricing?.status)?position(product.sourcePricing):null;
}
export function sortSourceProducts(products:any[],sourceOrder:any[]|null=null){
  return products.map((product,index)=>({product,index,row:productSourceRow(product,sourceOrder)})).sort((left,right)=>(left.row??Infinity)-(right.row??Infinity)||left.index-right.index).map(item=>item.product);
}
export function sortSourceEntries(entries:any[]){return entries.map((entry,index)=>({entry,index,row:position(entry.current||entry.after||entry.before)})).sort((left,right)=>(left.row??Infinity)-(right.row??Infinity)||left.index-right.index).map(item=>item.entry);}
