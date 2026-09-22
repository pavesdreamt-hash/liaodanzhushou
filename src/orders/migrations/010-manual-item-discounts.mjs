export const migration010=Object.freeze({
  version:10,
  name:'manual_item_discounts',
  statements:[
    `ALTER TABLE order_items ADD COLUMN source_line_revenue INTEGER`,
    `ALTER TABLE order_items ADD COLUMN manual_discount INTEGER CHECK (manual_discount IS NULL OR manual_discount>=0)`,
    `UPDATE order_items SET source_line_revenue=line_revenue WHERE source_line_revenue IS NULL`
  ]
});
