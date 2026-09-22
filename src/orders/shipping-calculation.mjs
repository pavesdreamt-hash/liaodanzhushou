export const PACKAGE_STATUSES=Object.freeze(['unshipped','outbound_processing','shipped_pending','signed','refused','cancelled_before_outbound','cancelled_after_outbound','fee_dispute']);
export const PENDING_PACKAGE_STATUSES=Object.freeze(['unshipped','outbound_processing','shipped_pending','fee_dispute']);
export const REALIZED_PACKAGE_STATUSES=Object.freeze(['signed','refused','cancelled_before_outbound','cancelled_after_outbound']);

export const isPendingPackageStatus=status=>PENDING_PACKAGE_STATUSES.includes(status);
export const isRealizedPackageStatus=status=>REALIZED_PACKAGE_STATUSES.includes(status);

export function requirePackageStatus(status){if(!PACKAGE_STATUSES.includes(status))throw new TypeError(`不支持的包裹状态：${status}`);return status;}
