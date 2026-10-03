import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const CATALOG_PATH = '/Users/apple/Library/Application Support/Liaodan Assistant Live/orders/shopplus-product-pilot/shopplus-product-pilot.json';
const MEDIA_DIRECTORY = path.dirname(CATALOG_PATH) + '/media';
const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, 'output/product-recommendation/mobile');
const BACKGROUND_PATH = path.join(PROJECT_ROOT, 'output/product-recommendation/purple-magenta-background.png');
const FOOTER_PATH = path.join(PROJECT_ROOT, 'output/product-recommendation/footer-reference.png');
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

function priceLabel(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : 'Price unavailable';
}

function chunk(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function renderPage({ browser, products, pageNumber, totalPages }) {
  const canvasWidth = 1080;
  const columns = 2;
  const cardHeight = 406;
  const headerHeight = 184;
  const gap = 16;
  const sidePadding = 26;
  const footerHeight = 229;
  const cardWidth = (canvasWidth - sidePadding * 2 - gap) / columns;
  const rows = Math.ceil(products.length / columns);
  const posterHeight = headerHeight + rows * cardHeight + Math.max(rows - 1, 0) * gap + 32 + footerHeight;
  const cards = products.map((product) => `
    <article class="product-card">
      <div class="image-wrap"><img src="${pathToFileURL(path.join(MEDIA_DIRECTORY, product.image.file)).href}" alt="" /></div>
      <div class="name">${escapeHtml(productName(product))}</div>
      <div class="price-label">WEBSITE PRICE</div>
      <div class="price">${escapeHtml(priceLabel(product.websitePriceAed))}</div>
    </article>`).join('');
  const outputBase = `product-recommendation-mobile-${String(pageNumber).padStart(2, '0')}-of-${String(totalPages).padStart(2, '0')}`;
  const outputHtml = path.join(OUTPUT_DIRECTORY, `${outputBase}.html`);
  const outputImage = path.join(OUTPUT_DIRECTORY, `${outputBase}.png`);
  const html = `<!doctype html>
  <html lang="en"><head><meta charset="utf-8" /><title>Mobile product recommendations ${pageNumber}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #21024a; }
    body { width: ${canvasWidth}px; color: #fff; font-family: Arial, "Noto Sans", sans-serif; }
    .poster { width: ${canvasWidth}px; min-height: ${posterHeight}px; background: #4a0a7b url("${pathToFileURL(BACKGROUND_PATH).href}") center top / 100% auto no-repeat; }
    .header { height: ${headerHeight}px; padding: 28px 32px 16px; text-align: center; text-shadow: 0 4px 10px rgba(0,0,0,.38); }
    h1 { margin: 0; font-size: 48px; line-height: 1; letter-spacing: 2.2px; font-weight: 900; }
    .subtitle { margin-top: 12px; color: #f7dcff; font-size: 20px; font-weight: 800; letter-spacing: 1px; }
    .page-number { margin-top: 12px; color: #fff2fb; font-size: 17px; font-weight: 800; letter-spacing: .7px; }
    .grid { display: grid; grid-template-columns: repeat(${columns}, ${cardWidth}px); gap: ${gap}px; padding: 0 ${sidePadding}px 32px; }
    .product-card { height: ${cardHeight}px; overflow: hidden; padding: 11px 12px 13px; border: 3px solid rgba(255,255,255,.88); border-radius: 24px; background: rgba(255,255,255,.97); box-shadow: 0 9px 18px rgba(24,0,45,.38); color: #2f1645; text-align: center; }
    .image-wrap { height: 250px; display: grid; place-items: center; overflow: hidden; border-radius: 17px; background: #fff; }
    .image-wrap img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .name { height: 48px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 10px 4px 0; font-size: 25px; line-height: 24px; font-weight: 900; }
    .price-label { margin-top: 3px; color: #7c398d; font-size: 12px; font-weight: 900; letter-spacing: 1.2px; }
    .price { margin-top: 2px; color: #b30a86; font-size: 30px; line-height: 30px; font-weight: 900; }
    .footer { width: ${canvasWidth}px; height: ${footerHeight}px; overflow: hidden; background: #fff; }
    .footer img { display: block; width: 100%; height: 100%; object-fit: fill; }
  </style></head>
  <body><main class="poster"><header class="header"><h1>PRODUCT RECOMMENDATIONS</h1><div class="subtitle">IN-STOCK PRODUCTS · WEBSITE PRICES</div><div class="page-number">PAGE ${pageNumber} / ${totalPages}</div></header><section class="grid">${cards}</section><footer class="footer"><img src="${pathToFileURL(FOOTER_PATH).href}" alt="Factory and delivery information" /></footer></main></body></html>`;
  await fs.writeFile(outputHtml, html, 'utf8');
  const page = await browser.newPage({ viewport: { width: canvasWidth, height: 1200 }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(outputHtml).href, { waitUntil: 'load' });
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: outputImage, fullPage: true });
  } finally {
    await page.close();
  }
  return { outputImage, outputHtml, productCount: products.length, posterHeight };
}

async function main() {
  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const [catalogText] = await Promise.all([fs.readFile(CATALOG_PATH, 'utf8'), fs.access(BACKGROUND_PATH), fs.access(FOOTER_PATH)]);
  const catalog = JSON.parse(catalogText);
  const products = (catalog.products || []).filter(isEligible).sort((left, right) => productName(left).localeCompare(productName(right), 'en'));
  const pages = chunk(products, 16);
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const results = [];
    for (let index = 0; index < pages.length; index += 1) {
      results.push(await renderPage({ browser, products: pages[index], pageNumber: index + 1, totalPages: pages.length }));
    }
    await fs.writeFile(path.join(OUTPUT_DIRECTORY, 'manifest.json'), JSON.stringify({ includedProducts: products.length, excludedClothingOrWearableProducts: (catalog.products || []).length - products.length, pages: results }, null, 2) + '\n', 'utf8');
    process.stdout.write(JSON.stringify({ includedProducts: products.length, pages: results }, null, 2) + '\n');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
