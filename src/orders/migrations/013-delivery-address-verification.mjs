export const migration013=Object.freeze({
  version:13,
  name:'delivery_address_verification',
  statements:[
    `CREATE TABLE order_delivery_verifications(
      order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      verification_status TEXT NOT NULL CHECK(verification_status IN ('deliverable','out_of_range','unusable','failed')),
      normalized_address TEXT,
      latitude_e7 INTEGER,
      longitude_e7 INTEGER,
      match_basis TEXT,
      address_fingerprint TEXT NOT NULL,
      checked_at TEXT NOT NULL
    )`
  ]
});
