import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const CATALOG_PATH = '/Users/apple/Library/Application Support/Liaodan Assistant Live/orders/shopplus-product-pilot/shopplus-product-pilot.json';
const MEDIA_DIRECTORY = path.dirname(CATALOG_PATH) + '/media';
const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, 'output/product-recommendation/mobile-single');
const FOOTER_PATH = path.join(PROJECT_ROOT, 'output/product-recommendation/footer-reference.png');
const OUTPUT_HTML = path.join(OUTPUT_DIRECTORY, 'product-recommendation-mobile-single-no-price.html');
const OUTPUT_IMAGE = path.join(OUTPUT_DIRECTORY, 'product-recommendation-mobile-single-no-price.jpg');
const CLOTHING_TERMS = /(衣|内裤|短裤|胸罩|内衣|制服|套装|丝袜|袜|睡衣|裙|服装|连体衣|情趣服|lingerie|costume|dress|skirt|\bbra\b|panty|underwear|clothing|apparel|bodysuit|stockings?|sleepwear|briefs?|jockstrap|thong)/i;
const VISUALLY_CONFIRMED_CLOTHING_CODES = new Set([
  '49', 'KY11', 'KY36', 'TY01', 'TY02', 'TY03', 'TY04', 'TY05', 'TY06', 'TY07',
  'TY08', 'TY09', 'TY10', 'TY11', 'TY12', 'TY13', 'TY14', 'TY15', 'TY16',
  'YB31', 'YB42', 'YB46', 'YB64', 'YB77',
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function productName(product) {
  return String(product.localName || product.sourceName || product.productNumber || 'Product').trim();
}

function productCode(product) {
  const match = productName(product).match(/^\s*([A-Za-z]{1,3}\d+|\d{1,3})/);
  return match ? match[1].toUpperCase() : String(product.productNumber || 'PRODUCT').trim();
}

function searchableProductText(product) {
  return [product.sourceName, product.localName, product.sourcePricing?.sourceName, product.sourceShortDescription]
    .filter(Boolean)
    .join(' ');
}

function isEligible(product) {
  return product.publishStatus === 1
    && product.stockKnown === true
    && Number(product.stockQuantity) > 0
    && product.image?.status === 'cached'
    && typeof product.image?.file === 'string'
    && !VISUALLY_CONFIRMED_CLOTHING_CODES.has(String(product.sourceName || '').trim())
    && !CLOTHING_TERMS.test(searchableProductText(product));
}

async function main() {
  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const [catalogText] = await Promise.all([fs.readFile(CATALOG_PATH, 'utf8'), fs.access(FOOTER_PATH)]);
  const catalog = JSON.parse(catalogText);
  const products = (catalog.products || []).filter(isEligible).sort((left, right) => productName(left).localeCompare(productName(right), 'en'));
  const canvasWidth = 1080;
  const columns = 3;
  const sidePadding = 20;
  const gap = 12;
  const cardHeight = 366;
  const imageHeight = 280;
  const headerHeight = 162;
  const footerHeight = 229;
  const cardWidth = (canvasWidth - sidePadding * 2 - gap) / columns;
  const rows = Math.ceil(products.length / columns);
  const posterHeight = headerHeight + rows * cardHeight + (rows - 1) * gap + 32 + footerHeight;
  const cards = products.map((product) => `
    <article class="product-card">
      <div class="image-wrap"><img src="${pathToFileURL(path.join(MEDIA_DIRECTORY, product.image.file)).href}" alt="" /></div>
      <div class="code">${escapeHtml(productCode(product))}</div>
    </article>`).join('');

  const html = `<!doctype html>
  <html lang="en"><head><meta charset="utf-8" /><title>Mobile product recommendations</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #f8f4fb; }
    body { width: ${canvasWidth}px; color: #4b1c61; font-family: Arial, "Noto Sans", sans-serif; }
    .poster { width: ${canvasWidth}px; min-height: ${posterHeight}px; background: radial-gradient(circle at 50% 0%, #ffffff 0 10%, transparent 41%), linear-gradient(180deg, #f4eafa 0%, #fffdfd 44%, #f6e9f8 100%); }
    .header { height: ${headerHeight}px; padding: 30px 32px 18px; text-align: center; border-bottom: 2px solid #e6cdee; }
    h1 { margin: 0; color: #5d1b75; font-size: 48px; line-height: 1; letter-spacing: 2.2px; font-weight: 900; }
    .subtitle { margin-top: 13px; color: #a04295; font-size: 21px; font-weight: 800; letter-spacing: 1.2px; }
    .grid { display: grid; grid-template-columns: repeat(${columns}, ${cardWidth}px); gap: ${gap}px; padding: 0 ${sidePadding}px 32px; }
    .product-card { height: ${cardHeight}px; overflow: hidden; padding: 11px 12px 12px; border: 2px solid #d9c0e8; border-radius: 24px; background: #fff; box-shadow: 0 6px 14px rgba(91,31,115,.14); color: #3f1754; text-align: center; }
    .image-wrap { height: ${imageHeight}px; display: grid; place-items: center; border-radius: 17px; background: #fff; }
    .image-wrap img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
    .code { height: 48px; display: grid; place-items: center; overflow: hidden; margin: 10px 4px 0; padding: 2px 8px; border: 2px solid #e2c8ef; border-radius: 12px; background: #f6edf9; color: #4b1765; font-size: 31px; line-height: 1; font-weight: 900; letter-spacing: .7px; }
    .footer { width: ${canvasWidth}px; height: ${footerHeight}px; overflow: hidden; background: #fff; }
    .footer img { display: block; width: 100%; height: 100%; object-fit: fill; }
  </style></head>
  <body><main class="poster"><header class="header"><h1>PRODUCT RECOMMENDATIONS</h1><div class="subtitle">${products.length} IN-STOCK PRODUCTS</div></header><section class="grid">${cards}</section><footer class="footer"><img src="${pathToFileURL(FOOTER_PATH).href}" alt="Factory and delivery information" /></footer></main></body></html>`;
  await fs.writeFile(OUTPUT_HTML, html, 'utf8');
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: canvasWidth, height: 1200 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(OUTPUT_HTML).href, { waitUntil: 'load' });
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: OUTPUT_IMAGE, type: 'jpeg', quality: 92, fullPage: true });
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify({ image: OUTPUT_IMAGE, html: OUTPUT_HTML, includedProducts: products.length, excludedClothingOrWearableProducts: (catalog.products || []).length - products.length, dimensions: `${canvasWidth}x${posterHeight}` }, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
