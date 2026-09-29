export const migration026={version:26,name:'shopplus_order_sync_attention',statements:[
  `CREATE TABLE order_sync_attention(
    order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    acknowledged_at TEXT
  )`,
  `CREATE INDEX idx_order_sync_attention_pending ON order_sync_attention(acknowledged_at,created_at)`
]};
