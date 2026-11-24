/* ============================================================
   FORMES DES GABARITS : rectangle, carré, rond, triangle, forme libre (dessinée sur une grille)
   - aire, périmètre, contour (polygone en cm)
   - EMBOÎTEMENT OPTIMISÉ pour le métrage : place occupée par UNE pièce quand on les coupe à la suite
       rectangle / carré : la pièce elle-même
       rond              : en quinconce (rangées décalées) → D × D·√3/2
       triangle          : tête-bêche → base/2 × hauteur
       forme libre       : la meilleure façon parmi « à la suite », « retournée à 180° » (tête-bêche),
                           dans un sens ou dans l'autre, calculée sur le vrai contour
   - éditeur « forme libre » : on clique les points du contour sur une grille en cm
   ============================================================ */
(function () {
  'use strict';
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 1 : d });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FORMES = [['rect', 'Rectangle', '▭'], ['carre', 'Carré', '□'], ['rond', 'Rond', '◯'], ['triangle', 'Triangle', '△'], ['libre', 'Forme libre', '✏️']];
  const forme = g => (g && FORMES.some(f => f[0] === g.forme) ? g.forme : 'rect');

  /* ---------- contour (cm, origine en bas à gauche, y vers le haut) ---------- */
  function normaliser(pts) {
    if (!pts || !pts.length) return [];
    const mx = Math.min(...pts.map(p => p[0])), my = Math.min(...pts.map(p => p[1]));
    return pts.map(p => [Math.round((p[0] - mx) * 10) / 10, Math.round((p[1] - my) * 10) / 10]);
  }
  function cercle(d, n) { n = n || 48; const r = d / 2; return Array.from({ length: n }, (_, i) => [r + r * Math.cos(2 * Math.PI * i / n), r + r * Math.sin(2 * Math.PI * i / n)]); }
  function contour(g) {
    const f = forme(g), l = num(g.l), h = num(g.h);
    if (f === 'rond') return cercle(l);
    if (f === 'carre') return [[0, 0], [l, 0], [l, l], [0, l]];
    if (f === 'triangle') { const s = g.sommet == null || g.sommet === '' ? 50 : Math.max(0, Math.min(100, num(g.sommet))); return [[0, 0], [l, 0], [l * s / 100, h]]; }
    if (f === 'libre' && Array.isArray(g.pts) && g.pts.length >= 3) return normaliser(g.pts);
    return [[0, 0], [l, 0], [l, h], [0, h]];
  }
  const bbox = P => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
  function airePoly(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
  function perimPoly(P) { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); } return s; }
  function aire(g) { const f = forme(g); if (f === 'rond') return Math.PI * Math.pow(num(g.l) / 2, 2); if (f === 'rect') return num(g.l) * num(g.h); return airePoly(contour(g)); }
  function perimetre(g) { const f = forme(g); if (f === 'rond') return Math.PI * num(g.l); if (f === 'rect') return 2 * (num(g.l) + num(g.h)); return perimPoly(contour(g)); }
  /* dimensions d'encombrement (le rectangle autour de la forme) */
  function dims(g) { const f = forme(g); if (f === 'rond' || f === 'carre') return { l: num(g.l), h: num(g.l) }; if (f === 'libre' && Array.isArray(g.pts) && g.pts.length >= 3) { const b = bbox(contour(g)); return { l: b.w, h: b.h }; } return { l: num(g.l), h: num(g.h) }; }

  /* ---------- emboîtement : décalage minimal pour que B (à droite de A) ne touche pas A ----------
     Coupe horizontale tous les h/240 : à chaque hauteur, B doit commencer après la fin de A. */
  function etendue(P, y) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) { const x = a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]); if (x < mn) mn = x; if (x > mx) mx = x; }
    }
    return mn <= mx ? [mn, mx] : null;
  }
  function decalage(A, B, h) {
    let d = 0; const N = 240;
    for (let k = 0; k < N; k++) { const y = (k + 0.5) * h / N, a = etendue(A, y), b = etendue(B, y); if (a && b) d = Math.max(d, a[1] - b[0]); }
    return d;
  }
  const tourne180 = (P, w, h) => P.map(p => [w - p[0], h - p[1]]);
  const transpose = P => P.map(p => [p[1], p[0]]);
  /* ============================================================
     EMBOÎTEMENT INTELLIGENT (formes libres, triangles, ronds)
     On cherche le meilleur « réseau » de coupe sur le vrai contour, sans aucun chevauchement :
       - pièce seule, droite ou tournée d'un quart de tour
       - ou PAIRE : une pièce + la même retournée à 180° (tête-bêche), placée au meilleur endroit
         (ex. deux « L » qui forment un cadre, deux triangles qui forment un parallélogramme)
       - puis les unités sont répétées en rangées, chaque rangée pouvant être DÉCALÉE pour s'imbriquer
     Calcul sur une grille fine (0,25 à 1 cm) : une pièce n'en touche jamais une autre.
     ============================================================ */
  const cacheE = new Map();
  function dedans(P, x, y) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
    return c;
  }
  const ECH = [[.5, .5], [.1, .1], [.9, .1], [.1, .9], [.9, .9], [.5, .1], [.5, .9], [.1, .5], [.9, .5]];
  /* grille : pour chaque rangée de cellules, les intervalles [début, fin) remplis */
  function grille(polys, q) {
    const all = polys.flat(), mxX = Math.max(...all.map(p => p[0])), mxY = Math.max(...all.map(p => p[1]));
    const nx = Math.max(1, Math.ceil(mxX / q - 1e-6)), ny = Math.max(1, Math.ceil(mxY / q - 1e-6)), rows = []; let cells = 0;
    for (let j = 0; j < ny; j++) {
      const r = []; let deb = -1;
      for (let i = 0; i <= nx; i++) {
        const plein = i < nx && ECH.some(s => polys.some(P => dedans(P, (i + s[0]) * q, (j + s[1]) * q)));
        if (plein) { cells++; if (deb < 0) deb = i; } else if (deb >= 0) { r.push([deb, i]); deb = -1; }
      }
      rows.push(r);
    }
    return { nx, ny, rows, cells };
  }
  /* translations interdites : B décalé de (dx,dy) chevauche A */
  function interdits(A, B) {
    const ox = B.nx, oy = B.ny, LW = A.nx + B.nx + 1, F = new Uint8Array(LW * (A.ny + B.ny + 1));
    for (let dy = -B.ny + 1; dy < A.ny; dy++) {
      for (let r = Math.max(0, dy); r < Math.min(A.ny, dy + B.ny); r++) {
        const ra = A.rows[r], rb = B.rows[r - dy]; if (!ra.length || !rb.length) continue;
        for (const a of ra) for (const b of rb) { const base = (dy + oy) * LW + ox; for (let dx = a[0] - b[1] + 1; dx <= a[1] - b[0] - 1; dx++) F[base + dx] = 1; }
      }
    }
    return (dx, dy) => dx > -B.nx && dx < A.nx && dy > -B.ny && dy < A.ny && F[(dy + oy) * LW + dx + ox] === 1;
  }
  /* meilleur réseau (a,0) / (b,c) pour une unité : aucune copie ne touche une autre */
  function reseauU(U) {
    const bad = interdits(U, U); let best = null;
    const valide = (a, b, c) => {
      for (let k = 1; k * c < U.ny; k++) { const dy = k * c, m0 = Math.ceil((-U.nx + 1 - k * b) / a), m1 = Math.floor((U.nx - 1 - k * b) / a); for (let m = m0; m <= m1; m++) if (bad(m * a + k * b, dy)) return false; }
      return true;
    };
    for (let a = 1; a <= 2 * U.nx + U.ny; a++) {
      let ok = true; for (let m = 1; m * a < U.nx; m++) if (bad(m * a, 0)) { ok = false; break; }
      if (!ok) continue;
      for (let c = Math.max(1, Math.ceil(U.cells / a)); c <= U.ny; c++) {
        if (best && a * c >= best.a * best.c) break;
        let tr = -1; for (let b = 0; b < a; b++) if (valide(a, b, c)) { tr = b; break; }
        if (tr >= 0) { best = { a, b: tr, c }; break; }
      }
    }
    return best;
  }
  /* ---------- affinage EXACT sur le vrai contour (la grille laisse un petit jeu de sécurité) ---------- */
  const EPS = 1e-6;
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function distSeg(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  function strict(P, p) { if (!dedans(P, p[0], p[1])) return false; for (let i = 0; i < P.length; i++) if (distSeg(p, P[i], P[(i + 1) % P.length]) < 1e-4) return false; return true; }
  const echant = P => { const o = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; for (let f = 0; f < 8; f++) o.push([a[0] + (b[0] - a[0]) * f / 8, a[1] + (b[1] - a[1]) * f / 8]); } return o; };
  function seCoupent(A, B) {
    const ba = [Math.min(...A.map(p => p[0])), Math.max(...A.map(p => p[0])), Math.min(...A.map(p => p[1])), Math.max(...A.map(p => p[1]))];
    const bb = [Math.min(...B.map(p => p[0])), Math.max(...B.map(p => p[0])), Math.min(...B.map(p => p[1])), Math.max(...B.map(p => p[1]))];
    if (ba[1] <= bb[0] + EPS || bb[1] <= ba[0] + EPS || ba[3] <= bb[2] + EPS || bb[3] <= ba[2] + EPS) return false;
    for (let i = 0; i < A.length; i++) { const a1 = A[i], a2 = A[(i + 1) % A.length];
      for (let j = 0; j < B.length; j++) { const b1 = B[j], b2 = B[(j + 1) % B.length];
        const o1 = orient(a1, a2, b1), o2 = orient(a1, a2, b2), o3 = orient(b1, b2, a1), o4 = orient(b1, b2, a2);
        if (((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) && ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))) return true; } }
    return echant(A).some(p => strict(B, p)) || echant(B).some(p => strict(A, p));
  }
  function valideExact(U, a, b, c) {
    if (U.length > 1 && seCoupent(U[0], U[1])) return false;
    const all = U.flat(), w = Math.max(...all.map(p => p[0])) - Math.min(...all.map(p => p[0])), h = Math.max(...all.map(p => p[1])) - Math.min(...all.map(p => p[1]));
    for (let k = 0; k * c < h - EPS; k++) {
      const m0 = Math.ceil((-w - k * b) / a) - 1, m1 = Math.floor((w - k * b) / a) + 1;
      for (let m = m0; m <= m1; m++) {
        if (k === 0 && m <= 0) continue;
        const tx = m * a + k * b, ty = k * c; if (Math.abs(tx) >= w - EPS) continue;
        for (const A of U) for (const B of U) if (seCoupent(A, B.map(p => [p[0] + tx, p[1] + ty]))) return false;
      }
    }
    return true;
  }
  function affiner(o, q) {
    let U = o.unit, a = o.v1[0], b = o.v2[0], c = o.v2[1];
    if (!valideExact(U, a, b, c)) return o;
    const bouge = (U, dx, dy) => [U[0], U[1].map(p => [p[0] + dx, p[1] + dy])];
    for (const st of [q, q / 2, q / 4, q / 8]) {
      for (let it = 0; it < 60; it++) {
        const essais = [[U, a, b, c - st], [U, a - st, b, c], [U, a, b - st, c - st], [U, a, b + st, c - st], [U, a - st, b - st, c], [U, a - st, b + st, c]];
        if (U.length === 2) [[-st, 0], [st, 0], [0, -st], [0, st]].forEach(([dx, dy]) => { const V = bouge(U, dx, dy); essais.push([V, a - st, b, c], [V, a, b, c - st], [V, a - st, b - st, c], [V, a - st, b + st, c]); });
        const ok = essais.find(e => e[1] > EPS && e[3] > EPS && valideExact(e[0], e[1], e[2], e[3]));
        if (!ok) break;
        [U, a, b, c] = ok;
      }
    }
    const all = U.flat(), mx = Math.min(...all.map(p => p[0])), my = Math.min(...all.map(p => p[1]));
    U = U.map(P => P.map(p => [Math.round((p[0] - mx) * 1e4) / 1e4, Math.round((p[1] - my) * 1e4) / 1e4]));
    const r = Object.assign({}, o, { unit: U, v1: [a, 0], v2: [b, c], aireP: a * c / o.k }), bu = bbox(U.flat()); r.uw = bu.w; r.uh = bu.h;
    return r;
  }
  const rot90 = P => { const b = bbox(P); return P.map(p => [b.h - p[1], p[0]]); };
  const decale = (P, dx, dy) => P.map(p => [p[0] + dx, p[1] + dy]);
  function reseau(P) {
    const cle = JSON.stringify(P); if (cacheE.has(cle)) return cacheE.get(cle);
    const b0 = bbox(P), md = Math.max(b0.w, b0.h), q = [0.25, 0.5, 1, 2, 4, 8].find(z => md / z <= 80) || 8, essais = [];
    [0, 1].forEach(rt => {
      const A = rt ? rot90(P) : P, bA = bbox(A), R = tourne180(A, bA.w, bA.h), GA = grille([A], q), GR = grille([R], q);
      essais.push({ polys: [A], rt, paire: false, G: GA });
      // paires tête-bêche : les meilleures positions (rectangle englobant le plus petit)
      const badAR = interdits(GA, GR), cand = [];
      for (let dy = -GR.ny; dy <= GA.ny; dy++) for (let dx = -GR.nx; dx <= GA.nx; dx++) {
        if (badAR(dx, dy)) continue;
        const w = Math.max(GA.nx, dx + GR.nx) - Math.min(0, dx), h = Math.max(GA.ny, dy + GR.ny) - Math.min(0, dy);
        if (w * h < 2 * GA.nx * GA.ny) cand.push({ dx, dy, s: w * h });
      }
      cand.sort((x, y) => x.s - y.s).slice(0, 4).forEach(c => {
        const sx = Math.max(0, -c.dx) * q, sy = Math.max(0, -c.dy) * q;
        const polys = [decale(A, sx, sy), decale(R, sx + c.dx * q, sy + c.dy * q)];
        essais.push({ polys, rt, paire: true, G: grille(polys, q) });
      });
    });
    const res = [];
    essais.forEach(e => {
      const r = reseauU(e.G); if (!r) return;
      res.push({ e, r, k: e.polys.length, aireP: r.a * r.c * q * q / e.polys.length });
    });
    res.sort((x, y) => x.aireP - y.aireP);
    const fait = (best) => {
      const { e, r } = best, decal = r.b > 0 || r.c * q < bbox(e.polys.flat()).h - 1e-6;
      const o = { unit: e.polys, v1: [r.a * q, 0], v2: [r.b * q, r.c * q], k: best.k, aireP: best.aireP, paire: e.paire, rt: e.rt,
        txt: (e.paire ? 'par paires tête-bêche (une sur deux retournée)' : 'à la suite') + (decal ? (e.paire ? ', rangées imbriquées' : ', emboîtées en escalier (rangées décalées)') : '') + (e.rt ? ', tournées d’un quart de tour' : '') };
      const bu = bbox(o.unit.flat()); o.uw = bu.w; o.uh = bu.h; return o;
    };
    const rectO = { unit: [P], v1: [b0.w, 0], v2: [0, b0.h], k: 1, aireP: b0.w * b0.h, txt: 'à la suite', paire: false, rt: 0, uw: b0.w, uh: b0.h };
    // jamais pire que le simple rectangle englobant
    // les meilleurs réseaux de la grille sont affinés au plus juste sur le vrai contour
    const fins = res.slice(0, 5).map(x => affiner(fait(x), q)).filter(x => x.aireP < b0.w * b0.h - 1e-6).sort((x, y) => x.aireP - y.aireP);
    const out = fins.length ? fins[0] : rectO;
    // autres bons réseaux : le plan de coupe réel choisit celui qui perd le moins sur les bords du rouleau
    out.alts = fins.slice(1, 4).concat(out === rectO ? [] : [rectO]);
    cacheE.set(cle, out); return out;
  }
  /* place occupée par une pièce : { w, h, mode, txt, lat } (w × h = surface réellement consommée par pièce) */
  function empreinte(g) {
    const f = forme(g), l = num(g.l), h = num(g.h);
    if (f === 'rect') return { w: l, h, mode: 'rect', txt: '' };
    if (f === 'carre') return { w: l, h: l, mode: 'rect', txt: '' };
    if (f === 'rond') { const c = l * Math.sqrt(3) / 2; return { w: l, h: c, mode: 'quinconce', txt: 'en quinconce (rangées décalées)', lat: { unit: [cercle(l, 36)], v1: [l, 0], v2: [l / 2, c], k: 1, aireP: l * c, uw: l, uh: l } }; }
    const P = contour(g); if (P.length < 3) return { w: l, h, mode: 'rect', txt: '' };
    const R = reseau(P), pas = R.v1[0] / R.k, haut = R.aireP / pas;
    return { w: pas, h: haut, mode: R.paire ? 'tetebeche' : 'suite', txt: R.txt, lat: R };
  }

  /* ---------- PLACEMENT RÉEL dans le rouleau (largeur W, x en travers, y dans la longueur) ----------
     n pièces → la plus petite longueur ; ou, avec Lmax, toutes les pièces qui tiennent dans Lmax. */
  function placer(g, W, n, Lmax) {
    const e = empreinte(g), R0 = e.lat; if (!R0) return null;
    const ors = [];
    [R0].concat(R0.alts || []).forEach(R => {
      ors.push({ U: R.unit, v1: R.v1, v2: R.v2, uw: R.uw, uh: R.uh, R });
      const U = R.unit.map(P => P.map(p => [R.uh - p[1], p[0]])), r = v => [-v[1], v[0]]; ors.push({ U, v1: r(R.v1), v2: r(R.v2), uw: R.uh, uh: R.uw, R });
    });
    let best = null;
    ors.forEach(o => {
      const pb = o.U.map(P => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; });
      if (pb.every(b => b[1] - b[0] > W + 1e-6)) return;
      const det = o.v1[0] * o.v2[1] - o.v2[0] * o.v1[1]; if (Math.abs(det) < 1e-9) return;
      const inv = (x, y) => [(x * o.v2[1] - y * o.v2[0]) / det, (o.v1[0] * y - o.v1[1] * x) / det];
      [0, .125, .25, .375, .5, .625, .75, .875].forEach(s => {
        const ox = o.v1[0] * s, oy = o.v1[1] * s;
        let Y = Lmax || Math.max(o.uh * 2, (n * o.R.aireP / W) * 1.4 + o.uh * 2), got = null;
        for (let it = 0; it < 6 && !got; it++, Y *= 2) {
          const cs = [[-o.uw, -o.uh], [W + o.uw, -o.uh], [-o.uw, Y + o.uh], [W + o.uw, Y + o.uh]].map(p => inv(p[0] - ox, p[1] - oy));
          const m0 = Math.floor(Math.min(...cs.map(c => c[0]))) - 1, m1 = Math.ceil(Math.max(...cs.map(c => c[0]))) + 1, k0 = Math.floor(Math.min(...cs.map(c => c[1]))) - 1, k1 = Math.ceil(Math.max(...cs.map(c => c[1]))) + 1;
          const L = [];
          for (let k = k0; k <= k1; k++) for (let m = m0; m <= m1; m++) {
            const px = ox + m * o.v1[0] + k * o.v2[0], py = oy + m * o.v1[1] + k * o.v2[1];
            pb.forEach((b, j) => { if (px + b[0] >= -1e-6 && px + b[1] <= W + 1e-6 && py + b[2] >= -1e-6 && py + b[3] <= Y + 1e-6) L.push({ t: py + b[3], x: px, y: py, j }); });
          }
          L.sort((a, b) => a.t - b.t || a.x - b.x);
          if (Lmax) got = L;
          else if (L.length >= n) got = L.slice(0, n);
        }
        if (!got) return;
        const len = got.length ? got[got.length - 1].t : 0;
        const sc = Lmax ? -got.length : len;
        if (!best || sc < best.sc - 1e-6) best = { sc, L: len, pieces: got.map(p => o.U[p.j].map(q => [q[0] + p.x, q[1] + p.y])), n: got.length };
      });
    });
    return best;
  }

  /* ---------- dessins SVG ---------- */
  const chemin = (P, k, ox, oy, H) => 'M' + P.map(p => ((ox + p[0]) * k).toFixed(1) + ' ' + ((oy + H - p[1]) * k).toFixed(1)).join('L') + 'Z';
  function apercu(g, taille, coul) {
    const P = contour(g); if (P.length < 3 && forme(g) !== 'rond') return '';
    const d = dims(g), m = Math.max(d.l, d.h, 1), k = (taille - 4) / m;
    const body = forme(g) === 'rond' ? '<circle cx="' + (d.l * k / 2 + 2) + '" cy="' + (d.l * k / 2 + 2) + '" r="' + (d.l * k / 2) + '"/>' : '<path d="' + chemin(P, k, 2 / k, 2 / k, d.h) + '"/>';
    return '<svg class="fm-ap" width="' + taille + '" height="' + taille + '" viewBox="0 0 ' + taille + ' ' + taille + '"><g fill="' + (coul || '#e8a6b4') + '" stroke="#333" stroke-width="1">' + body + '</g></svg>';
  }
  /* motif : quelques pièces placées exactement comme dans la coupe (aucun chevauchement) */
  function motif(g, coul, larg) {
    const e = empreinte(g); larg = larg || 300;
    const R = e.lat; if (!R) return '';
    const zw = Math.max(R.uw * 2.2, R.v1[0] * 3), zh = Math.max(R.uh * 2.2, R.v2[1] * 3), pl = placer(g, zw, null, zh);
    if (!pl || !pl.pieces.length) return '';
    const all = pl.pieces.flat(), W = Math.max(...all.map(p => p[0])), H = Math.max(...all.map(p => p[1]));
    const k = Math.min(larg / W, 150 / H);
    const body = pl.pieces.map(P => '<path d="' + chemin(P, k, 0, 0, H) + '"' + '/>').join('');
    return '<svg class="fm-motif" viewBox="-2 -2 ' + (W * k + 4) + ' ' + (H * k + 4) + '" width="' + (W * k + 4) + '" height="' + (H * k + 4) + '"><g fill="' + (coul || '#e8a6b4') + '" stroke="#444" stroke-width=".8">' + body + '</g></svg>';
  }

  /* ============================================================
     ÉDITEUR « FORME LIBRE » : grille en cm, on clique les points du contour
     - clic sur la grille : ajoute un point (aimanté au 0,5 cm)
     - glisser un point : le déplace ; double-clic (ou appui long) sur un point : le supprime
     - « + » au milieu d'un côté : insère un point
     - départ rapide : rectangle, rond, triangle, puis on modifie
     ============================================================ */
  function editer(g, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      let pts = (Array.isArray(g.pts) && g.pts.length >= 3 ? normaliser(g.pts) : (num(g.l) > 0 && num(g.h) > 0 ? contour(Object.assign({}, g, { forme: forme(g) === 'libre' ? 'rect' : forme(g) })) : [])).map(p => [p[0] + 2, p[1] + 2]);
      if (forme(g) === 'rond' && pts.length) pts = cercle(num(g.l), 24).map(p => [p[0] + 2, p[1] + 2]);
      const hist = [];
      const bg = document.createElement('div'); bg.className = 'fm-bg';
      bg.innerHTML = '<div class="fm-dlg" role="dialog" aria-label="Dessiner le gabarit">' +
        '<div class="fm-top"><div><span class="fm-k">Forme libre</span><h3>' + esc(g.nom || 'Gabarit') + '</h3></div><div class="fm-mes" id="fm-mes"></div></div>' +
        '<div class="fm-tools"><span>Départ :</span><button type="button" class="btn s" data-fm="rect">▭ Rectangle</button><button type="button" class="btn s" data-fm="rond">◯ Rond</button><button type="button" class="btn s" data-fm="tri">△ Triangle</button>' +
        '<span class="fm-sep"></span><button type="button" class="btn s" data-fm="undo">↶ Annuler</button><button type="button" class="btn s" data-fm="miroir" title="Symétrie gauche / droite">⇋ Miroir</button><button type="button" class="btn s d" data-fm="vider">Effacer</button>' +
        '<span class="fm-sep"></span><label>Zoom<select id="fm-zoom"><option value="30">30 cm</option><option value="50">50 cm</option><option value="80">80 cm</option><option value="120">120 cm</option></select></label></div>' +
        '<div class="fm-zone"><svg id="fm-svg" xmlns="http://www.w3.org/2000/svg"></svg></div>' +
        '<p class="fm-help"><b>Cliquez sur la grille</b> pour poser les points du contour, dans l’ordre. <b>Glissez</b> un point pour le déplacer, <b>double-cliquez</b> (ou appui long) sur un point pour le supprimer, cliquez le <b>＋</b> au milieu d’un côté pour ajouter un point. Pour un arrondi, mettez plusieurs points rapprochés. 1 carreau = 1 cm.</p>' +
        '<div class="fm-size"><label>Largeur totale (cm)<input id="fm-w" type="number" min="0" step="0.1" inputmode="decimal"></label><label>Hauteur totale (cm)<input id="fm-h" type="number" min="0" step="0.1" inputmode="decimal"></label><small>Changer une mesure agrandit ou réduit la forme.</small></div>' +
        '<div class="fm-act"><button type="button" class="btn p" data-fm="ok">✔ Utiliser cette forme</button><button type="button" class="btn" data-fm="annuler">Annuler</button></div></div>';
      document.body.appendChild(bg);
      const svg = bg.querySelector('#fm-svg'), zoomSel = bg.querySelector('#fm-zoom');
      let S = 50; const b0 = pts.length ? bbox(pts) : { w: 0, h: 0 };
      S = [30, 50, 80, 120].find(z => z >= Math.max(b0.w, b0.h) + 6) || 120; zoomSel.value = S;
      const snap = v => Math.round(v * 2) / 2;
      const sauve = () => { hist.push(JSON.stringify(pts)); if (hist.length > 60) hist.shift(); };
      function dessiner() {
        const k = 600 / S; let s = '';
        svg.setAttribute('viewBox', '0 0 600 600');
        // grille : le 0 est au coin bas-gauche de la forme (O = 2 cm de marge pour pouvoir cliquer)
        const O = 2;
        for (let i = 0; i <= S; i++) { const j = i - O, maj = j % 10 === 0, mid = j % 5 === 0, w = maj ? 1.2 : mid ? .7 : .3, c = maj ? '#9c8f93' : '#d9d1d3'; s += '<line x1="' + i * k + '" y1="0" x2="' + i * k + '" y2="600" stroke="' + c + '" stroke-width="' + w + '"/><line x1="0" y1="' + (600 - i * k) + '" x2="600" y2="' + (600 - i * k) + '" stroke="' + c + '" stroke-width="' + w + '"/>'; if (maj && j >= 0) s += '<text x="' + (i * k + 2) + '" y="596" class="fm-t">' + j + '</text>' + (j ? '<text x="2" y="' + (600 - i * k - 2) + '" class="fm-t">' + j + '</text>' : ''); }
        if (pts.length >= 2) s += '<path d="M' + pts.map(p => p[0] * k + ' ' + (600 - p[1] * k)).join('L') + (pts.length >= 3 ? 'Z' : '') + '" fill="' + (pts.length >= 3 ? 'rgba(232,166,180,.55)' : 'none') + '" stroke="#b3261e" stroke-width="2"/>';
        if (pts.length >= 3) pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; s += '<g class="fm-mid" data-mid="' + i + '"><circle cx="' + mx * k + '" cy="' + (600 - my * k) + '" r="7"/><text x="' + mx * k + '" y="' + (600 - my * k + 4) + '" text-anchor="middle">+</text></g>'; });
        // cotes : longueur de chaque côté (à l'extérieur de la forme) + largeur et hauteur totales
        if (pts.length >= 2) {
          let sa = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; sa += a[0] * b[1] - b[0] * a[1]; }
          const sens = sa >= 0 ? 1 : -1, nE = pts.length >= 3 ? pts.length : 1;
          for (let i = 0; i < nE; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 0.25) continue;
            const nx = dy / L * sens, ny = -dx / L * sens, off = 15 / k, mx = (a[0] + b[0]) / 2 + nx * off, my = (a[1] + b[1]) / 2 + ny * off;
            s += '<text class="fm-cote" x="' + (mx * k) + '" y="' + (600 - my * k + 4) + '" text-anchor="middle">' + nf(L) + '</text>';
          }
          if (pts.length >= 3) {
            const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            const yb = 600 - y1 * k - 26, xg = x1 * k + 26;
            s += '<g class="fm-tot"><line x1="' + x0 * k + '" y1="' + yb + '" x2="' + x1 * k + '" y2="' + yb + '"/><line x1="' + x0 * k + '" y1="' + (yb - 6) + '" x2="' + x0 * k + '" y2="' + (yb + 6) + '"/><line x1="' + x1 * k + '" y1="' + (yb - 6) + '" x2="' + x1 * k + '" y2="' + (yb + 6) + '"/>' +
              '<text x="' + ((x0 + x1) / 2 * k) + '" y="' + (yb - 6) + '" text-anchor="middle">largeur ' + nf(x1 - x0) + ' cm</text>' +
              '<line x1="' + xg + '" y1="' + (600 - y0 * k) + '" x2="' + xg + '" y2="' + (600 - y1 * k) + '"/><line x1="' + (xg - 6) + '" y1="' + (600 - y0 * k) + '" x2="' + (xg + 6) + '" y2="' + (600 - y0 * k) + '"/><line x1="' + (xg - 6) + '" y1="' + (600 - y1 * k) + '" x2="' + (xg + 6) + '" y2="' + (600 - y1 * k) + '"/>' +
              '<text transform="translate(' + (xg + 16) + ' ' + (600 - (y0 + y1) / 2 * k) + ') rotate(90)" text-anchor="middle">hauteur ' + nf(y1 - y0) + ' cm</text></g>';
          }
        }
        pts.forEach((p, i) => { s += '<circle class="fm-pt' + (i === 0 ? ' fm-p0' : '') + '" data-pt="' + i + '" cx="' + p[0] * k + '" cy="' + (600 - p[1] * k) + '" r="8"/>'; });
        svg.innerHTML = s;
        const ok = pts.length >= 3, b = ok ? bbox(pts) : { w: 0, h: 0 };
        bg.querySelector('#fm-mes').innerHTML = ok ? '<b>' + nf(b.w) + ' × ' + nf(b.h) + ' cm</b><span>surface ' + nf(airePoly(pts)) + ' cm² · périmètre ' + nf(perimPoly(pts)) + ' cm · ' + pts.length + ' points</span>' : '<span>Posez au moins 3 points</span>';
        const iw = bg.querySelector('#fm-w'), ih = bg.querySelector('#fm-h');
        if (document.activeElement !== iw) iw.value = ok ? Math.round(b.w * 10) / 10 : '';
        if (document.activeElement !== ih) ih.value = ok ? Math.round(b.h * 10) / 10 : '';
        bg.querySelector('[data-fm=ok]').disabled = !ok;
      }
      const pos = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()), k = 600 / S; return [Math.max(0, Math.min(S, snap(p.x / k))), Math.max(0, Math.min(S, snap((600 - p.y) / k)))]; };
      let drag = null, appui = null, bouge = false;
      svg.addEventListener('pointerdown', ev => {
        const c = ev.target.closest('[data-pt]'), m = ev.target.closest('[data-mid]');
        if (c) { ev.preventDefault(); sauve(); drag = +c.dataset.pt; bouge = false; svg.setPointerCapture(ev.pointerId); clearTimeout(appui); appui = setTimeout(() => { if (!bouge && drag != null && pts.length > 3) { pts.splice(drag, 1); drag = null; dessiner(); } }, 650); return; }
        if (m) { ev.preventDefault(); sauve(); const i = +m.dataset.mid, p = pts[i], q = pts[(i + 1) % pts.length]; pts.splice(i + 1, 0, [snap((p[0] + q[0]) / 2), snap((p[1] + q[1]) / 2)]); drag = i + 1; bouge = false; svg.setPointerCapture(ev.pointerId); dessiner(); return; }
        sauve(); pts.push(pos(ev)); dessiner();
      });
      svg.addEventListener('pointermove', ev => { if (drag == null) return; const p = pos(ev); if (!pts[drag] || (p[0] === pts[drag][0] && p[1] === pts[drag][1])) return; bouge = true; clearTimeout(appui); pts[drag] = p; dessiner(); });
      const fin = () => { clearTimeout(appui); drag = null; };
      svg.addEventListener('pointerup', fin); svg.addEventListener('pointercancel', fin);
      svg.addEventListener('dblclick', ev => { const c = ev.target.closest('[data-pt]'); if (c && pts.length > 3) { sauve(); pts.splice(+c.dataset.pt, 1); dessiner(); } });
      zoomSel.addEventListener('change', () => { S = +zoomSel.value; dessiner(); });
      const redim = (axe, v) => { if (pts.length < 3 || !(v > 0)) return; const b = bbox(pts), base = axe === 'w' ? b.w : b.h; if (!(base > 0)) return; sauve(); const f = v / base, mx = Math.min(...pts.map(p => p[0])), my = Math.min(...pts.map(p => p[1])); pts = pts.map(p => axe === 'w' ? [Math.round((mx + (p[0] - mx) * f) * 10) / 10, p[1]] : [p[0], Math.round((my + (p[1] - my) * f) * 10) / 10]); const nb = bbox(pts); if (Math.max(nb.w, nb.h) + 4 > S) { S = [30, 50, 80, 120].find(z => z >= Math.max(nb.w, nb.h) + 4) || 120; zoomSel.value = S; } dessiner(); };
      bg.querySelector('#fm-w').addEventListener('change', e => redim('w', num(e.target.value)));
      bg.querySelector('#fm-h').addEventListener('change', e => redim('h', num(e.target.value)));
      const fermer = v => { document.removeEventListener('keydown', clav, true); bg.remove(); resolve(v); };
      const clav = e => { if (e.key === 'Escape') { e.stopPropagation(); fermer(null); } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (hist.length) { pts = JSON.parse(hist.pop()); dessiner(); } } };
      document.addEventListener('keydown', clav, true);
      bg.addEventListener('click', e => {
        const a = e.target.closest('[data-fm]'); if (!a) { if (e.target === bg) fermer(null); return; }
        const t = a.dataset.fm, L = Math.max(num(g.l), 10), H = Math.max(num(g.h), 10);
        if (t === 'annuler') return fermer(null);
        if (t === 'ok') { if (pts.length < 3) return; const P = normaliser(pts), b = bbox(P); return fermer({ pts: P, l: Math.round(b.w * 10) / 10, h: Math.round(b.h * 10) / 10, p: Math.round(perimPoly(P) * 10) / 10 }); }
        if (t === 'undo') { if (hist.length) { pts = JSON.parse(hist.pop()); dessiner(); } return; }
        sauve();
        if (t === 'vider') pts = [];
        if (t === 'rect') pts = [[2, 2], [2 + L, 2], [2 + L, 2 + H], [2, 2 + H]];
        if (t === 'rond') pts = cercle(Math.min(L, H), 24).map(p => [Math.round((p[0] + 2) * 10) / 10, Math.round((p[1] + 2) * 10) / 10]);
        if (t === 'tri') pts = [[2, 2], [2 + L, 2], [2 + L / 2, 2 + H]];
        if (t === 'miroir' && pts.length) { const b = bbox(pts), mx = Math.min(...pts.map(p => p[0])); pts = pts.map(p => [Math.round((mx + b.w - (p[0] - mx)) * 10) / 10, p[1]]).reverse(); }
        const nb = pts.length ? bbox(pts) : { w: 0, h: 0 }; if (Math.max(nb.w, nb.h) + 4 > S) { S = [30, 50, 80, 120].find(z => z >= Math.max(nb.w, nb.h) + 4) || 120; zoomSel.value = S; }
        dessiner();
      });
      dessiner();
    });
  }

  window.Formes = { FORMES, forme, contour, aire, perimetre, dims, empreinte, placer, apercu, motif, editer };
})();
