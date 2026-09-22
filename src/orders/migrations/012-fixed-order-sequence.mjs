export const migration012=Object.freeze({
  version:12,
  name:'fixed_order_sequence',
  statements:[
    `ALTER TABLE orders ADD COLUMN fixed_sequence INTEGER CHECK (fixed_sequence IS NULL OR fixed_sequence>0)`,
    `UPDATE orders SET fixed_sequence=(
      SELECT ranked.fixed_sequence FROM (
        SELECT id,ROW_NUMBER() OVER (ORDER BY COALESCE(shopplus_created_at,created_at),id) fixed_sequence
        FROM orders
      ) ranked WHERE ranked.id=orders.id
    )`,
    `CREATE UNIQUE INDEX orders_fixed_sequence_unique ON orders(fixed_sequence)`,
    `INSERT INTO order_app_metadata(key,value)
      VALUES('last_order_fixed_sequence',CAST((SELECT COALESCE(MAX(fixed_sequence),0) FROM orders) AS TEXT))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ]
});
