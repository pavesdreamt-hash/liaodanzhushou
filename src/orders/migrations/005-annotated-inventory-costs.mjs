export const migration005=Object.freeze({
  version:5,
  name:'annotated_inventory_costs',
  statements:[
    `ALTER TABLE order_items ADD COLUMN cost_raw_text TEXT`,
    `ALTER TABLE order_items ADD COLUMN cost_note TEXT`,
    `ALTER TABLE order_items ADD COLUMN not_sold_separately INTEGER NOT NULL DEFAULT 0 CHECK (not_sold_separately IN (0,1))`
  ]
});
