// Inventory entry needs local rows before the more expensive reminder reconciliation.
// Other callers keep the complete catalog (including galleries) by default.
export async function inventoryPageView({catalog,batch,store,sourceChanges,workflow,connection},request={}){
  const light=request?.inventory===true;
  if(light&&request.phase==='list'){
    const view=await catalog.getView({includeImages:false});
    const document=await store.read();
    return {catalog:view,sourceOrder:document.sourceChanges?.sourceOrder||null,workflow:await workflow.view(),status:await connection.status(),inventorySummaryPending:true};
  }
  const currentBatch=await batch.view(),view=await catalog.getView(light?{includeImages:false}:{});
  return {catalog:view,batch:currentBatch,sourceChanges:await sourceChanges(view,null,{verifiedReads:currentBatch.verifiedReads,priceCompletions:currentBatch.priceCompletions}),workflow:await workflow.view(),status:await connection.status(),...(light?{inventorySummaryPending:false}:{})};
}
