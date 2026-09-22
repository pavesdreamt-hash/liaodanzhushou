// GENERATED from ../src/reconstruct.mjs; SHA256 8d8445cdaf843fae426ebfd3670523561c4e029529aa142dc7f3488e42ba27b7; do not edit.
// Canvas-only decoder. It never imports the manually supplied validation answers.
export const columnNumber = label => [...label].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
export function columnLabel(n) { let s = ''; while (n) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); } return s; }
const near = (a, b, tolerance = 1.1) => Math.abs(a - b) <= tolerance;
const round = n => Math.round(n * 10) / 10;

export function assembleLine(glyphs) {
  let text='',inferredSpaces=0,previous=null;
  for(const glyph of glyphs) {
    // KDocs supplies a layout slot in fillText(maxWidth); measureText alone is wrong
    // for its compressed ASCII glyphs. Whitespace often has no fillText call.
    if(previous && previous.maxWidth>0 && glyph.maxWidth>0 && previous.font===glyph.font
      && previous.align===glyph.align && !/\s$/.test(previous.text) && !/^\s/.test(glyph.text)) {
      const scale=glyph.transform?Math.hypot(glyph.transform.a,glyph.transform.b):1;
      const prevWidth=previous.maxWidth*scale, nextWidth=glyph.maxWidth*scale;
      const expected=glyph.align==='center'?(prevWidth+nextWidth)/2:glyph.align==='right'?nextWidth:prevWidth;
      const unit=Number(/([\d.]+)px/.exec(glyph.font)?.[1]||16)*scale/2;
      const gap=glyph.x-previous.x-expected;
      if(gap>=unit*0.7 && gap<=unit*12) {const n=Math.max(1,Math.round(gap/unit));text+=' '.repeat(n);inferredSpaces+=n;}
    }
    text+=glyph.text;previous=glyph;
  }
  return {text,inferredSpaces};
}

export function decodeLayout(snapshot) {
  const rows = new Map(), columns = new Map(), events = [], imageEvents = [];
  let fallbackRect = null;
  for (const event of snapshot.events) {
    if (event.kind === 'rect') fallbackRect = event;
    if (event.kind === 'image') { imageEvents.push(event); continue; }
    if (event.kind !== 'text') continue;
    const clip = event.clipRect || fallbackRect;
    if (!clip) continue;
    if (event.font.includes('ET-HEADERS-FONT')) {
      if (/^\d+$/.test(event.text) && clip.x === 0 && clip.width < 50)
        rows.set(Number(event.text), { row: Number(event.text), top: clip.y, bottom: clip.y + clip.height + 1, height: clip.height + 1 });
      if (/^[A-Z]+$/.test(event.text) && clip.y === 0 && clip.height < 30)
        columns.set(event.text, { column: event.text, left: clip.x, right: clip.x + clip.width + 1, width: clip.width + 1 });
    } else events.push({ ...event, clip });
  }
  const rowList = [...rows.values()].sort((a,b) => a.row-b.row);
  const colList = [...columns.values()].sort((a,b) => columnNumber(a.column)-columnNumber(b.column));
  const headerBottom = Math.min(...rowList.filter(r => r.bottom > 24).map(r=>Math.max(24,r.top)));
  const completeRows = rowList.filter(r => r.top >= 24 && r.bottom <= snapshot.canvas.height + 0.1).map(r=>r.row);
  const completeColumns = colList.filter(c=>c.left >= 40 && c.right <= snapshot.canvas.width + 0.1).map(c=>c.column);
  const groups = new Map(), issues = [], incompleteCells = new Set();
  for (const event of events) {
    const { clip } = event;
    // A clip's origin, not the glyph baseline, identifies wrapped/merged cells.
    const row = rowList.find(r=>near(r.top,clip.y));
    const col = colList.find(c=>near(c.left,clip.x));
    if (!row || !col) { issues.push({ type:'unmapped-text', text:event.text, clip }); continue; }
    if (!completeRows.includes(row.row) || !completeColumns.includes(col.column)) continue;
    const key = `${col.column}${row.row}`;
    if (clip.x + clip.width > snapshot.canvas.width || clip.y + clip.height > snapshot.canvas.height) { incompleteCells.add(key); continue; }
    if (!groups.has(key)) groups.set(key, { address:key, row:row.row, column:col.column, clip, events:[] });
    groups.get(key).events.push(event);
  }
  const cells = [], merges = [], images = [];
  let duplicateDraws = 0;
  for (const group of groups.values()) {
    const { clip } = group;
    const unique = new Map();
    for (const e of group.events) {
      const key = JSON.stringify([round(e.x-clip.x),round(e.y-clip.y),e.text]);
      if (unique.has(key)) duplicateDraws++;
      unique.set(key, e);
    }
    const glyphs = [...unique.values()].sort((a,b)=>a.y-b.y || a.x-b.x || a.seq-b.seq);
    const lines = [];
    for (const glyph of glyphs) {
      let line = lines.find(line => near(line.y, glyph.y, 0.3));
      if (!line) { line = { y:glyph.y, glyphs:[] }; lines.push(line); }
      line.glyphs.push(glyph);
    }
    const displayLines = lines.map(line=>({ dy:round(line.y-clip.y), ...assembleLine(line.glyphs.sort((a,b)=>a.x-b.x||a.seq-b.seq)) }));
    // Explicit newline glyphs are retained; visual wrapping alone is not a new cell/newline.
    const text = displayLines.map(line=>line.text).join('');
    const overflow = glyphs.some(g=>g.y-g.ascent > clip.y+clip.height || g.y+g.descent > clip.y+clip.height+1 || g.x > clip.x+clip.width);
    const lastRow = rowList.find(r=>near(r.bottom,clip.y+clip.height+1));
    const lastCol = colList.find(c=>near(c.right,clip.x+clip.width+1));
    let merge = null;
    if (lastRow && lastCol && (lastRow.row!==group.row || lastCol.column!==group.column)) {
      merge = `${group.address}:${lastCol.column}${lastRow.row}`;
      merges.push({ range:merge, anchor:group.address, basis:'text clipping rectangle; must validate against UI' });
    }
    cells.push({ address:group.address, row:group.row, column:group.column, text, displayLines,
      glyphCount:glyphs.length, inferredSpaces:displayLines.reduce((n,l)=>n+l.inferredSpaces,0), clippedTextRisk:overflow, mergeCandidate:merge,
      evidence:{ capture:snapshot.label, timestamp:snapshot.timestamp, clip,
        firstSeq:Math.min(...glyphs.map(g=>g.seq)),lastSeq:Math.max(...glyphs.map(g=>g.seq)) } });
  }
  for (const event of imageEvents) {
    const clip = event.clipRect;
    const centerX = clip ? clip.x + clip.width / 2 : event.x + event.width / 2;
    const centerY = clip ? clip.y + clip.height / 2 : event.y + event.height / 2;
    const row = clip ? rowList.find(r=>near(r.top,clip.y)) : rowList.find(r=>centerY>=r.top&&centerY<=r.bottom);
    const col = clip ? colList.find(c=>near(c.left,clip.x)) : colList.find(c=>centerX>=c.left&&centerX<=c.right);
    if (!row || !col || !completeRows.includes(row.row) || !completeColumns.includes(col.column)) continue;
    if (!event.fingerprint) continue;
    images.push({address:`${col.column}${row.row}`,row:row.row,column:col.column,fingerprint:event.fingerprint,
      pixelFingerprint:event.pixelFingerprint||'',resourceFingerprint:event.resourceFingerprint||'',sourceType:event.sourceType,
      x:event.x,y:event.y,width:event.width,height:event.height,evidence:{capture:snapshot.label,timestamp:snapshot.timestamp}});
  }
  return { label:snapshot.label, timestamp:snapshot.timestamp, rows:rowList, columns:colList,
    completeRows, completeColumns, cells, merges, duplicateDraws, dropped:snapshot.dropped,
    images, issues, incompleteCells:[...incompleteCells], headerBottom,
    scrollPosition:{ firstRow:rowList.find(r=>r.bottom>24)?.row, firstRowY:rowList.find(r=>r.bottom>24)?.top,
      firstColumn:colList.find(c=>c.right>40)?.column, firstColumnX:colList.find(c=>c.right>40)?.left } };
}

export function combineLayouts(layouts, endpoint) {
  const m = /^([A-Z]+)(\d+)$/.exec(endpoint || '');
  if (!m) throw new Error(`Used-range navigation did not return a cell: ${endpoint}`);
  const endRow = Number(m[2]), endColumn = columnNumber(m[1]);
  if (endRow > 10000 || endColumn > 200) throw new Error('Used range exceeds bounded phase-2 export limits');
  const variants = new Map(), coverage = new Map(), heights = new Map();
  let duplicateDraws=0, duplicateObservations=0;
  for (const layout of layouts) {
    duplicateDraws += layout.duplicateDraws;
    for(const row of layout.rows) heights.set(row.row,row.height);
    for (const row of layout.completeRows) {
      if (!coverage.has(row)) coverage.set(row,new Set());
      for (const col of layout.completeColumns) coverage.get(row).add(col);
    }
    // Include verified empty rendered cells in consistency comparisons.
    const textByAddress = new Map(layout.cells.map(c=>[c.address,c]));
    for (const row of layout.completeRows) for (const col of layout.completeColumns) {
      if(row>endRow || columnNumber(col)>endColumn) continue;
      const address=`${col}${row}`;
      if(layout.incompleteCells?.includes(address)) continue;
      const cell=textByAddress.get(address) || {address,row,column:col,text:'',displayLines:[],glyphCount:0,clippedTextRisk:false,evidence:{capture:layout.label,timestamp:layout.timestamp}};
      if(!variants.has(address)) variants.set(address,new Map());
      const choices=variants.get(address);
      if(choices.has(cell.text)) { choices.get(cell.text).observations++; duplicateObservations++; }
      else choices.set(cell.text,{...cell,observations:1});
    }
  }
  const rows=[], metadata={}, imageMetadata={}, conflicts=[], missing=[], clipped=[];
  for(let row=1;row<=endRow;row++) {
    const cells={};
    for(let c=1;c<=endColumn;c++) {
      const col=columnLabel(c), address=`${col}${row}`;
      const choices=[...(variants.get(address)?.values()||[])].sort((a,b)=>b.observations-a.observations||b.text.length-a.text.length);
      cells[col]=choices[0]?.text ?? '';
      if(!coverage.get(row)?.has(col) || !choices.length) missing.push(address);
      if(choices.length>1) conflicts.push({address,variants:choices.map(x=>({text:x.text,count:x.observations,capture:x.evidence.capture}))});
      if(choices[0]?.text) metadata[address]=choices[0];
      if(choices[0]?.clippedTextRisk) clipped.push(address);
    }
    rows.push({row,cells});
  }
  const imageVariants = new Map();
  for (const image of layouts.flatMap(l=>l.images||[])) {
    if (!imageVariants.has(image.address)) imageVariants.set(image.address,new Map());
    const variants=imageVariants.get(image.address);const old=variants.get(image.fingerprint);
    if (old) old.observations++; else variants.set(image.fingerprint,{...image,observations:1});
  }
  for (const [address, variants] of imageVariants) {
    const choices=[...variants.values()].sort((a,b)=>b.observations-a.observations);
    imageMetadata[address]={...choices[0],variants:choices.map(x=>({fingerprint:x.fingerprint,count:x.observations}))};
  }
  const merges=[...new Map(layouts.flatMap(l=>l.merges).map(m=>[m.range,m])).values()];
  return {rows,metadata,imageMetadata,coverage:{endpoint,endRow,endColumn,recognizedRows:rows.filter(r=>coverage.has(r.row)).length,
    nonemptyRows:rows.filter(r=>Object.values(r.cells).some(Boolean)).length,
    nonemptyColumns:[...new Set(Object.values(metadata).map(c=>c.column))].sort((a,b)=>columnNumber(a)-columnNumber(b)),
    missing,conflicts,clipped,duplicateDraws,duplicateObservations,mergeCandidates:merges,
    rowHeights:Object.fromEntries([...heights].filter(([r])=>r<=endRow)),
    captures:layouts.length,dropped:layouts.reduce((n,l)=>n+l.dropped,0)} };
}

export function toCSV(rows, endColumn) {
  const columns=Array.from({length:endColumn},(_,i)=>columnLabel(i+1));
  const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
  return '\ufeff'+[['row',...columns],...rows.map(r=>[r.row,...columns.map(c=>r.cells[c])])].map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';
}
