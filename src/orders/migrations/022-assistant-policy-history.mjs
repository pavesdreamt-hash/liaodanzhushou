export const migration022={version:22,name:'assistant_policy_history',statements:[
 `CREATE TABLE assistant_policy(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}')`,
 `ALTER TABLE order_assistant_ai_cache ADD COLUMN accessed_at TEXT`,
 `CREATE TABLE assistant_chat_archive(account_id TEXT NOT NULL,chat_id TEXT NOT NULL,message_id TEXT NOT NULL,direction TEXT NOT NULL,sent_at TEXT NOT NULL,body TEXT NOT NULL,metadata TEXT,PRIMARY KEY(account_id,chat_id,message_id))`,
 `CREATE INDEX assistant_archive_time ON assistant_chat_archive(account_id,chat_id,sent_at,message_id)`,
 `CREATE TABLE assistant_chat_progress(account_id TEXT NOT NULL,chat_id TEXT NOT NULL,payload TEXT NOT NULL DEFAULT '{}',revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account_id,chat_id))`
]};
