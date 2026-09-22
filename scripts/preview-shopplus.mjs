import {DatabaseSync} from 'node:sqlite';
import {access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {previewShopPlusExcel} from '../src/orders/shopplus-import.mjs';
import {loadLocalCostCatalog} from '../src/orders/cost-catalog.mjs';
import {orderDatabasePath} from '../src/orders/database.mjs';

const filePath=process.argv[2];if(!filePath){console.error('用法：npm run orders:preview-shopplus -- "/path/to/orders.xlsx|orders.xls|orders.csv"');process.exitCode=2;}else{
  const userData=path.join(os.homedir(),'Library','Application Support','KDocs Order Assistant'),databaseFile=orderDatabasePath(userData);let database=null;
  try{await access(databaseFile);database=new DatabaseSync(databaseFile,{readOnly:true});}catch{}
  try{const costCatalog=await loadLocalCostCatalog(userData),preview=await previewShopPlusExcel(path.resolve(filePath),{database,costCatalog});console.log(JSON.stringify({
      filename:preview.filename,sheetName:preview.sheetName,fileSha256:preview.fileSha256,totalRows:preview.totalRows,alreadyImportedFile:preview.alreadyImportedFile,...preview.summary,
      warningCodes:Object.entries(Object.groupBy(preview.warnings,value=>value.code)).map(([code,values])=>({code,count:values.length})),
      blockingErrorCodes:Object.entries(Object.groupBy(preview.blockingErrors,value=>value.code)).map(([code,values])=>({code,count:values.length}))
    },null,2));
  }catch(error){console.error(JSON.stringify({ok:false,code:error.code||'SHOPPLUS_PREVIEW_FAILED',message:error.message},null,2));process.exitCode=1;}finally{database?.close();}
}
