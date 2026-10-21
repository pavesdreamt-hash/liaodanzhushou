// Compare listing only. A match is independent of price and stock quantity.
export function listingStatus(sourceStock,publishStatus){
  if(!['有货','无货'].includes(sourceStock)||![0,1].includes(publishStatus))return {status:'unknown',symbol:'?',label:'待核对'};
  return (sourceStock==='有货')===(publishStatus===1)?{status:'matched',symbol:'✓',label:'匹配'}:{status:'mismatched',symbol:'✕',label:'不匹配'};
}
