export const migration020=Object.freeze({version:20,name:'assistant_workspace',statements:[
  `CREATE TABLE order_assistant_workspace(
    order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT
  )`
]});
