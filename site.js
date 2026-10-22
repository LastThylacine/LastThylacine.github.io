// Last Thylacine site: the trailer and the sand logo.

// Trailer: the first 24 s loop silently behind the sand (the end card is skipped).
// "Watch trailer" opens the whole film with sound in a dialog.
(() => {
  const bg = document.getElementById('bg');
  const btn = document.getElementById('watch');
  const tv = document.getElementById('tv');
  const tvv = document.getElementById('tvv');
  const close = document.getElementById('tvclose');
  if (!bg) return;
  const LOOP_END = 24.2;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  bg.muted = true;
  const loop = () => { if (!reduce) bg.play().catch(() => {}); };
  loop();
  bg.addEventListener('timeupdate', () => { if (bg.currentTime > LOOP_END) bg.currentTime = 0; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) bg.pause(); else if (!tv.open) loop(); });
  if (!btn || !tv || !tvv || !tv.showModal) { if (btn) btn.hidden = true; return; }
  btn.addEventListener('click', () => {
    bg.pause();
    tv.showModal();
    tvv.currentTime = 0;
    tvv.play().catch(() => {});
  });
  close.addEventListener('click', () => tv.close());
  tv.addEventListener('click', e => { if (e.target === tv) tv.close(); });
  tv.addEventListener('close', () => { tvv.pause(); loop(); });
})();

// The logo and the name are a sand sculpture. Moving the mouse over it breaks it, pressing pours
// striped sand, and after a few quiet seconds every grain flies back into place.
(() => {
  const hero = document.getElementById('top');
  const sandCv = document.getElementById('sand');
  const artCv = document.getElementById('art');
  if (!hero || !sandCv || !artCv) return;
  const sctx = sandCv.getContext('2d');
  const actx = artCv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const logo = new Image();
  logo.src = 'assets/logo.svg';

  const EMPTY = 0, LOOSE = 1, FIXED = 2;
  const PAL = {
    sand: [232, 188, 122], sandDark: [205, 150, 86], sandLight: [246, 214, 160],
    brick: [158, 66, 56], title: '#fff3dc'
  };
  const FONT = fs => `800 ${fs}px "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif`;
  const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  const jitter = (c, a) => { const k = 1 + (Math.random() - .5) * a; return pack(Math.min(255, c[0] * k) | 0, Math.min(255, c[1] * k) | 0, Math.min(255, c[2] * k) | 0); };
  const unpack = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];

  let W = 0, H = 0, cell = 2, cols = 0, rows = 0, N = 0;
  let type, color, energy, img, buf, G;
  let lockIdx, lockCol, duneIdx, duneCol, base = 0, total = 0;
  let shattered = false, rew = null, raf = 0, frameNo = 0, ready = false;
  let lastInput = 0, trickleUntil = 0, trickleX = 0;
  const ptr = { x: 0, y: 0, px: 0, py: 0, down: false, has: false };

  // Wide screens: logo above the two-line name in the left half (the game sits on the right).
  // Narrow screens: logo beside the name in the top third (the game sits under it).
  function geometry() {
    const aspect = 447 / 384;
    actx.font = FONT(100);
    const perPx = actx.measureText('Thylacine').width / 100;
    const cap = (actx.measureText('L').actualBoundingBoxAscent || 70) / 100;
    const pad = Math.max(16, Math.min(64, W * 0.04));
    let logoBox, fs, tx, blockTop;
    if (W >= 900) {
      const x0 = pad, aw = W * 0.56 - pad, y0 = H * 0.05, ah = H * 0.8;
      const lh = Math.min(ah * 0.42, 380), lw = lh * aspect;
      fs = Math.min(aw / (perPx * 1.04), lh * 0.55);
      const gapY = lh * 0.08;
      const total = lh + gapY + cap * fs * 2 + fs * 0.24;
      const top = y0 + (ah - total) / 2;
      logoBox = { x: x0, y: top, w: lw, h: lh };
      tx = x0;
      blockTop = top + lh + gapY;
    } else {
      const x0 = pad, aw = W - pad * 2, y0 = H * 0.05, ah = H * 0.32;
      const lh = Math.min(ah * 0.85, aw * 0.32 / aspect), lw = lh * aspect, gap = lw * 0.12;
      fs = Math.min(lh * 0.55, (aw - lw - gap) / (perPx * 1.03));
      const top = y0 + (ah - lh) / 2;
      logoBox = { x: x0, y: top, w: lw, h: lh };
      tx = x0 + lw + gap;
      blockTop = top + lh * 0.5 - (cap * fs * 2 + fs * 0.24) / 2;
    }
    const step = cap * fs + fs * 0.24;
    return {
      logo: logoBox, fs, cap,
      lines: [{ t: 'Last', x: tx, y: blockTop + cap * fs }, { t: 'Thylacine', x: tx, y: blockTop + cap * fs + step }]
    };
  }

  function drawLockup(ctx, s) {
    ctx.save();
    ctx.scale(s, s);
    if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, G.logo.x, G.logo.y, G.logo.w, G.logo.h);
    ctx.font = FONT(G.fs);
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (-0.02 * G.fs) + 'px';
    ctx.fillStyle = PAL.title;
    for (const l of G.lines) ctx.fillText(l.t, l.x, l.y);
    ctx.restore();
  }

  function build() {
    const r = hero.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    if (!W || !H) return;
    cell = W > 1500 ? 3 : 2;
    cols = Math.floor(W / cell); rows = Math.floor(H / cell); N = cols * rows;
    sandCv.width = cols; sandCv.height = rows;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    artCv.width = Math.round(W * dpr); artCv.height = Math.round(H * dpr);
    type = new Uint8Array(N); color = new Uint32Array(N); energy = new Uint8Array(N);
    img = sctx.createImageData(cols, rows); buf = new Uint32Array(img.data.buffer);
    G = geometry();

    actx.clearRect(0, 0, artCv.width, artCv.height);
    drawLockup(actx, dpr);
    artCv.classList.remove('off');

    // the lockup as grains: its collision shape now, and the sand version once it breaks
    const off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    const octx = off.getContext('2d', { willReadFrequently: true });
    drawLockup(octx, 1 / cell);
    let px = null;
    try { px = octx.getImageData(0, 0, cols, rows).data; } catch (e) { px = null; }
    const li = [], lc = [];
    if (px) {
      for (let i = 0; i < N; i++) {
        if (px[i * 4 + 3] > 120) { li.push(i); lc.push(jitter([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]], 0.08)); }
      }
    }
    lockIdx = Int32Array.from(li); lockCol = Uint32Array.from(lc);

    // dunes along the floor
    const di = [], dc = [];
    const ph = Math.random() * 6;
    for (let x = 0; x < cols; x++) {
      const u = x / cols;
      const h = Math.max(2, Math.round(rows * 0.05 + rows * 0.025 * (0.65 * Math.sin(u * 6.5 + ph) + 0.35 * Math.sin(u * 15 + ph * 2))));
      for (let k = 0; k < h; k++) {
        di.push((rows - 1 - k) * cols + x);
        dc.push(jitter(k >= h - 2 ? PAL.sandLight : (Math.random() < 0.25 ? PAL.sandDark : PAL.sand), 0.07));
      }
    }
    duneIdx = Int32Array.from(di); duneCol = Uint32Array.from(dc);
    restore();
    base = lockIdx.length + duneIdx.length; total = base;
    shattered = false; rew = null;
    // the opening trickle lands on the thylacine's head
    trickleX = Math.max(1, Math.min(cols - 2, Math.round((G.logo.x + G.logo.w * 0.55) / cell)));
    ready = true;
    render(performance.now());
  }

  function restore() {
    type.fill(EMPTY);
    energy.fill(0);
    for (let k = 0; k < lockIdx.length; k++) { type[lockIdx[k]] = FIXED; color[lockIdx[k]] = lockCol[k]; }
    for (let k = 0; k < duneIdx.length; k++) { type[duneIdx[k]] = LOOSE; color[duneIdx[k]] = duneCol[k]; }
  }

  function swap(a, b) { type[b] = type[a]; color[b] = color[a]; type[a] = EMPTY; }

  function step() {
    let moved = 0;
    for (let y = rows - 2; y >= 0; y--) {
      const row = y * cols;
      const ltr = ((y + frameNo) & 1) === 0;
      for (let k = 0; k < cols; k++) {
        const x = ltr ? k : cols - 1 - k;
        const i = row + x;
        if (type[i] !== LOOSE) continue;
        const b = i + cols;
        if (type[b] === EMPTY) { swap(i, b); moved++; continue; }
        const d = Math.random() < 0.5 ? -1 : 1;
        if (x + d >= 0 && x + d < cols && type[b + d] === EMPTY && type[i + d] === EMPTY) { swap(i, b + d); moved++; continue; }
        if (x - d >= 0 && x - d < cols && type[b - d] === EMPTY && type[i - d] === EMPTY) { swap(i, b - d); moved++; }
      }
    }
    return moved;
  }

  // A hit frees the grains under the brush and the whole slice below them, so the hole can drain.
  // Grains around it get a charge and fall once nothing holds them.
  function erodeAt(gx, gy, r) {
    let hit = false;
    const R = r + 4, r2 = r * r, R2 = R * R;
    for (let x = Math.max(0, gx - R); x <= Math.min(cols - 1, gx + R); x++) {
      const dx = x - gx;
      let lowest = -1;
      for (let y = Math.max(0, gy - R); y <= Math.min(rows - 1, gy + R); y++) {
        const dy = y - gy, d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        const i = y * cols + x;
        if (type[i] !== FIXED) continue;
        if (d2 <= r2) { type[i] = LOOSE; energy[i] = 0; hit = true; lowest = y; }
        else if (energy[i] < 5) energy[i] = 5;
      }
      if (lowest >= 0) {
        for (let y = lowest + 1; y < rows; y++) {
          const i = y * cols + x;
          if (type[i] !== FIXED) break;
          type[i] = LOOSE; energy[i] = 0;
        }
      }
    }
    if (hit && !shattered) { shattered = true; artCv.classList.add('off'); }
    return hit;
  }

  function collapse() {
    for (let i = N - cols - 1; i >= 0; i--) {
      const e = energy[i];
      if (!e) continue;
      if (type[i] !== FIXED) { energy[i] = 0; continue; }
      if (type[i + cols] !== EMPTY || Math.random() > 0.12) continue;
      type[i] = LOOSE; energy[i] = 0;
      if (e < 2) continue;
      const x = i % cols;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= cols) continue;
          const j = i + dy * cols + dx;
          if (j >= 0 && j < N && type[j] === FIXED && energy[j] < e - 1) energy[j] = e - 1;
        }
      }
    }
  }

  // poured sand comes in bands of sand and brick, like the stripes on a thylacine's back
  const band = now => (Math.floor(now / 650) & 1) ? PAL.brick : PAL.sand;

  function pourAt(gx, gy, r, now) {
    const c = band(now);
    for (let y = Math.max(0, gy - r); y <= Math.min(rows - 1, gy + r); y++) {
      for (let x = Math.max(0, gx - r); x <= Math.min(cols - 1, gx + r); x++) {
        const dx = x - gx, dy = y - gy;
        if (dx * dx + dy * dy > r * r) continue;
        const i = y * cols + x;
        if (type[i] === EMPTY && Math.random() < 0.2) { type[i] = LOOSE; color[i] = jitter(c, 0.12); total++; }
      }
    }
  }
  function along(fn) {
    const steps = Math.max(1, Math.ceil(Math.hypot(ptr.x - ptr.px, ptr.y - ptr.py) / 3));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      fn(Math.round(ptr.px + (ptr.x - ptr.px) * t), Math.round(ptr.py + (ptr.y - ptr.py) * t));
    }
    ptr.px = ptr.x; ptr.py = ptr.y;
  }

  function startRewind(now) {
    const src = [], tgt = [];
    for (let i = 0; i < N; i++) if (type[i] === LOOSE) src.push(i);
    for (let k = 0; k < lockIdx.length; k++) if (type[lockIdx[k]] !== FIXED) tgt.push([lockIdx[k], lockCol[k]]);
    for (let k = 0; k < duneIdx.length; k++) tgt.push([duneIdx[k], duneCol[k]]);
    const kx = i => (i % cols) + Math.random() * 8;
    src.sort((a, b) => kx(a) - kx(b));
    tgt.sort((a, b) => kx(a[0]) - kx(b[0]));
    const S = src.length, T = tgt.length, P = [];
    for (let k = 0; k < T; k++) {
      const t = tgt[k];
      const s = S ? src[Math.min(S - 1, Math.floor(k * S / T))] : (rows - 1) * cols + ((Math.random() * cols) | 0);
      const ty = (t[0] / cols) | 0;
      P.push({ sx: s % cols, sy: (s / cols) | 0, tx: t[0] % cols, ty, c0: unpack(S ? color[s] : t[1]), c1: unpack(t[1]), d: Math.random() * 260 + (1 - ty / rows) * 380 });
    }
    for (const i of src) type[i] = EMPTY;
    energy.fill(0);
    rew = { t0: now, P, dur: reduce ? 1 : 1150 };
  }

  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function render(now) {
    buf.fill(0);
    for (let i = 0; i < N; i++) {
      const t = type[i];
      if (t === LOOSE || (t === FIXED && shattered)) buf[i] = color[i];
    }
    if (rew) {
      const el = now - rew.t0;
      for (const p of rew.P) {
        const e = ease(Math.max(0, Math.min(1, (el - p.d) / rew.dur)));
        const x = Math.round(p.sx + (p.tx - p.sx) * e);
        const y = Math.round(p.sy + (p.ty - p.sy) * e - Math.sin(Math.PI * e) * rows * 0.08);
        if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
        buf[y * cols + x] = pack(
          (p.c0[0] + (p.c1[0] - p.c0[0]) * e) | 0,
          (p.c0[1] + (p.c1[1] - p.c0[1]) * e) | 0,
          (p.c0[2] + (p.c1[2] - p.c0[2]) * e) | 0);
      }
    }
    sctx.putImageData(img, 0, 0);
  }

  function frame(now) {
    raf = 0;
    if (!ready) return;
    let busy = false;
    if (rew) {
      busy = true;
      if (now - rew.t0 > rew.dur + 700) {
        rew = null;
        restore();
        total = base;
        if (shattered) { shattered = false; artCv.classList.remove('off'); }
      }
    } else {
      if (ptr.down && ptr.has) {
        along((x, y) => { erodeAt(x, y, 5); pourAt(x, y, 4, now); });
        pourAt(ptr.x, ptr.y, 4, now);
        busy = true;
      }
      if (now < trickleUntil) {
        for (let k = 0; k < 2; k++) {
          const x = trickleX + ((Math.random() * 3) | 0) - 1;
          if (type[x] === EMPTY) { type[x] = LOOSE; color[x] = jitter(band(now), 0.12); total++; }
        }
        busy = true;
      }
      if (shattered) collapse();
      let moved = 0;
      for (let s = 0; s < 4; s++) { moved += step(); frameNo++; }
      if (moved) busy = true;
      if (shattered || total - base > 1500) {
        busy = true;
        if (!ptr.down && !moved && now - lastInput > 3500) startRewind(now);
      }
    }
    render(now);
    if (busy) schedule();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

  function toGrid(e) {
    const r = hero.getBoundingClientRect();
    ptr.x = Math.floor((e.clientX - r.left) / r.width * cols);
    ptr.y = Math.floor((e.clientY - r.top) / r.height * rows);
    if (!ptr.has) { ptr.px = ptr.x; ptr.py = ptr.y; ptr.has = true; }
  }
  hero.addEventListener('pointerdown', e => {
    if (!ready || rew || e.target.closest('.game, .icons, a, button')) return;
    toGrid(e); ptr.px = ptr.x; ptr.py = ptr.y;
    ptr.down = true; lastInput = performance.now();
    erodeAt(ptr.x, ptr.y, 7);
    schedule();
  });
  hero.addEventListener('pointermove', e => {
    if (!ready) return;
    toGrid(e);
    if (rew) { ptr.px = ptr.x; ptr.py = ptr.y; return; }
    if (!ptr.down && e.pointerType === 'mouse') {
      let hit = false;
      along((x, y) => { hit = erodeAt(x, y, 5) || hit; });
      if (hit) { lastInput = performance.now(); schedule(); }
    } else if (ptr.down) { lastInput = performance.now(); schedule(); }
  });
  const up = () => { ptr.down = false; lastInput = performance.now(); schedule(); };
  hero.addEventListener('pointerup', up);
  hero.addEventListener('pointercancel', up);
  hero.addEventListener('pointerleave', () => { ptr.down = false; ptr.has = false; });

  function kickoff() {
    if (!reduce) trickleUntil = performance.now() + 6000;
    schedule();
  }

  // rebuild when the width changes (not on the height jitter of a phone's address bar)
  let rt = 0, lastW = 0;
  new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const w = Math.round(hero.getBoundingClientRect().width);
      if (Math.abs(w - lastW) < 2) return;
      lastW = w; build(); kickoff();
    }, 160);
  }).observe(hero);

  const fontReady = document.fonts ? document.fonts.load(FONT(64)).catch(() => {}) : Promise.resolve();
  const logoReady = logo.decode ? logo.decode().catch(() => {}) : new Promise(r => { logo.onload = logo.onerror = r; });
  const timeout = new Promise(r => setTimeout(r, 2500));
  Promise.race([Promise.all([fontReady, logoReady]), timeout]).then(() => {
    lastW = Math.round(hero.getBoundingClientRect().width);
    const withFont = !document.fonts || document.fonts.check(FONT(64));
    build(); kickoff();
    // the font arrived after the timeout: redraw with it
    if (!withFont) fontReady.then(() => { if (!rew && !shattered) { build(); schedule(); } });
  });
})();
