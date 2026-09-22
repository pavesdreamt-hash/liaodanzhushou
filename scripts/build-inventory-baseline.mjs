import {readFile} from 'node:fs/promises';
import {buildFirstInventoryBaseline} from '../src/sync/baseline.mjs';
const args=process.argv.slice(2),skipMissingMappings=args.includes('--skip-missing'),files=args.filter(value=>value!=='--skip-missing');
const [mappingFile,sourceFile,previousSourceFile]=files;if(!mappingFile||!sourceFile)throw new Error('usage: mapping source [previous-source] [--skip-missing]');
const mapping=JSON.parse(await readFile(mappingFile,'utf8')),sourceSnapshot=JSON.parse(await readFile(sourceFile,'utf8'));
const previousSourceSnapshot=previousSourceFile?JSON.parse(await readFile(previousSourceFile,'utf8')):null;
process.stdout.write(JSON.stringify(buildFirstInventoryBaseline({mappingValues:mapping.values,sourceSnapshot,previousSourceSnapshot,now:new Date(),skipMissingMappings})));
