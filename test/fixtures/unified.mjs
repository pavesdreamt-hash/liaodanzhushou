import path from 'node:path';
import {LocalProducts} from '../../src/inventory/local-products.mjs';
import {UnifiedInventory} from '../../src/inventory/unified-inventory.mjs';
export function withUnified(f){const localProducts=new LocalProducts({directory:path.join(f.dir,'orders/local-products'),sourceRows:async()=>(await f.store.read()).latestCollection?.products||[]});return {...f,localProducts,unified:new UnifiedInventory({batch:f.service,catalog:f.catalog,localProducts})};}
