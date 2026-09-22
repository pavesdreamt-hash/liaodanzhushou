export const migration019=Object.freeze({version:19,name:'assistant_range_mode',statements:[
  "ALTER TABLE order_assistant ADD COLUMN scope_end_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(scope_end_mode IN ('fixed','latest'))"
]});
