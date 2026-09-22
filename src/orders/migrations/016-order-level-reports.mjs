export const migration016=Object.freeze({
  version:16,
  name:'order_level_reports_and_aed_cny_18',
  statements:[
    `ALTER TABLE orders ADD COLUMN report_date TEXT`,
    `ALTER TABLE orders ADD COLUMN report_sequence INTEGER CHECK (report_sequence IS NULL OR report_sequence>0)`,
    `ALTER TABLE orders ADD COLUMN report_number TEXT`,
    `UPDATE orders SET report_date=substr(COALESCE(shopplus_created_at,created_at),1,10) WHERE report_date IS NULL`,
    `UPDATE orders AS target SET report_sequence=(
      SELECT COUNT(*) FROM orders AS candidate
       WHERE substr(COALESCE(candidate.shopplus_created_at,candidate.created_at),1,10)=target.report_date
         AND (
           COALESCE(candidate.shopplus_created_at,candidate.created_at)<COALESCE(target.shopplus_created_at,target.created_at)
           OR (COALESCE(candidate.shopplus_created_at,candidate.created_at)=COALESCE(target.shopplus_created_at,target.created_at)
             AND COALESCE(candidate.fixed_sequence,0)<=COALESCE(target.fixed_sequence,0))
         )
    ) WHERE report_sequence IS NULL`,
    `UPDATE orders SET report_number=(CAST(substr(report_date,6,2) AS INTEGER)||'.'||CAST(substr(report_date,9,2) AS INTEGER)||'-'||report_sequence) WHERE report_number IS NULL`,
    `CREATE UNIQUE INDEX orders_report_day_sequence_unique ON orders(report_date,report_sequence) WHERE report_date IS NOT NULL AND report_sequence IS NOT NULL`,
    `CREATE UNIQUE INDEX orders_report_number_unique ON orders(report_number) WHERE report_number IS NOT NULL`,
    `UPDATE exchange_rate_rules SET is_enabled=0 WHERE currency_pair='AED/CNY' AND is_enabled=1`,
    `INSERT INTO exchange_rate_rules(id,version,currency_pair,rate_scaled,scale,effective_from,is_enabled,created_at)
      VALUES('aed-cny-2026-09-08-v2','2026-09-08-v2','AED/CNY',1800000,1000000,'2026-08-31T00:00:00.001Z',1,'2026-09-08T00:00:00.000Z')`,
    `UPDATE orders SET exchange_rate_rule_id='aed-cny-2026-09-08-v2',exchange_rate_version='2026-09-08-v2',exchange_rate_scaled=1800000,exchange_rate_scale=1000000 WHERE profit_status<>'final'`
  ]
});
