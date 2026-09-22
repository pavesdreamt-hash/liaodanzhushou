const CREATED_AT='2026-08-31T00:00:00.000Z';
const RULE_SET_ID='fee-rules-2026-08-31-v1';

export const migration002=Object.freeze({
  version:2,
  name:'versioned_shipping_realized_profit_and_exchange_rate',
  statements:[
    `ALTER TABLE orders ADD COLUMN projected_profit INTEGER`,
    `ALTER TABLE orders ADD COLUMN realized_profit INTEGER`,
    `ALTER TABLE orders ADD COLUMN legacy_total_profit INTEGER`,
    `ALTER TABLE orders ADD COLUMN profit_review_required INTEGER NOT NULL DEFAULT 0 CHECK (profit_review_required IN (0,1))`,
    `ALTER TABLE orders ADD COLUMN exchange_rate_rule_id TEXT`,
    `ALTER TABLE orders ADD COLUMN exchange_rate_version TEXT`,
    `ALTER TABLE orders ADD COLUMN exchange_rate_scaled INTEGER`,
    `ALTER TABLE orders ADD COLUMN exchange_rate_scale INTEGER`,
    `ALTER TABLE orders ADD COLUMN projected_rmb_settlement INTEGER`,
    `ALTER TABLE orders ADD COLUMN realized_rmb_settlement INTEGER`,
    `ALTER TABLE orders ADD COLUMN rmb_settlement_status TEXT NOT NULL DEFAULT 'pending' CHECK (rmb_settlement_status IN ('final','pending','incomplete'))`,
    `UPDATE orders SET delivery_status='cancelled_before_outbound' WHERE delivery_status='cancelled_before_shipping'`,
    `UPDATE orders SET legacy_total_profit=total_profit,total_profit=NULL,projected_profit=NULL,realized_profit=NULL,profit_status='incomplete',profit_review_required=1,rmb_settlement_status='incomplete'`,

    `ALTER TABLE packages RENAME TO packages_v1`,
    `CREATE TABLE packages (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      series_code TEXT NOT NULL,
      package_status TEXT NOT NULL CHECK (package_status IN ('unshipped','outbound_processing','shipped_pending','signed','refused','cancelled_before_outbound','cancelled_after_outbound','fee_dispute')),
      delivery_zone TEXT NOT NULL DEFAULT 'unclassified' CHECK (delivery_zone IN ('urban','remote','unclassified')),
      projected_shipping_fee INTEGER CHECK (projected_shipping_fee IS NULL OR projected_shipping_fee >= 0),
      shipping_fee INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
      delivery_fee INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
      handling_fee INTEGER NOT NULL DEFAULT 0 CHECK (handling_fee >= 0),
      shipping_fee_finalized INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee_finalized IN (0,1)),
      fee_rule_set_id TEXT,
      fee_rule_version TEXT,
      fee_rule_id TEXT,
      fee_overridden INTEGER NOT NULL DEFAULT 0 CHECK (fee_overridden IN (0,1)),
      fee_override_reason TEXT,
      fee_overridden_at TEXT,
      fee_dispute_note TEXT,
      legacy_shipping_fee INTEGER,
      tracking_number TEXT,
      logistics_company TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(order_id,series_code)
    )`,
    `INSERT INTO packages(id,order_id,series_code,package_status,delivery_zone,projected_shipping_fee,shipping_fee,delivery_fee,handling_fee,shipping_fee_finalized,
      fee_rule_set_id,fee_rule_version,fee_rule_id,fee_overridden,fee_override_reason,fee_overridden_at,fee_dispute_note,legacy_shipping_fee,tracking_number,logistics_company,created_at,updated_at)
      SELECT id,order_id,series_code,CASE WHEN package_status='cancelled_before_shipping' THEN 'cancelled_before_outbound' ELSE package_status END,
      'unclassified',NULL,0,0,0,0,NULL,NULL,NULL,0,NULL,NULL,
      CASE WHEN shipping_fee<>0 OR package_status IN ('signed','refused','cancelled_before_shipping') THEN 'Legacy v1 shipping result requires review' ELSE NULL END,
      shipping_fee,tracking_number,logistics_company,created_at,updated_at FROM packages_v1`,

    `ALTER TABLE order_items RENAME TO order_items_v1`,
    `CREATE TABLE order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_sequence INTEGER NOT NULL,
      shopplus_sub_order_id TEXT,
      sku_code TEXT,
      product_name_snapshot TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_list_price INTEGER NOT NULL CHECK (unit_list_price >= 0),
      unit_actual_price INTEGER NOT NULL CHECK (unit_actual_price >= 0),
      unit_cost_snapshot INTEGER CHECK (unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0),
      package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
      allocated_shipping_fee INTEGER NOT NULL DEFAULT 0 CHECK (allocated_shipping_fee >= 0),
      line_revenue INTEGER NOT NULL CHECK (line_revenue >= 0),
      line_cost INTEGER CHECK (line_cost IS NULL OR line_cost >= 0),
      line_profit INTEGER,
      projected_allocated_shipping_fee INTEGER,
      realized_allocated_shipping_fee INTEGER,
      projected_line_profit INTEGER,
      realized_line_revenue INTEGER,
      realized_line_cost INTEGER,
      realized_line_profit INTEGER,
      legacy_allocated_shipping_fee INTEGER,
      legacy_line_profit INTEGER,
      cost_source TEXT,
      needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(order_id,item_sequence)
    )`,
    `INSERT INTO order_items(id,order_id,item_sequence,shopplus_sub_order_id,sku_code,product_name_snapshot,quantity,unit_list_price,unit_actual_price,unit_cost_snapshot,package_id,
      allocated_shipping_fee,line_revenue,line_cost,line_profit,projected_allocated_shipping_fee,realized_allocated_shipping_fee,projected_line_profit,realized_line_revenue,
      realized_line_cost,realized_line_profit,legacy_allocated_shipping_fee,legacy_line_profit,cost_source,needs_review,created_at,updated_at)
      SELECT id,order_id,ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY rowid),shopplus_sub_order_id,sku_code,product_name_snapshot,quantity,unit_list_price,unit_actual_price,unit_cost_snapshot,package_id,
      0,line_revenue,line_cost,NULL,NULL,NULL,NULL,NULL,NULL,NULL,allocated_shipping_fee,line_profit,cost_source,1,created_at,updated_at FROM order_items_v1`,
    `CREATE INDEX order_items_order_id_index_v2 ON order_items(order_id)`,
    `CREATE INDEX packages_order_id_index_v2 ON packages(order_id)`,

    `ALTER TABLE order_events RENAME TO order_events_v1`,
    `CREATE TABLE order_events (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      package_id TEXT REFERENCES packages(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      event_time TEXT NOT NULL,
      note TEXT
    )`,
    `INSERT INTO order_events(id,order_id,package_id,event_type,old_value,new_value,event_time,note)
      SELECT id,order_id,package_id,event_type,old_value,new_value,event_time,note FROM order_events_v1`,
    `CREATE INDEX order_events_order_id_index_v2 ON order_events(order_id,event_time)`,
    `DROP TABLE order_events_v1`,
    `DROP TABLE order_items_v1`,
    `DROP TABLE packages_v1`,

    `CREATE TABLE fee_rule_sets (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      effective_from TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE fee_rules (
      id TEXT PRIMARY KEY,
      rule_set_id TEXT NOT NULL REFERENCES fee_rule_sets(id) ON DELETE RESTRICT,
      delivery_zone TEXT NOT NULL CHECK (delivery_zone IN ('urban','remote','any')),
      package_status TEXT NOT NULL CHECK (package_status IN ('signed','refused','cancelled_before_outbound','cancelled_after_outbound')),
      delivery_fee INTEGER NOT NULL CHECK (delivery_fee >= 0),
      handling_fee INTEGER NOT NULL CHECK (handling_fee >= 0),
      total_fee INTEGER NOT NULL CHECK (total_fee = delivery_fee + handling_fee),
      is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
      created_at TEXT NOT NULL,
      UNIQUE(rule_set_id,delivery_zone,package_status)
    )`,
    `INSERT INTO fee_rule_sets(id,version,effective_from,is_enabled,created_at) VALUES('${RULE_SET_ID}','2026-08-31-v1','${CREATED_AT}',1,'${CREATED_AT}')`,
    `INSERT INTO fee_rules(id,rule_set_id,delivery_zone,package_status,delivery_fee,handling_fee,total_fee,is_enabled,created_at) VALUES
      ('fee-urban-signed-v1','${RULE_SET_ID}','urban','signed',4500,200,4700,1,'${CREATED_AT}'),
      ('fee-remote-signed-v1','${RULE_SET_ID}','remote','signed',5500,200,5700,1,'${CREATED_AT}'),
      ('fee-urban-refused-v1','${RULE_SET_ID}','urban','refused',300,200,500,1,'${CREATED_AT}'),
      ('fee-remote-refused-v1','${RULE_SET_ID}','remote','refused',300,200,500,1,'${CREATED_AT}'),
      ('fee-any-cancel-before-v1','${RULE_SET_ID}','any','cancelled_before_outbound',0,0,0,1,'${CREATED_AT}'),
      ('fee-any-cancel-after-v1','${RULE_SET_ID}','any','cancelled_after_outbound',0,200,200,1,'${CREATED_AT}')`,
    `CREATE TRIGGER fee_rules_financial_fields_immutable BEFORE UPDATE ON fee_rules
      WHEN NEW.id<>OLD.id OR NEW.rule_set_id<>OLD.rule_set_id OR NEW.delivery_zone<>OLD.delivery_zone OR NEW.package_status<>OLD.package_status OR
        NEW.delivery_fee<>OLD.delivery_fee OR NEW.handling_fee<>OLD.handling_fee OR NEW.total_fee<>OLD.total_fee OR NEW.created_at<>OLD.created_at
      BEGIN SELECT RAISE(ABORT,'fee rule values are immutable; create a new version'); END`,
    `CREATE TRIGGER fee_rules_no_delete BEFORE DELETE ON fee_rules BEGIN SELECT RAISE(ABORT,'fee rules cannot be deleted'); END`,
    `CREATE TRIGGER fee_rule_sets_identity_immutable BEFORE UPDATE ON fee_rule_sets
      WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version OR NEW.effective_from<>OLD.effective_from OR NEW.created_at<>OLD.created_at
      BEGIN SELECT RAISE(ABORT,'fee rule set identity is immutable; create a new version'); END`,
    `CREATE TRIGGER fee_rule_sets_no_delete BEFORE DELETE ON fee_rule_sets BEGIN SELECT RAISE(ABORT,'fee rule sets cannot be deleted'); END`,

    `CREATE TABLE exchange_rate_rules (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      currency_pair TEXT NOT NULL,
      rate_scaled INTEGER NOT NULL CHECK (rate_scaled > 0),
      scale INTEGER NOT NULL CHECK (scale > 0),
      effective_from TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
      created_at TEXT NOT NULL
    )`,
    `INSERT INTO exchange_rate_rules(id,version,currency_pair,rate_scaled,scale,effective_from,is_enabled,created_at)
      VALUES('aed-cny-2026-08-31-v1','2026-08-31-v1','AED/CNY',1750000,1000000,'${CREATED_AT}',1,'${CREATED_AT}')`,
    `CREATE TRIGGER exchange_rate_values_immutable BEFORE UPDATE ON exchange_rate_rules
      WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version OR NEW.currency_pair<>OLD.currency_pair OR NEW.rate_scaled<>OLD.rate_scaled OR NEW.scale<>OLD.scale OR NEW.effective_from<>OLD.effective_from OR NEW.created_at<>OLD.created_at
      BEGIN SELECT RAISE(ABORT,'exchange rate values are immutable; create a new version'); END`,
    `CREATE TRIGGER exchange_rate_no_delete BEFORE DELETE ON exchange_rate_rules BEGIN SELECT RAISE(ABORT,'exchange rates cannot be deleted'); END`
  ]
});
