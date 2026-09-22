export const migration006=Object.freeze({
  version:6,
  name:'order_fulfillment_reports',
  statements:[
    `ALTER TABLE orders ADD COLUMN order_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (order_confirmed IN (0,1))`,
    `ALTER TABLE orders ADD COLUMN order_confirmed_at TEXT`,
    `ALTER TABLE orders ADD COLUMN order_confirmation_note TEXT`,
    `ALTER TABLE packages ADD COLUMN status_updated_at TEXT`,
    `UPDATE packages SET status_updated_at=updated_at WHERE status_updated_at IS NULL`
  ]
});
