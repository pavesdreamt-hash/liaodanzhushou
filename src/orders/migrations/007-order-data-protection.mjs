export const migration007=Object.freeze({
  version:7,
  name:'order_data_protection',
  statements:[
    `CREATE TABLE order_app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `INSERT INTO order_app_metadata(key,value) VALUES('database_identity','kdocs-inventory-orders')`,
    `INSERT INTO order_app_metadata(key,value) VALUES('backup_format_version','1')`,
    `CREATE TABLE order_data_audit (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      event_time TEXT NOT NULL,
      details TEXT
    )`,
    `CREATE INDEX idx_order_data_audit_time ON order_data_audit(event_time)`
  ]
});
