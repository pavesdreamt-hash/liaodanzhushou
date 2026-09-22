export const migration021=Object.freeze({version:21,name:'assistant_ai_cache',statements:[
 `CREATE TABLE order_assistant_ai_cache(order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,binding_revision INTEGER NOT NULL,cache_key TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(order_id,binding_revision,cache_key))`
]});
