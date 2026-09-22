// GENERATED from ../src/monitor/text.mjs; SHA256 f257c17516ecf172bc3e96b18b23cef1599395ca7f1932cf3d8bebf34000ee67; do not edit.
export function cleanDisplay(value) {
  return String(value??'').replace(/\r\n?/g,'\n')
    .replace(/[\t\v\f\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000 ]+/g,' ')
    .split('\n').map(line=>line.trim()).join('\n').trim();
}
export const coreText=value=>cleanDisplay(value).replace(/\n/g,'').replace(/ +/g,' ').trim();
export const skuKey=coreText;
