export const migration023={version:23,name:'assistant_stage_reminders',statements:[
 `CREATE TABLE order_assistant_stages(order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),payload TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload)),updated_at TEXT NOT NULL)`
]};
