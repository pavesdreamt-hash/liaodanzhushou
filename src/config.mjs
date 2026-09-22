// This identity intentionally differs from every legacy KDocs build. Electron
// uses APP_NAME for the userData directory, so this product stays independent
// database, WhatsApp session, credentials and preferences.
export const APP_NAME='Liaodan Assistant Live';
export const DISPLAY_NAME='聊单助手';
export const SOURCE_URL='https://www.kdocs.cn/l/ccFsTP9rvhmp';
export const SOURCE_SHEET='Sheet1';
export const TARGET_SPREADSHEET_ID='1VMkplU-fcuF2-2BimrduNpmgCKJiUeNoMduGlqxHC4c';
export const TARGET_SPREADSHEET_URL=`https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}/edit`;
export const TARGET_TITLE='商品库存';
export const INVENTORY_SHEET='库存情况';
export const MAPPING_SHEET='商品映射';
export const INVENTORY_HEADERS=['商品编号','来源商品名称','成本变化','建议售价变化','库存变化','附加信息变化'];
export const MAPPING_HEADERS=['商品编号','来源匹配标识','来源商品名称','状态','备注'];
export const MAPPING_STATUSES=['正常','待编号','待确认','来源已移除'];
export const CORE_COLUMNS=['A','D','E','F','G'];
export const TIMEZONE='Asia/Shanghai';
export const SOURCE_RULES=Object.freeze({headerRow:1,minimumNamedProducts:140,minimumEndRow:170,minimumEndColumn:19,
  minimumPreviousRatio:0.90,maximumEmptyRatio:0.10,maximumNewEmptyRatio:0.05,maxScrollSteps:160});
// Business IDs are now user-owned text values. Source prefixes and model codes
// must never be converted into business IDs automatically.
export const CONFIRMED_BUSINESS_OVERRIDES=Object.freeze({});
