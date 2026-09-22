import {coreText,cleanDisplay} from '../../shared/text.mjs';
import {columnNumber} from '../../shared/reconstruct.mjs';
import {SOURCE_RULES,SOURCE_URL,SOURCE_SHEET,CORE_COLUMNS} from '../config.mjs';
import {AppError} from '../core/errors.mjs';
const countNames=records=>{const map=new Map();for(const r of records)map.set(coreText(r.sourceName),(map.get(coreText(r.sourceName))||0)+1);return map;};
function mergedNames(result){
  const inherited=new Map();for(const merge of result.coverage?.mergeCandidates||[]){
    const match=/^A(\d+):A(\d+)$/.exec(merge.range||'');if(!match)continue;
    const start=Number(match[1]),end=Number(match[2]),name=cleanDisplay(result.rows.find(r=>r.row===start)?.cells?.A);if(!name)continue;
    for(let row=start;row<=end;row++)inherited.set(row,{name,anchorRow:start,range:merge.range});
  }return inherited;
}
export function sourceRecords(result){
  const inherited=mergedNames(result);return result.rows.filter(r=>r.row!==SOURCE_RULES.headerRow&&(CORE_COLUMNS.some(c=>coreText(r.cells[c]))||result.imageFingerprints?.[`C${r.row}`]))
    .map(r=>{const merge=inherited.get(r.row),sourceName=cleanDisplay(r.cells.A)||merge?.name||'',imageFingerprint=cleanDisplay(result.imageFingerprints?.[`C${r.row}`]?.fingerprint);
      return {sourceRow:r.row,sourceName,cost:cleanDisplay(r.cells.D),suggestedPrice:cleanDisplay(r.cells.E),stock:cleanDisplay(r.cells.F),
        additionalInfo:cleanDisplay(r.cells.G),imageFingerprint,nameInheritedFromMerge:!!merge&&r.row!==merge.anchorRow,mergeRange:merge?.range||'',
        incomplete:!coreText(sourceName)||!coreText(r.cells.D)||!coreText(r.cells.E)||!coreText(r.cells.F)};});
}
export function validateCollection(collection,previous=null,rules=SOURCE_RULES){
  const {manifest,result}=collection||{},failures=[],warnings=[];const fail=(bad,text)=>{if(bad)failures.push(text);};
  if(!manifest||!result?.coverage||!Array.isArray(result.rows))throw new AppError('KDocs采集结构不完整',{stage:'KDocs采集校验',code:'SOURCE_STRUCTURE_INVALID'});
  const c=result.coverage,header=result.rows.find(r=>r.row===rules.headerRow)?.cells,records=sourceRecords(result),named=records.filter(r=>coreText(r.sourceName));
  fail(manifest.sourceUrl!==SOURCE_URL||manifest.sheet!==SOURCE_SHEET,'来源页面或Sheet不正确');
  fail(!header||coreText(header.A)!=='名称'||coreText(header.D).replaceAll(' ','')!=='成本AED'||coreText(header.E).replaceAll(' ','')!=='建议售价AED'||coreText(header.F)!=='库存','A/D/E/F表头或列位置不正确');
  fail(manifest.reachedEnd!==true||manifest.endpointVerified!==true,'没有扫描并独立验证正常末端');
  fail(manifest.initialEnd!==manifest.finalEnd||manifest.initialEnd!==c.endpoint,'采集前后已用区域末端不一致');
  fail(c.endRow<rules.minimumEndRow||c.endColumn<rules.minimumEndColumn,`已用区域异常：${c.endpoint}`);
  fail(c.recognizedRows!==c.endRow||result.rows.length!==c.endRow,'存在明显漏行或只有当前屏数据');
  const coreAddress=a=>/^[ADEFG]\d+$/.test(a);
  fail(c.missing.some(coreAddress),`关键单元格未完整绘制：${c.missing.filter(coreAddress).slice(0,12).join('、')}`);
  fail(c.conflicts.some(x=>coreAddress(x.address)&&new Set(x.variants.map(v=>coreText(v.text))).size>1),'关键单元格出现冲突，可能采集期间来源变化');
  fail(c.clipped.some(coreAddress),'A/D/E/F/G存在文字裁剪风险');fail(c.dropped>0,`Canvas事件溢出：${c.dropped}`);
  fail(named.length<rules.minimumNamedProducts,`有效来源商品仅${named.length}条，低于首次安全门限${rules.minimumNamedProducts}`);
  for(const field of ['cost','suggestedPrice','stock'])fail(!named.length||named.filter(r=>!coreText(r[field])).length/named.length>rules.maximumEmptyRatio,`${field}大量为空`);
  fail(!named.length||named.filter(r=>/^[-+]?\d/.test(coreText(r.cost))).length/named.length<0.8,'成本列大多不是正常显示数值，可能列错位');
  fail(!named.length||named.filter(r=>['有货','无货'].includes(coreText(r.stock))).length/named.length<0.8,'库存列大多不是有货/无货，可能列错位');
  fail(!Array.isArray(manifest.sampleChecks)||manifest.sampleChecks.length<20||new Set(manifest.sampleChecks.map(x=>x.row)).size<20||manifest.sampleChecks.some(x=>x.passed!==true),'独立复访不足20行或值不一致');
  const duplicateGroups=[...countNames(named)].filter(([,count])=>count>1);
  if(Array.isArray(manifest.imageChecks))for(const [name,count] of duplicateGroups){const group=named.filter(r=>coreText(r.sourceName)===name);fail(group.some(r=>!r.imageFingerprint),`同名商品缺少图片指纹：${name}`);fail(new Set(group.map(r=>r.imageFingerprint)).size!==count,`同名商品图片指纹不能唯一拆分：${name}`);}
  else if(duplicateGroups.length)warnings.push('旧采集证据没有图片指纹；仅用于历史回归，不用于本次商品映射重建');
  if(previous?.products?.length){
    const old=previous.products.filter(r=>coreText(r.sourceName)),oldCounts=countNames(old),nowCounts=countNames(named);
    const retained=[...oldCounts].reduce((n,[name,count])=>n+Math.min(count,nowCounts.get(name)||0),0);
    fail(named.length/old.length<rules.minimumPreviousRatio,`来源商品数量异常下降：${old.length}→${named.length}`);
    if(retained/old.length<rules.minimumPreviousRatio)warnings.push(`来源名称与上次完全一致${retained}/${old.length}个，未连续匹配项必须在商品映射中人工复核`);
    for(const field of ['cost','suggestedPrice','stock']){
      const newlyEmpty=named.filter(r=>!coreText(r[field])).length-old.filter(r=>!coreText(r[field])).length;
      fail(newlyEmpty/old.length>rules.maximumNewEmptyRatio,`${field}较上次大量变空`);
    }
    const oldDup=[...oldCounts].filter(([,n])=>n>1).length,nowDup=[...nowCounts].filter(([,n])=>n>1).length;
    fail(nowDup>Math.max(oldDup+5,oldDup*2+1),'重复来源名称组异常增加');
  }
  const unnamed=records.filter(r=>!coreText(r.sourceName));if(unnamed.length)warnings.push(`${unnamed.length}行A列为空但含业务字段，保留诊断但不参与映射`);
  if(failures.length)throw new AppError(`采集异常：${failures.join('；')}`,{stage:'KDocs采集校验',code:'SOURCE_QUALITY_FAILED',details:{failures,warnings,named:named.length,endpoint:c.endpoint}});
  return {passed:true,namedProducts:named.length,totalBusinessRows:records.length,endpoint:c.endpoint,empty:{cost:named.filter(r=>!coreText(r.cost)).length,
    suggestedPrice:named.filter(r=>!coreText(r.suggestedPrice)).length,stock:named.filter(r=>!coreText(r.stock)).length},inStock:named.filter(r=>coreText(r.stock)==='有货').length,
    outOfStock:named.filter(r=>coreText(r.stock)==='无货').length,warnings};
}
export function makeSourceSnapshot(collection,quality,{capturedAt=new Date().toISOString()}={}){
  const products=sourceRecords(collection.result);return {schemaVersion:2,status:'collected',capturedAt,sourceUrl:SOURCE_URL,sheet:SOURCE_SHEET,
    range:`A1:${collection.result.coverage.endpoint}`,products,quality,manifest:{initialEnd:collection.manifest.initialEnd,finalEnd:collection.manifest.finalEnd,
      reachedEnd:collection.manifest.reachedEnd,endpointVerified:collection.manifest.endpointVerified,scrollSteps:collection.manifest.scrollSteps,
      sampleChecks:collection.manifest.sampleChecks,imageChecks:collection.manifest.imageChecks||[]}};
}
