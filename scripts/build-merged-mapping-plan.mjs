import {readFile} from 'node:fs/promises';
import {buildMergedNameRepair} from '../src/mapping/merged-repair.mjs';
const [backupFile,previousFile,currentFile]=process.argv.slice(2);if(!backupFile||!previousFile||!currentFile)throw new Error('usage: backup previous-source current-source');
const backup=JSON.parse(await readFile(backupFile,'utf8')),previous=JSON.parse(await readFile(previousFile,'utf8')),current=JSON.parse(await readFile(currentFile,'utf8'));
const plan=buildMergedNameRepair({currentValues:backup.values,previousProducts:previous.products,currentProducts:current.products});
process.stdout.write(JSON.stringify(plan));
