export const migration018=Object.freeze({version:18,name:'assistant_read_integrity',statements:[
 'ALTER TABLE order_assistant ADD COLUMN browser_binding TEXT',
 'ALTER TABLE order_assistant ADD COLUMN read_issue TEXT',
 'ALTER TABLE order_assistant ADD COLUMN read_revision INTEGER NOT NULL DEFAULT 0',
 'ALTER TABLE order_chat_messages ADD COLUMN metadata TEXT'
]});
