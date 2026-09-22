import {coreText} from '../../shared/text.mjs';
import {INVENTORY_HEADERS} from '../config.mjs';
import {AppError} from '../core/errors.mjs';
import {parseMappingRows} from '../mapping/mapping.mjs';
import {assignSourceKeys,normalizedSourceName} from '../mapping/source-key.mjs';
import {historyHeaders} from './history.mjs';

const continuityName=value=>normalizedSourceName(value).replace(/\([^)]*[a-z]{1,8}\d[a-z0-9-]*[^)]*\)/gi,'').replace(/\s+/g,'').trim();
export function buildFirstInventoryBaseline({mappingValues,sourceSnapshot,previousSourceSnapshot=null,now=new Date(),skipMissingMappings=false}){
  const mappings=parseMappingRows(mappingValues).filter(row=>row.businessId&&row.status!=='来源已移除');
  const current=assignSourceKeys(sourceSnapshot.products.filter(row=>coreText(row.sourceName))),sourceByKey=new Map(current.map(row=>[row.sourceKey,row])),sourceByRow=new Map(current.map(row=>[row.sourceRow,row]));
  const previous=assignSourceKeys((previousSourceSnapshot?.products||[]).filter(row=>coreText(row.sourceName))),previousByKey=new Map(previous.map(row=>[row.sourceKey,row]));
  const resolved=mappings.map(mapping=>{let source=sourceByKey.get(mapping.sourceKey),matchedBy='sourceKey';if(!source){const old=previousByKey.get(mapping.sourceKey),candidate=old&&sourceByRow.get(old.sourceRow);
      if(candidate&&continuityName(old.sourceName)===continuityName(candidate.sourceName)){source=candidate;matchedBy='previous-source-row-continuity';}}
    return {mapping,source,matchedBy};});
  const missing=resolved.filter(x=>!x.source);if(missing.length&&!skipMissingMappings)throw new AppError(`有${missing.length}条已编号映射找不到KDocs来源`,{stage:'库存基准',code:'NUMBERED_SOURCE_NOT_FOUND',details:missing.map(({mapping})=>({businessId:mapping.businessId,sourceKey:mapping.sourceKey}))});
  const products=resolved.filter(x=>x.source).map(({mapping,source,matchedBy})=>({businessId:mapping.businessId,sourceKey:mapping.sourceKey,currentSourceKey:source.sourceKey,matchedBy,sourceRow:source.sourceRow,
    sourceName:source.sourceName,cost:coreText(source.cost),suggestedPrice:coreText(source.suggestedPrice),stock:coreText(source.stock),additionalInfo:coreText(source.additionalInfo)}))
    .sort((a,b)=>a.sourceRow-b.sourceRow);
  const ids=products.map(row=>row.businessId);if(new Set(ids).size!==ids.length)throw new AppError('已编号商品存在重复编号',{stage:'库存基准',code:'BASELINE_DUPLICATE_ID'});
  const coveredRows=new Set(products.map(row=>row.sourceRow)),uncovered=current.filter(row=>!coveredRows.has(row.sourceRow));
  if(skipMissingMappings&&uncovered.length)throw new AppError(`仍有${uncovered.length}条KDocs当前商品未被已编号映射覆盖`,{stage:'库存基准',code:'CURRENT_SOURCE_NOT_NUMBERED',details:uncovered.map(row=>({sourceRow:row.sourceRow,sourceKey:row.sourceKey,sourceName:row.sourceName}))});
  const history=historyHeaders(now,[]),values=[[...INVENTORY_HEADERS,...history],...products.map(row=>[row.businessId,row.sourceName,'','','','',row.cost,row.suggestedPrice,row.stock,row.additionalInfo])];
  return {schemaVersion:2,status:'baseline',createdAt:now.toISOString(),sourceSnapshot:sourceSnapshot.capturedAt,historyHeaders:history,products,values,
    ignoredMissingMappings:missing.map(({mapping})=>({businessId:mapping.businessId,sourceKey:mapping.sourceKey,sourceName:mapping.sourceName,status:mapping.status})),
    counts:{source:sourceSnapshot.quality.namedProducts,numbered:products.length,skipped:sourceSnapshot.quality.namedProducts-products.length,missingMappings:missing.length}};
}
