export const migration024={version:24,name:'assistant_online_sync',statements:[
 `CREATE TABLE assistant_online_sync(order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,binding_revision INTEGER NOT NULL,account_id TEXT NOT NULL,chat_id TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),revision INTEGER NOT NULL CHECK(revision>=0),payload TEXT NOT NULL CHECK(json_valid(payload)),updated_at TEXT NOT NULL)`
]};
