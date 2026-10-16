// This pipeline has no website mutation capability. Unresolved source entries
// do not prevent read-only reconciliation of already confirmed relationships.
export async function runDailyInventorySync({orchestrator,catalog,connection,progress=()=>{},refreshInventory=async()=>{}}){
  const source=await orchestrator.syncSourceLocal();await refreshInventory();
  const mapping=source.mapping||{},needsConfirmation=Number(mapping.needsConfirmation||0),pendingNumber=Number(mapping.pendingNumber||0);
  try{
    progress({stage:'一键同步',message:'来源快照已保存，正在读取完整网站商品目录…',phase:'website-catalog'});
    const mappingCatalog=await catalog.syncMappingCatalog({listPage:request=>connection.listProductsPage(request)});
    const confirmed=await orchestrator.confirmedSourceProducts();
    let view;
    const normalize=value=>String(value||'').normalize('NFKC').toUpperCase().replace(/[\s_-]+/g,'');
    const websiteNumbers=new Set((mappingCatalog.mappingCatalog||[]).map(product=>normalize(product.productNumber)));
    if(confirmed.some(row=>websiteNumbers.has(normalize(row.businessId)))){
      progress({stage:'一键同步',message:'正在核对已确认商品；新品与疑似替换单独保留待办…',phase:'reconcile'});
      const local=await orchestrator.localInventory();
      await catalog.reconcileSourceAndWebsite({sourceProducts:confirmed,sourceSnapshotProducts:local.latestCollection?.products||[],sourceUpdatedAt:local.latestCollection?.capturedAt,listPage:request=>connection.listProductsPage(request)});
      view=await catalog.applyReconciliation();
    }else view=await catalog.getView();
    const sourceChanges=await orchestrator.sourceChanges(view,'verified',{applyReviewed:true}),pending=view.dailyPending||[],pendingSummary={replenish:pending.filter(item=>item.kind==='replenish').length,publish:pending.filter(item=>item.kind==='publish').length,unpublish:pending.filter(item=>item.kind==='unpublish').length};
    await connection.markProductVerified('已通过来源与网站一键核对验证');
    progress({stage:'完成',message:`来源与网站核对完成；变化明细和 ${sourceChanges?.pending?.length||0} 项来源待办已保存。`,phase:'complete'});
    return {outcome:'complete',catalog:view,sourceChanges,status:await connection.status(),mappingCatalogCaptured:mappingCatalog.mappingCatalogRun?.captured||0,pendingSummary,needsConfirmation,pendingNumber};
  }catch(error){
    const view=await catalog.getView(),sourceChanges=await orchestrator.sourceChanges(view,'failed',{applyReviewed:true});
    return {outcome:'website_failed',catalog:view,sourceChanges,status:await connection.status(),reason:error.message,needsConfirmation,pendingNumber};
  }
}
