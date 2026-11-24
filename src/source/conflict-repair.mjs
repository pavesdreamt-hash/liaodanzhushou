import {combineLayouts} from '../../shared/reconstruct.mjs';
import {coreText} from '../../shared/text.mjs';

const coreConflict=conflict=>/^[ADEFG]\d+$/.test(conflict.address)&&new Set(conflict.variants.map(item=>coreText(item.text))).size>1;
const observed=(layout,address)=>{
  const [,column,rowText]=/^([A-Z]+)(\d+)$/.exec(address)||[];
  const row=Number(rowText);
  if(!layout.completeRows.includes(row)||!layout.completeColumns.includes(column)||layout.incompleteCells?.includes(address))return null;
  return layout.cells.find(cell=>cell.address===address)?.text??'';
};

// A full Canvas sweep can contain one transient redraw frame. Re-read only
// disputed business cells twice, preserving the original variants in the
// audit manifest. A changing cell or an unfamiliar third value remains blocked.
export async function reconcileSourceConflicts({layouts,endpoint,read,manifest,maxChecks=12}){
  let result=combineLayouts(layouts,endpoint);
  const conflicts=result.coverage.conflicts.filter(coreConflict);
  manifest.conflictChecks=[];
  if(conflicts.length>maxChecks)return result;
  for(const conflict of conflicts){
    const first=await read(conflict.address,1),second=await read(conflict.address,2);
    const firstText=observed(first,conflict.address),secondText=observed(second,conflict.address);
    const agreed=firstText!==null&&secondText!==null&&firstText===secondText&&conflict.variants.some(v=>v.text===firstText);
    manifest.conflictChecks.push({address:conflict.address,variants:conflict.variants,first:firstText,second:secondText,passed:agreed});
    if(agreed)layouts.push(first,second);
  }
  result=combineLayouts(layouts,endpoint);
  const verified=new Map(manifest.conflictChecks.filter(check=>check.passed).map(check=>[check.address,check.first]));
  for(const [address,value] of verified){
    const [,column,rowText]=/^([A-Z]+)(\d+)$/.exec(address),row=Number(rowText);
    result.rows[row-1].cells[column]=value;
    const chosen=layouts.at(-1)?.cells.find(cell=>cell.address===address&&cell.text===value)
      ||layouts.findLast(layout=>layout.cells.some(cell=>cell.address===address&&cell.text===value))?.cells.find(cell=>cell.address===address&&cell.text===value);
    if(chosen&&value)result.metadata[address]=chosen;
    if(!value)delete result.metadata[address];
  }
  result.coverage.conflicts=result.coverage.conflicts.filter(conflict=>!verified.has(conflict.address));
  result.coverage.verifiedConflicts=manifest.conflictChecks.filter(check=>check.passed);
  return result;
}
