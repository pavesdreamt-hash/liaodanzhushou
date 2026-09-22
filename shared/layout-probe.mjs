// GENERATED from ../src/layout-probe.mjs; SHA256 4ce0c5ecf6b990393adc34ef08685fa232502cbf0b7091a8c23a897687514657; do not edit.
// Phase 2: observe only the already-rendered main spreadsheet canvas.
export function installLayoutProbe() {
  if (globalThis.__KD_LAYOUT) return;
  const state = { events: [], dropped: 0, limit: 60000, sequence: 0 };
  const paths = new WeakMap();
  const clips = new WeakMap();
  const stacks = new WeakMap();
  const imageCache = new WeakMap();
  const target = ctx => ctx.canvas?.id === 'et_canvas';
  const point = (ctx, x, y) => {
    const t = ctx.getTransform(); return { x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f };
  };
  const push = event => {
    if (state.events.length < state.limit) state.events.push({ ...event, seq: ++state.sequence, timestamp: Date.now() });
    else state.dropped++;
  };
  const hashBytes = bytes => {
    let hash = 0xcbf29ce484222325n;
    for (const byte of bytes) { hash ^= BigInt(byte); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
    return hash.toString(16).padStart(16, '0');
  };
  const hashText = text => hashBytes(new TextEncoder().encode(String(text)));
  const normalizedResource = source => {
    const raw = String(source?.currentSrc || source?.src || '');
    if (!raw) return '';
    try { const url = new URL(raw, location.href); url.hash = ''; return url.protocol === 'blob:' ? '' : `${url.origin}${url.pathname}`; }
    catch { return raw.startsWith('data:') ? '' : raw.split('#')[0].split('?')[0]; }
  };
  const imageFingerprint = (source, args) => {
    if (!source || (typeof source !== 'object' && typeof source !== 'function')) return { fingerprint:'', resourceFingerprint:'' };
    const sourceWidth = Number(source.naturalWidth || source.videoWidth || source.width || 0);
    const sourceHeight = Number(source.naturalHeight || source.videoHeight || source.height || 0);
    const crop = args.length === 9 ? [Number(args[1]), Number(args[2]), Number(args[3]), Number(args[4])] : [0, 0, sourceWidth, sourceHeight];
    const cacheKey = crop.join(','); const isMutable = source instanceof HTMLCanvasElement || (globalThis.OffscreenCanvas && source instanceof OffscreenCanvas);
    let perSource = imageCache.get(source); if (!perSource) { perSource = new Map(); imageCache.set(source, perSource); }
    if (!isMutable && perSource.has(cacheKey)) return perSource.get(cacheKey);
    const resource = normalizedResource(source), resourceFingerprint = resource ? `URL:${hashText(resource)}` : '';
    let fingerprint = '';
    try {
      const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 24;
      const ctx = canvas.getContext('2d', { willReadFrequently:true });
      ctx.clearRect(0, 0, 24, 24); ctx.drawImage(source, crop[0], crop[1], crop[2], crop[3], 0, 0, 24, 24);
      const pixels = ctx.getImageData(0, 0, 24, 24).data;
      let opaque = 0; for (let i=3;i<pixels.length;i+=4) if (pixels[i]) opaque++;
      if (opaque) fingerprint = `PIX:${hashBytes(pixels)}`;
    } catch { /* cross-origin images fall back to a stable resource identity */ }
    const result = { fingerprint:fingerprint || resourceFingerprint, pixelFingerprint:fingerprint, resourceFingerprint,
      sourceWidth, sourceHeight };
    if (!isMutable) perSource.set(cacheKey, result); return result;
  };
  const wrap = (method, callback) => {
    const original = CanvasRenderingContext2D.prototype[method];
    if (!original) return;
    CanvasRenderingContext2D.prototype[method] = function (...args) {
      const result = Reflect.apply(original, this, args);
      if (target(this)) { try { callback(this, args); } catch { /* preserve rendering */ } }
      return result;
    };
  };
  for (const method of ['fillText', 'strokeText']) wrap(method, (ctx, args) => {
    const text = String(args[0]); const p = point(ctx, args[1], args[2]); const t = ctx.getTransform();
    const m = ctx.measureText(text);
    push({ kind: 'text', method, text, ...p, localX: args[1], localY: args[2],
      width: m.width * Math.hypot(t.a, t.b), maxWidth: args[3] ?? null,
      font: ctx.font, align: ctx.textAlign, baseline: ctx.textBaseline,
      ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent,
      clipRect: clips.get(ctx) || null,
      transform: { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f } });
  });
  wrap('beginPath', ctx => paths.set(ctx, { lines: [], last: null }));
  wrap('save', ctx => { const stack = stacks.get(ctx) || []; stack.push(clips.get(ctx) || null); stacks.set(ctx, stack); });
  wrap('restore', ctx => { const stack = stacks.get(ctx); if (stack?.length) clips.set(ctx, stack.pop()); });
  wrap('clip', ctx => { const rect = paths.get(ctx)?.rect; if (rect) clips.set(ctx, rect); });
  wrap('moveTo', (ctx, a) => { const p = paths.get(ctx) || { lines: [] }; p.last = point(ctx, a[0], a[1]); paths.set(ctx, p); });
  wrap('lineTo', (ctx, a) => {
    const p = paths.get(ctx); const next = point(ctx, a[0], a[1]);
    if (p?.last && p.lines.length < 5000) p.lines.push({ x1: p.last.x, y1: p.last.y, x2: next.x, y2: next.y });
    if (p) p.last = next;
  });
  wrap('stroke', ctx => {
    for (const line of paths.get(ctx)?.lines || []) push({ kind: 'line', ...line, color: String(ctx.strokeStyle), lineWidth: ctx.lineWidth });
  });
  for (const method of ['clearRect', 'fillRect', 'strokeRect', 'rect']) wrap(method, (ctx, a) => {
    const p = point(ctx, a[0], a[1]); const q = point(ctx, a[0] + a[2], a[1] + a[3]);
    if (method === 'rect') { const path = paths.get(ctx) || { lines: [] }; path.rect = { ...p, width: q.x - p.x, height: q.y - p.y }; paths.set(ctx, path); }
    push({ kind: method, ...p, width: q.x - p.x, height: q.y - p.y,
      color: String(method === 'strokeRect' ? ctx.strokeStyle : ctx.fillStyle), alpha: ctx.globalAlpha });
  });
  wrap('drawImage', (ctx, a) => {
    const start = a.length === 9 ? 5 : 1;
    const p = point(ctx, a[start], a[start + 1]);
    const q = point(ctx, a[start] + (a[start + 2] ?? a[0]?.width ?? 0), a[start + 1] + (a[start + 3] ?? a[0]?.height ?? 0));
    push({ kind: 'image', ...p, width:q.x-p.x, height:q.y-p.y, clipRect:clips.get(ctx) || null,
      sourceType: a[0]?.constructor?.name || 'unknown', ...imageFingerprint(a[0], a) });
  });
  globalThis.__KD_LAYOUT = {
    reset() { state.events.length = 0; state.dropped = 0; },
    snapshot() {
      const canvas = document.getElementById('et_canvas');
      const rect = canvas?.getBoundingClientRect();
      return { events: state.events, dropped: state.dropped, timestamp: Date.now(),
        canvas: canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight, x: rect.x, y: rect.y } : null };
    },
  };
}
