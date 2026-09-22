export const migration008=Object.freeze({
  version:8,
  name:'recipient_data_completion',
  statements:[
    `CREATE TABLE order_recipient_overrides (
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL CHECK (field_name IN ('lastName','firstName','phone','email','country','province','city','street','residence')),
      override_value TEXT NOT NULL CHECK (trim(override_value) <> ''),
      override_kind TEXT NOT NULL CHECK (override_kind IN ('manual','full_name_confirmation')),
      original_value_present INTEGER NOT NULL CHECK (original_value_present IN (0,1)),
      reason TEXT NOT NULL CHECK (trim(reason) <> ''),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(order_id,field_name)
    )`,
    `CREATE INDEX order_recipient_overrides_order_id_index ON order_recipient_overrides(order_id)`
  ]
});
