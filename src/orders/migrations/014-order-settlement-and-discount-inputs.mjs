export const migration014=Object.freeze({
  version:14,
  name:'order_settlement_and_discount_inputs',
  statements:[
    `ALTER TABLE order_items ADD COLUMN discount_input_type TEXT NOT NULL DEFAULT 'AED' CHECK (discount_input_type IN ('AED','percent'))`,
    `ALTER TABLE order_items ADD COLUMN discount_input_value INTEGER CHECK (discount_input_value IS NULL OR discount_input_value>=0)`,
    `UPDATE order_items SET discount_input_value=COALESCE(manual_discount,line_gross-line_revenue,0) WHERE discount_input_value IS NULL`,
    `ALTER TABLE orders ADD COLUMN net_remittance INTEGER CHECK (net_remittance IS NULL OR net_remittance>=0)`,
    `ALTER TABLE orders ADD COLUMN remittance_registered_at TEXT`,
    `ALTER TABLE orders ADD COLUMN workflow_completed_at TEXT`,
    `UPDATE orders SET workflow_completed_at=COALESCE((SELECT MAX(COALESCE(p.fee_confirmed_at,p.status_updated_at,p.updated_at)) FROM packages p WHERE p.order_id=orders.id),updated_at) WHERE profit_status='final' AND NOT EXISTS(SELECT 1 FROM packages p WHERE p.order_id=orders.id AND p.package_status='signed')`,
    `CREATE TABLE product_discount_limits (
      sku_code TEXT PRIMARY KEY,
      limit_type TEXT NOT NULL CHECK (limit_type IN ('AED','percent')),
      limit_value INTEGER NOT NULL CHECK (limit_value>=0),
      updated_at TEXT NOT NULL
    )`
  ]
});
