import {mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {openKdocs,goTo,usedEnd,captureLayout,captureCellImageFingerprint,delay} from './browser.mjs';
import {decodeLayout,combineLayouts,columnNumber,columnLabel} from '../../shared/reconstruct.mjs';
import {coreText} from '../../shared/text.mjs';
import {SOURCE_URL,SOURCE_SHEET,SOURCE_RULES} from '../config.mjs';
import {sourceRecords,validateCollection,makeSourceSnapshot} from './quality.mjs';
import {timestampName,writeJSON} from '../core/files.mjs';
import {AppError,appError} from '../core/errors.mjs';
import {repairSourceCoverage} from './coverage-repair.mjs';
const sameCore=(a,b)=>['A','D','E','F','G'].every(c=>coreText(a?.[c])===coreText(b?.[c]));
const rowNumber=value=>{const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>0?parsed:0;};
const frozenPrefix=values=>{const rows=[...new Set(values)].filter(value=>value>0).sort((a,b)=>a-b);if(rows[0]!==1)return [];let end=1;while(rows[end]===end+1)end++;return end<rows.length?rows.slice(0,end):[];};
// At the used-range endpoint, a leading run followed by a gap is the pinned
// header band. Selecting A1 in that band does not scroll the sheet body home.
export function sourceStartPosition(layout,endpoint){
 const match=/^([A-Z]+)(\d+)$/.exec(endpoint||'');if(!match)throw new Error('来源末端地址无效');
 const frozenRows=frozenPrefix((layout?.rows||[]).map(row=>rowNumber(row.row))),frozenColumns=frozenPrefix((layout?.columns||[]).map(col=>columnNumber(col.column)));
 const row=Math.min(Number(match[2]),(frozenRows.at(-1)||0)+1),column=columnLabel(Math.min(columnNumber(match[1]),(frozenColumns.at(-1)||0)+1));
 return {address:`${column}${row}`,row,column,frozenRows,frozenColumns:frozenColumns.map(columnLabel)};
}
// Canvas rows near the bottom may be only partly drawn.  A row-number hit is
// enough to stop scrolling because the subsequent coverage repair still reads
// every required A/D/E/F/G cell deliberately.  Do not keep wheeling merely to
// wait for an entirely complete final row.
export function sourceSweepState({layout,endRow,endColumn,previousPosition='',highestRow=0,noNewRows=0}={}){
  const completeRows=Array.isArray(layout?.completeRows)?layout.completeRows.map(rowNumber):[];
  const visibleRows=Array.isArray(layout?.rows)?layout.rows.map(row=>rowNumber(row?.row)):[];
  const last=Math.max(0,...completeRows,...visibleRows),position=JSON.stringify({rows:(layout?.rows||[]).map(row=>[rowNumber(row?.row),row?.top??null]),columns:(layout?.columns||[]).map(col=>[col.column,col.left??null]),scrollPosition:layout?.scrollPosition??null}),stalled=position===previousPosition?1:0;
  const endpointRow=visibleRows.includes(rowNumber(endRow)),endpointComplete=completeRows.includes(rowNumber(endRow));
  return {last,position,stalled,noNewRows:last>highestRow?0:noNewRows+1,atEnd:endpointComplete||endpointRow};
}
export async function collectKdocs({profile,paths,previous=null,onProgress=()=>{},keepEvidence=false,browserOps={}}){
  const open=browserOps.openKdocs||openKdocs,navigate=browserOps.goTo||goTo,endpointAddress=browserOps.usedEnd||usedEnd,readLayout=browserOps.captureLayout||captureLayout,imageFingerprint=browserOps.captureCellImageFingerprint||captureCellImageFingerprint,wait=browserOps.delay||delay;
  const runName=`run_${Date.now()}`,runDir=path.join(paths.failed,runName);await mkdir(runDir,{recursive:true});
  let browser,currentSnapshot,page;
  const manifest={sourceUrl:SOURCE_URL,sheet:SOURCE_SHEET,startedAt:new Date().toISOString(),reachedEnd:false,endpointVerified:false,scrollSteps:0,directEndChecks:0,maxSeenRow:0,sampleChecks:[]};
  const layouts=[];
  async function capture(label){
    for(let attempt=1;attempt<=3;attempt++)try{
      currentSnapshot=await readLayout(page,label);const layout=decodeLayout(currentSnapshot);
      manifest.probeVersion=currentSnapshot.probeVersion||1;
      if(!layout.rows.length||!layout.columns.length)throw new AppError(`Canvas绘制帧缺少行列标题：${label}`,{stage:'KDocs采集',code:'CANVAS_FRAME_INCOMPLETE'});
      return layout;
    }catch(error){
      if(attempt===3||!(error.code==='CANVAS_FRAME_INCOMPLETE'||/Canvas重绘未在限定时间/.test(error.message)))throw error;
      manifest.captureRetries=(manifest.captureRetries||0)+1;onProgress({stage:'KDocs采集',message:`画布尚未完整绘制，正在重读 ${label}（${attempt}/2）`});await wait(250);
    }
  }
  // The managed workspace belongs to the explicit login lifecycle. A collection
  // attempt must not close it, whether the read completes or raises an error.
  try{
    browser=await open(profile,SOURCE_URL,{onProgress});({page}=browser);
    // The canvas can become visible before the sheet tab finishes mounting.
    // Wait for the tab rather than treating that brief loading state as wrong data.
    let visible=[];
    for(let attempt=0;attempt<20;attempt++){
      visible=[];for(const candidate of await page.getByText(SOURCE_SHEET,{exact:true}).all())if(await candidate.isVisible())visible.push(candidate);
      if(visible.length)break;
      if(!attempt)onProgress({stage:'KDocs采集',message:'来源页面正在加载，等待确认Sheet1...'});
      await wait(500);
    }
    if(visible.length!==1)throw new AppError('无法唯一确认Sheet1',{stage:'KDocs采集',code:'WRONG_SHEET'});
    await visible[0].click();await wait(900);
    onProgress({stage:'KDocs采集',message:'正在确定库存表末端...'});
    manifest.initialEnd=await endpointAddress(page);const match=/^([A-Z]+)(\d+)$/.exec(manifest.initialEnd||'');
    if(!match||Number(match[2])>10000||columnNumber(match[1])>200||columnNumber(match[1])<SOURCE_RULES.minimumEndColumn||Number(match[2])<SOURCE_RULES.minimumEndRow)throw new AppError(`末单元格异常：${manifest.initialEnd}；未确认完整来源范围，已保留上次有效资料`,{stage:'KDocs采集',code:'ENDPOINT_INVALID'});
    const endRow=Number(match[2]),endColumn=match[1],before=await capture('endpoint-before');
    if(!before.completeRows.includes(endRow)||!before.completeColumns.includes(endColumn))throw new AppError('末端名称框与Canvas行列标题不一致',{stage:'KDocs采集',code:'ENDPOINT_MISMATCH'});
    const start=sourceStartPosition(before,manifest.initialEnd);manifest.scanStart=start;
    onProgress({stage:'KDocs采集',message:`正在定位来源顶部 ${start.address}${start.frozenRows.length?`（冻结 ${start.frozenRows.length} 行）`:''}`});
    await navigate(page,start.address);let previousPosition='',stalled=0,highestRow=0,noNewRows=0;
    async function verifyEndByAddress(reason){
      manifest.directEndChecks++;onProgress({stage:'KDocs采集',message:`${reason}；正在直接定位已确认末行 ${endRow} 并停止滚动…`,currentRow:Math.min(highestRow,endRow),endRow});
      await navigate(page,`A${endRow}`);const endpoint=await capture(`endpoint-direct-${manifest.directEndChecks}`);layouts.push(endpoint);
      const result=sourceSweepState({layout:endpoint,endRow,endColumn,previousPosition,highestRow,noNewRows});
      manifest.maxSeenRow=Math.max(manifest.maxSeenRow,result.last);
      if(!result.atEnd)throw new Error(`已直接定位末行 ${endRow} 但未在画布中确认；已停止继续滚动，旧的本机快照未被覆盖`);
      manifest.reachedEnd=true;
    }
    for(let step=0;step<SOURCE_RULES.maxScrollSteps;step++){
      const layout=await capture(`sweep-${String(step).padStart(3,'0')}`);layouts.push(layout);
      const sweep=sourceSweepState({layout,endRow,endColumn,previousPosition,highestRow,noNewRows});
      highestRow=Math.max(highestRow,sweep.last);noNewRows=sweep.noNewRows;stalled=sweep.stalled?stalled+1:0;previousPosition=sweep.position;manifest.maxSeenRow=Math.max(manifest.maxSeenRow,sweep.last);
      onProgress({stage:'KDocs采集',message:`已扫描 ${Math.min(sweep.last,endRow)}/${endRow} 行`,currentRow:Math.min(sweep.last,endRow),endRow});
      if(!step){manifest.firstSweepRows=layout.rows.map(row=>row.row);if(!layout.completeRows.includes(start.row)||!layout.completeColumns.includes(start.column)||!layout.completeRows.includes(1)||!layout.completeColumns.includes('A'))throw new AppError(`未能确认来源顶部 ${start.address}，已停止采集并保留上次有效资料`,{stage:'KDocs采集',code:'SOURCE_TOP_UNVERIFIED'});}
      if(sweep.atEnd){manifest.reachedEnd=true;break;}
      if(stalled>=3||noNewRows>=3||step===SOURCE_RULES.maxScrollSteps-1){await verifyEndByAddress(stalled>=3?'滚动位置连续未变化':noNewRows>=3?'连续滚动没有新增行':'达到滚动安全预算');break;}
      const box=await page.locator('#et_canvas').boundingBox();if(!box)throw new Error('Canvas不可见');
      const scrollDelta=Math.max(40,Math.min(180,Math.floor(box.height/3)));manifest.scrollDelta=scrollDelta;
      await page.mouse.move(box.x+Math.min(300,box.width/2),box.y+Math.min(300,box.height/2));await page.mouse.wheel(0,scrollDelta);await wait(180);manifest.scrollSteps++;
    }
    if(!manifest.reachedEnd)throw new Error('超过滚动安全预算仍未到末端');
    await repairSourceCoverage({layouts,endpoint:manifest.initialEnd,manifest,onProgress,read:async(address,index)=>{await navigate(page,address);return capture(`repair-${index}`);}});
    const firstPass=combineLayouts(layouts,manifest.initialEnd),preImageRecords=sourceRecords(firstPass).filter(r=>coreText(r.sourceName));
    const nameGroups=Map.groupBy(preImageRecords,r=>coreText(r.sourceName));
    const historicalImageNames=new Set((previous?.products||[]).filter(r=>coreText(r.imageFingerprint)).map(r=>coreText(r.sourceName)));
    const imageRows=[...new Set([...nameGroups.values()].filter(group=>group.length>1).flatMap(group=>group.map(r=>r.sourceRow))
      .concat(preImageRecords.filter(r=>historicalImageNames.has(coreText(r.sourceName))).map(r=>r.sourceRow)))].sort((a,b)=>a-b);
    const imageFingerprints={};
    for(let i=0;i<imageRows.length;i++){
      const row=imageRows[i];onProgress({stage:'KDocs图片识别',message:`正在生成第 ${row} 行图片指纹（${i+1}/${imageRows.length}）`});
      imageFingerprints[`C${row}`]=await imageFingerprint(page,`C${row}`);
    }
    manifest.imageChecks=imageRows.map(row=>({row,address:`C${row}`,fingerprint:imageFingerprints[`C${row}`].fingerprint,passed:true}));
    const named=preImageRecords;
    const sampleRows=[];for(let i=0;i<20;i++)sampleRows.push(named[Math.round(i*(named.length-1)/19)]?.sourceRow);
    for(const row of [...new Set(sampleRows)]){
      onProgress({stage:'KDocs复核',message:`正在独立复核第 ${row} 行（${manifest.sampleChecks.length+1}/20）`});
      await navigate(page,`A${row}`);const revisits=[];
      for(const col of ['A','D','E','F','G']){
        if(revisits.some(l=>l.completeRows.includes(row)&&l.completeColumns.includes(col)))continue;
        await navigate(page,`${col}${row}`);revisits.push(await capture(`sample-${col}${row}`));
      }
      const actual=combineLayouts(revisits,manifest.initialEnd).rows.find(r=>r.row===row)?.cells,expected=firstPass.rows.find(r=>r.row===row)?.cells;
      const passed=sameCore(expected,actual);manifest.sampleChecks.push({row,passed});if(!passed)throw new Error(`第${row}行独立复核不一致`);layouts.push(...revisits);
    }
    manifest.finalEnd=await endpointAddress(page);const after=await capture('endpoint-after');layouts.push(after);
    manifest.endpointVerified=manifest.finalEnd===manifest.initialEnd&&after.completeRows.includes(endRow)&&after.completeColumns.includes(endColumn);
    const result=combineLayouts(layouts,manifest.initialEnd);result.imageFingerprints=imageFingerprints;
    const collection={manifest,result},quality=validateCollection(collection,previous,{...SOURCE_RULES,rejectConflictingDuplicateNames:true}),snapshot=makeSourceSnapshot(collection,quality);
    const file=path.join(paths.snapshots,timestampName('source',new Date(snapshot.capturedAt)));await writeJSON(file,snapshot);
    onProgress({stage:'KDocs采集',message:`已采集 ${quality.rawNamedRows} 行资料，整理为 ${quality.namedProducts} 个来源商品...`});
    if(!keepEvidence)await rm(runDir,{recursive:true,force:true});else await writeJSON(path.join(runDir,'collection.json'),collection);
    return {snapshot,file,collection};
  }catch(error){
    const failure={timestamp:new Date().toISOString(),manifest,error:{message:error.message,stack:error.stack,code:error.code,stage:error.stage,details:error.details},lastSnapshot:currentSnapshot};
    await writeFile(path.join(runDir,'failure.json'),JSON.stringify(failure,null,2));throw appError(error,error.stage||'KDocs采集',error.code||'KDOCS_CAPTURE_FAILED');
  }
}
