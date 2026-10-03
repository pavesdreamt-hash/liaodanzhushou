import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const CATALOG_PATH = '/Users/apple/Library/Application Support/Liaodan Assistant Live/orders/shopplus-product-pilot/shopplus-product-pilot.json';
const MEDIA_DIRECTORY = path.dirname(CATALOG_PATH) + '/media';
const FOOTER_PATH = '/var/folders/9d/hvfp6cg508qcj_vpfyf0y0zr0000gn/T/codex-clipboard-56761553-fa73-429c-828a-2838b66f7cb7.png';
const BACKGROUND_PATH = path.join(PROJECT_ROOT, 'output/product-recommendation/purple-magenta-background.png');
const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, 'output/product-recommendation');
const OUTPUT_IMAGE = path.join(OUTPUT_DIRECTORY, 'product-recommendation-2026-10-01.png');
const OUTPUT_HTML = path.join(OUTPUT_DIRECTORY, 'product-recommendation-2026-10-01.html');

const CLOTHING_TERMS = /(衣|内裤|短裤|胸罩|内衣|制服|套装|丝袜|袜|睡衣|裙|服装|连体衣|情趣服|lingerie|costume|dress|skirt|\bbra\b|panty|underwear|clothing|apparel|bodysuit|stockings?|sleepwear|briefs?|jockstrap|thong)/i;
// The catalog uses short internal codes for these items. The primary images were
// visually reviewed so clothes and wearable lingerie are excluded even though
// their source names contain no clothing keyword.
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
  return [
    product.sourceName,
    product.localName,
    product.sourcePricing?.sourceName,
    product.sourceShortDescription,
  ].filter(Boolean).join(' ');
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

async function main() {
  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const [catalogText] = await Promise.all([
    fs.readFile(CATALOG_PATH, 'utf8'),
    fs.access(FOOTER_PATH),
    fs.access(BACKGROUND_PATH),
  ]);
  const catalog = JSON.parse(catalogText);
  const products = (catalog.products || [])
    .filter(isEligible)
    .sort((left, right) => productName(left).localeCompare(productName(right), 'en'));

  if (products.length === 0) {
    throw new Error('No in-stock cached product images are available for the recommendation poster.');
  }

  const canvasWidth = 4096;
  const columns = 12;
  const cardHeight = 332;
  const headerHeight = 324;
  const gap = 20;
  const sidePadding = 42;
  const rows = Math.ceil(products.length / columns);
  const gridHeight = rows * cardHeight + (rows - 1) * gap;
  const footerHeight = 869;
  const posterHeight = headerHeight + gridHeight + 48 + footerHeight;
  const cardWidth = (canvasWidth - sidePadding * 2 - gap * (columns - 1)) / columns;

  const cards = products.map((product) => {
    const imagePath = path.join(MEDIA_DIRECTORY, product.image.file);
    const imageUrl = pathToFileURL(imagePath).href;
    return `
      <article class="product-card">
        <div class="image-wrap"><img src="${imageUrl}" alt="" /></div>
        <div class="name">${escapeHtml(productName(product))}</div>
        <div class="price-label">WEBSITE PRICE</div>
        <div class="price">${escapeHtml(priceLabel(product.websitePriceAed))}</div>
      </article>`;
  }).join('');

  const backgroundUrl = pathToFileURL(BACKGROUND_PATH).href;
  const footerUrl = pathToFileURL(FOOTER_PATH).href;
  const html = `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Product recommendations</title>
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #1b063f; }
        body { width: ${canvasWidth}px; color: #fff; font-family: Arial, "Noto Sans", sans-serif; }
        .poster {
          width: ${canvasWidth}px;
          min-height: ${posterHeight}px;
          background: #4a0a7b url("${backgroundUrl}") center top / 100% auto no-repeat;
        }
        .header { height: ${headerHeight}px; display: grid; place-content: center; text-align: center; padding: 32px 80px 26px; }
        h1 { margin: 0; font-size: 114px; line-height: 1; letter-spacing: 10px; font-weight: 800; text-shadow: 0 6px 16px rgba(0, 0, 0, .35); }
        .subtitle { margin-top: 22px; font-size: 30px; letter-spacing: 3px; font-weight: 700; color: #f7dcff; text-transform: uppercase; }
        .grid { display: grid; grid-template-columns: repeat(${columns}, ${cardWidth}px); gap: ${gap}px; padding: 0 ${sidePadding}px 48px; }
        .product-card {
          height: ${cardHeight}px;
          overflow: hidden;
          border: 3px solid rgba(255,255,255,.8);
          border-radius: 22px;
          background: rgba(255,255,255,.95);
          box-shadow: 0 10px 22px rgba(18, 0, 43, .42);
          color: #2f1645;
          text-align: center;
          padding: 10px 10px 13px;
        }
        .image-wrap { height: 204px; display: grid; place-items: center; overflow: hidden; border-radius: 14px; background: #fff; }
        .image-wrap img { width: 100%; height: 100%; object-fit: contain; display: block; }
        .name { height: 47px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 10px 4px 0; font-size: 20px; line-height: 23px; font-weight: 800; }
        .price-label { margin-top: 4px; color: #7c398d; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; }
        .price { margin-top: 2px; color: #b30a86; font-size: 24px; line-height: 25px; font-weight: 900; }
        .footer { width: ${canvasWidth}px; height: ${footerHeight}px; background: #fff; overflow: hidden; }
        .footer img { display: block; width: 100%; height: 100%; object-fit: fill; }
      </style>
    </head>
    <body>
      <main class="poster">
        <header class="header">
          <h1>PRODUCT RECOMMENDATIONS</h1>
          <div class="subtitle">${products.length} In-stock Products &nbsp;•&nbsp; Website Prices</div>
        </header>
        <section class="grid">${cards}</section>
        <footer class="footer"><img src="${footerUrl}" alt="Factory and delivery information" /></footer>
      </main>
    </body>
  </html>`;

  await fs.writeFile(OUTPUT_HTML, html, 'utf8');
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: canvasWidth, height: 1200 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(OUTPUT_HTML).href, { waitUntil: 'load' });
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: OUTPUT_IMAGE, fullPage: true });
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify({
    image: OUTPUT_IMAGE,
    html: OUTPUT_HTML,
    includedProducts: products.length,
    excludedByClothingRule: (catalog.products || []).length - products.length,
    dimensions: `${canvasWidth}x${posterHeight}`,
  }, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
