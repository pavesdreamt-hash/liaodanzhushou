import path from 'node:path';
import {fileRevision} from '../core/file-revision.mjs';

// Inventory entry needs local rows before the more expensive reminder reconciliation.
// Other callers keep the complete catalog (including galleries) by default.
export async function inventoryPageView({catalog,batch,store,sourceChanges,workflow,connection},request={}){
  const light=request?.inventory===true;
  if(request?.productDetail===true)return {catalog:await catalog.getView(),status:await connection.status()};
  if(light&&request.phase==='list'){
    const view=await catalog.getView({includeImages:false});
    const document=await store.read();
    return {catalog:view,sourceOrder:document.sourceChanges?.sourceOrder||null,workflow:await workflow.view(),status:await connection.status(),inventorySummaryPending:true};
  }
  const currentBatch=await batch.view(),view=await catalog.getView(light?{includeImages:false}:{});
  return {catalog:view,batch:currentBatch,sourceChanges:await sourceChanges(view,null,{verifiedReads:currentBatch.verifiedReads,priceCompletions:currentBatch.priceCompletions}),workflow:await workflow.view(),status:await connection.status(),...(light?{inventorySummaryPending:false}:{})};
}

// One cache per application data set, never a time-based assumption of freshness.
export function createInventoryPageView(deps){
  let cached=null,inFlight=null;
  const files=[deps.store.file,deps.catalog.file,deps.batch.file,deps.pendingFile||deps.store.paths?.state&&path.join(deps.store.paths.state,'pending-sync.json')];
  const revision=async()=>{if(files.some(f=>!f))return null;try{return await Promise.all(files.map(fileRevision));}catch{return null;}};
  const same=(a,b)=>Boolean(a&&b&&a.every((v,i)=>v===b[i]));
  const summary=async()=>{
    // A detached inventory page may still be finishing its read. Reuse it rather
    // than starting another whole-table reconciliation on the return route.
    if(inFlight){await inFlight;return summary();}
    const before=await revision();if(inFlight){await inFlight;return summary();}if(cached&&same(before,cached.revision))return structuredClone(cached.data);
    cached=null;
    const task=(async()=>{
      const batch=await deps.batch.view(),catalog=await deps.catalog.getView({includeImages:false}),inputs=await revision();
      const sourceChanges=await deps.sourceChanges(catalog,null,{verifiedReads:batch.verifiedReads,priceCompletions:batch.priceCompletions,includeInventoryRevision:true}),after=await revision();
      // The store's token is captured inside its serialized reconciliation. A
      // later manual edit must not make an older result look current.
      const sourceMatches=sourceChanges?sourceChanges.inventorySourceInputRevision===inputs?.[0]&&sourceChanges.inventorySourceRevision===after?.[0]:before?.[0]===after?.[0];
      const data={batch,sourceChanges};
      if(same(before,inputs)&&sourceMatches&&before&&after&&before.slice(1).every((v,i)=>v===after[i+1]))cached={revision:after,data:structuredClone(data)};
      return data;
    })();inFlight=task;try{return await task;}finally{if(inFlight===task)inFlight=null;}
  };
  return async(request={})=>{
    if(request?.productDetail===true||request?.inventory!==true)return inventoryPageView(deps,request);
    if(request.phase==='list'){
      const before=await revision(),result=await inventoryPageView(deps,request),after=await revision();
      if(cached&&same(before,after)&&same(after,cached.revision))return {...result,...structuredClone(cached.data),inventorySummaryPending:false,inventorySummaryReused:true};
      return result;
    }
    const result=await summary();
    return {...result,catalog:await deps.catalog.getView({includeImages:false}),workflow:await deps.workflow.view(),status:await deps.connection.status(),inventorySummaryPending:false};
  };
}
