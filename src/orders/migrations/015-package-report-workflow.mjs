export const migration015=Object.freeze({
  version:15,
  name:'package_report_workflow',
  statements:[
    `ALTER TABLE packages ADD COLUMN reported_at TEXT`,
    `UPDATE packages
       SET reported_at=COALESCE(status_updated_at,updated_at)
     WHERE package_status IN ('outbound_processing','shipped_pending','signed','refused','cancelled_after_outbound','fee_dispute')`
  ]
});
