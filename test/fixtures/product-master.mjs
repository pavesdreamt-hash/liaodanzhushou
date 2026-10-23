import path from 'node:path';
import {taskActionsFixture} from './task-actions.mjs';
import {LocalProducts} from '../../src/inventory/local-products.mjs';import {UnifiedInventory} from '../../src/inventory/unified-inventory.mjs';import {WebsiteProductBridge} from '../../src/inventory/website-product-bridge.mjs';
export async function masterFixture(){
 const f=await taskActionsFixture(),local=new LocalProducts({directory:path.join(f.dir,'orders/local-products'),sourceRows:async()=>(await f.store.read()).latestCollection.products});f.service.localProducts=local;const unified=new UnifiedInventory({batch:f.service,catalog:f.catalog,localProducts:local}),writes=[];
 f.connection.updateProductContent=async({productId,changes})=>{writes.push({kind:'content',productId,changes});Object.assign(f.web.get(productId),changes);return{result:true};};
 f.connection.updateProductFields=async({productId,variants})=>{writes.push({kind:'fields',productId,variants});for(const patch of variants){const v=f.web.get(productId).productVariantDTOs.find(v=>v.id===patch.id);if(patch.salePrice!==undefined)v.salePrice=patch.salePrice;if(patch.availableStockQuantity!==undefined)v.productVariantInventoryDTO.availableStockQuantity=patch.availableStockQuantity;}return{};};
 const bridge=new WebsiteProductBridge({unified,localProducts:local,catalog:f.catalog,connection:f.connection});return {...f,local,unified,bridge,masterWrites:writes};
}
