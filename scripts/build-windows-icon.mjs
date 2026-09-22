import {readFile,writeFile} from 'node:fs/promises';
const sizes=[16,32,128,256],images=await Promise.all(sizes.map(size=>readFile(new URL('../assets/app-icon.iconset/icon_'+size+'x'+size+'.png',import.meta.url))));
const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length;
images.forEach((png,i)=>{const at=6+i*16,size=sizes[i];header[at]=size===256?0:size;header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(png.length,at+8);header.writeUInt32LE(offset,at+12);offset+=png.length;});
await writeFile(new URL('../assets/app-icon.ico',import.meta.url),Buffer.concat([header,...images]));console.log('Windows ICO created.');
