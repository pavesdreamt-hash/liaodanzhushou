// Counts use collected source products, never the filtered website catalogue.
export function sourceSnapshotStatistics(snapshot){
  if(!snapshot?.products)return null;
  const products=snapshot.products,endpoint=String(snapshot.range||snapshot.quality?.endpoint||'').match(/(?:[A-Z]+)(\d+)$/i),stock=value=>String(value||'').trim();
  return {tableRows:endpoint?Number(endpoint[1]):null,products:products.length,inStock:products.filter(p=>stock(p.stock)==='有货').length,outOfStock:products.filter(p=>stock(p.stock)==='无货').length,unknownStock:products.filter(p=>!['有货','无货'].includes(stock(p.stock))).length};
}
const amount=value=>{const text=String(value??'').trim().replace(/,/g,'');if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;return Math.round(Number(text)*100);};
export function sourceDirectionalCounts(report){
  const count={added:0,stocked:0,unstocked:0,removed:0,costUp:0,costDown:0,suggestedUp:0,suggestedDown:0,priceUnknown:0};
  for(const row of report?.rows||[]){
    if(row.kind==='added')count.added++;if(row.kind==='removed')count.removed++;
    // Replacement decisions do not imply a stock/price transition of one product.
    if(row.kind!=='modified')continue;
    for(const field of row.fields||[]){
      if(field.field==='stock'){if(field.before==='无货'&&field.after==='有货')count.stocked++;if(field.before==='有货'&&field.after==='无货')count.unstocked++;}
      if(!['cost','suggestedPrice'].includes(field.field))continue;
      const before=amount(field.before),after=amount(field.after);if(before===null||after===null){count.priceUnknown++;continue;}
      const prefix=field.field==='cost'?'cost':'suggested';if(after>before)count[prefix+'Up']++;if(after<before)count[prefix+'Down']++;
    }
  }
  return count;
}
