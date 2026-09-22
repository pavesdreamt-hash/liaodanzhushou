export const migration011=Object.freeze({
  version:11,
  name:'address_verification',
  statements:[
    `CREATE TABLE order_address_verifications(
      order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      verification_status TEXT NOT NULL CHECK(verification_status IN ('matched','not_matched')),
      checked_at TEXT NOT NULL
    )`
  ]
});
