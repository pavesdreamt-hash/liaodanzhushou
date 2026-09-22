export const migration025={
  version:25,
  name:'business_dashboard_v1',
  statements:[
    `CREATE TABLE product_profiles (
      business_id TEXT PRIMARY KEY,
      display_name TEXT,
      category TEXT,
      website_url TEXT,
      actual_price_fils INTEGER,
      actual_price_checked_at TEXT,
      pending_price_fils INTEGER,
      pending_price_detected_at TEXT,
      source_cost_text TEXT,
      suggested_price_text TEXT,
      inventory_status TEXT NOT NULL DEFAULT '未知' CHECK(inventory_status IN ('有货','无货','未知')),
      inventory_checked_at TEXT,
      chat_enabled INTEGER NOT NULL DEFAULT 1 CHECK(chat_enabled IN (0,1)),
      image_paths TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE daily_operating_costs (
      day TEXT PRIMARY KEY CHECK(day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      ad_usd_cents INTEGER NOT NULL DEFAULT 0 CHECK(ad_usd_cents>=0),
      usd_cny_rate_scaled INTEGER NOT NULL DEFAULT 7200000 CHECK(usd_cny_rate_scaled>0),
      account_cost_cny_fen INTEGER NOT NULL DEFAULT 0 CHECK(account_cost_cny_fen>=0),
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE order_lifecycle (
      order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','void','recycle')),
      recycled_at TEXT,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX idx_order_lifecycle_state ON order_lifecycle(state,recycled_at)`,
    `CREATE TABLE app_preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `UPDATE assistant_policy SET payload=json_set(payload,'$.retentionDays',90,'$.mediaRetentionDays',45),revision=revision+1 WHERE id=1`
  ]
};
