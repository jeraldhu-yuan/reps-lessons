// Reps lesson runtime. See LESSON_SPEC.md. Lessons call Reps.lesson({...}) once.
(() => {
'use strict';

const q = new URLSearchParams(location.search);
const C = { x: '#ff6b6b', y: '#51cf66', z: '#4dabf7', acc: '#ffd43b', fg: '#e8eaed', dim: '#8b93a1', line: '#2a2f3a', ghost: '#5c6370' };

// ---------- math ----------
const rad = d => d * Math.PI / 180;
const rot = deg => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [[c, -s], [s, c]]; };
const apply = (M, p) => M.map(r => r.reduce((a, m, i) => a + m * p[i], 0));
const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((a, m, k) => a + m * B[k][j], 0)));
const T = M => M[0].map((_, j) => M.map(r => r[j]));
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const rp = (p, deg) => apply(rot(deg), p);
const fmt = n => String(+(+n).toFixed(2));
const vec = p => '(' + p.map(fmt).join(', ') + ')';
const pick = (v, arr) => arr[((v % arr.length) + arr.length) % arr.length];
const mat = M => `<span class="mat" style="grid-template-columns:repeat(${M[0].length},auto)">${M.flat().map(v => `<span>${typeof v === 'number' ? fmt(v) : v}</span>`).join('')}</span>`;
// orthographic 3D -> 2D projection, z up
const proj = (yaw, pitch) => ([x, y, z]) => {
  const a = rad(yaw), b = rad(pitch), u = x * Math.cos(a) - y * Math.sin(a), w = x * Math.sin(a) + y * Math.cos(a);
  return [u, z * Math.cos(b) + w * Math.sin(b)];
};

// ---------- bridge ----------
const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.reps;
const log = [];
function post(type, data) {
  const msg = { v: 1, type, ...data };
  log.push(msg);
  if (native) native.postMessage(msg); else console.log('[reps]', JSON.stringify(msg));
}

// ---------- stage: a canvas in world coordinates, y up, equal aspect ----------
class Stage {
  constructor(canvas, view) {
    this.cv = canvas; this.g = canvas.getContext('2d'); this.view = view; this.draw = () => {};
    this.over = null; // runtime overlay (point marker)
    const [x0, x1, y0, y1] = view, w = canvas.clientWidth, h = Math.round(w * (y1 - y0) / (x1 - x0)), d = devicePixelRatio || 1;
    canvas.style.height = h + 'px'; canvas.width = w * d; canvas.height = h * d;
    this.g.scale(d, d); this.w = w; this.h = h; this.s = w / (x1 - x0);
    this.g.lineCap = this.g.lineJoin = 'round';
  }
  px([x, y]) { return [(x - this.view[0]) * this.s, (this.view[3] - y) * this.s]; }
  world(e) { const r = this.cv.getBoundingClientRect(); return [(e.clientX - r.left) / this.s + this.view[0], this.view[3] - (e.clientY - r.top) / this.s]; }
  redraw() { this.g.clearRect(0, 0, this.w, this.h); this.draw(this); if (this.over) this.over(this); }
  line(a, b, color = C.fg, width = 2, dash) {
    const g = this.g; g.beginPath(); g.setLineDash(dash || []); g.strokeStyle = color; g.lineWidth = width;
    g.moveTo(...this.px(a)); g.lineTo(...this.px(b)); g.stroke(); g.setLineDash([]);
  }
  arrow(a, b, color = C.fg, width = 3) {
    const [ax, ay] = this.px(a), [bx, by] = this.px(b), L = Math.hypot(bx - ax, by - ay);
    this.line(a, b, color, width);
    if (L < 4) return;
    const ux = (bx - ax) / L, uy = (by - ay) / L, g = this.g, k = 9;
    g.beginPath(); g.fillStyle = color; g.moveTo(bx + ux * 3, by + uy * 3);
    g.lineTo(bx - ux * k - uy * k * .55, by - uy * k + ux * k * .55); g.lineTo(bx - ux * k + uy * k * .55, by - uy * k - ux * k * .55); g.fill();
  }
  dot(p, color = C.acc, label, r = 6) {
    const g = this.g, [x, y] = this.px(p); g.beginPath(); g.fillStyle = color; g.arc(x, y, r, 0, 7); g.fill();
    if (label) this.label(p, label, color, [10, -10]);
  }
  ring(p, color = C.acc, r = 11) { const g = this.g, [x, y] = this.px(p); g.beginPath(); g.strokeStyle = color; g.lineWidth = 2; g.arc(x, y, r, 0, 7); g.stroke(); }
  label(p, text, color = C.fg, off = [0, 0]) {
    const g = this.g, [x, y] = this.px(p); g.font = '600 14px -apple-system, system-ui, sans-serif'; g.fillStyle = color;
    g.textAlign = off[0] < 0 ? 'right' : off[0] > 0 ? 'left' : 'center'; g.textBaseline = 'middle'; g.fillText(text, x + off[0], y + off[1]);
  }
  poly(pts, stroke = C.fg, fill, width = 2) {
    const g = this.g; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...this.px(p)) : g.moveTo(...this.px(p))); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
  }
  grid(numbers = true) {
    const [x0, x1, y0, y1] = this.view;
    for (let x = Math.ceil(x0); x <= x1; x++) this.line([x, y0], [x, y1], x ? C.line : C.ghost, x ? 1 : 1.5);
    for (let y = Math.ceil(y0); y <= y1; y++) this.line([x0, y], [x1, y], y ? C.line : C.ghost, y ? 1 : 1.5);
    if (!numbers) return;
    const g = this.g; g.font = '11px ui-monospace, Menlo, monospace'; g.fillStyle = C.dim; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let x = Math.ceil(x0) + 1; x < x1; x++) if (x) g.fillText(x, this.px([x, 0])[0], this.px([x, 0])[1] + 3);
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let y = Math.ceil(y0) + 1; y < y1; y++) if (y) g.fillText(y, this.px([0, y])[0] - 4, this.px([0, y])[1]);
  }
  // a coordinate frame: origin o, rotated by deg, red x / green y
  frame(o, deg, name, len = 1.5, alpha = 1) {
    const g = this.g; g.globalAlpha = alpha;
    this.arrow(o, add(o, rp([len, 0], deg)), C.x); this.arrow(o, add(o, rp([0, len], deg)), C.y);
    this.dot(o, C.fg, null, 4); if (name) this.label(add(o, rp([-.45, -.45], deg)), name, C.fg);
    g.globalAlpha = 1;
  }
  // cb(worldPoint, 'down'|'move'|'up'); disables scrolling over the canvas
  drag(cb) {
    const cv = this.cv; cv.style.touchAction = 'none'; let on = false;
    cv.addEventListener('pointerdown', e => { on = true; cv.setPointerCapture(e.pointerId); cb(this.world(e), 'down'); this.redraw(); });
    cv.addEventListener('pointermove', e => { if (on) { cb(this.world(e), 'move'); this.redraw(); } });
    const up = e => { if (on) { on = false; cb(this.world(e), 'up'); this.redraw(); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  // tween t from 0 to 1 over ms, calling fn(t) then redraw
  animate(ms, fn) {
    const t0 = performance.now(), ease = t => t * t * (3 - 2 * t);
    const step = now => { const t = Math.min(1, (now - t0) / ms); fn(ease(t)); this.redraw(); if (t < 1 && this.cv.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
}

// ---------- inputs: each returns { value(), lock(correct) } and calls ready(bool) ----------
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const inputs = {
  choice(inp, host, ready) {
    let sel = -1;
    const box = el('div', 'opts' + (inp.cols === 2 ? ' cols2' : ''));
    const btns = inp.options.map((o, i) => {
      const b = el('button', 'opt', o.html); b.onclick = () => { sel = i; btns.forEach((x, j) => x.classList.toggle('sel', j === i)); ready(true); };
      box.append(b); return b;
    });
    host.append(box);
    return {
      value: () => sel, set: i => btns[i].click(),
      check: () => ({ correct: !!inp.options[sel].correct, why: inp.options[sel].why }),
      lock(correct, showAnswer) {
        box.classList.add('locked'); btns[sel].classList.add(correct ? 'right' : 'wrong');
        if (showAnswer) btns[inp.options.findIndex(o => o.correct)].classList.add('right');
      },
      solution: wrong => inp.options.findIndex(o => !!o.correct !== !!wrong),
    };
  },
  number(inp, host, ready) {
    const box = el('div', 'num'), f = el('input');
    f.inputMode = 'decimal'; f.placeholder = '?'; f.autocomplete = 'off';
    const val = () => parseFloat(f.value.replace(',', '.').replace('−', '-'));
    f.oninput = () => ready(!isNaN(val()));
    // iOS decimal keypad has no minus key
    const pm = el('button', 'opt', '±'); pm.onclick = () => { f.value = f.value.startsWith('-') ? f.value.slice(1) : '-' + f.value; f.oninput(); };
    box.append(f); if (inp.unit) box.append(el('span', null, inp.unit)); box.append(pm); host.append(box);
    return {
      value: val, set: x => { f.value = x; f.oninput(); },
      check: () => { const x = val(), ok = Math.abs(x - inp.answer) <= (inp.tol ?? 0.011); return { correct: ok, why: !ok && inp.why && inp.why(x) }; },
      lock() { f.disabled = pm.disabled = true; f.blur(); },
      solution: wrong => inp.answer + (wrong ? 7 : 0),
    };
  },
  // tap a point on the stage; snaps to inp.snap (default 1)
  point(inp, host, ready, stage) {
    let p = null; const snap = inp.snap ?? 1;
    const set = w => { p = w.map(v => Math.round(v / snap) * snap + 0); ready(true); };
    stage.over = st => { if (p) { st.ring(p, C.acc, 12); st.dot(p, C.acc, null, 5); } };
    stage.drag((w, ph) => { if (ph !== 'up') set(w); });
    return {
      value: () => p, set: w => { set(w); stage.redraw(); },
      check: () => { const ok = Math.hypot(p[0] - inp.answer[0], p[1] - inp.answer[1]) <= (inp.tol ?? 0.01); return { correct: ok, why: !ok && inp.why && inp.why(p) }; },
      lock() { stage.cv.classList.add('locked'); },
      solution: wrong => wrong ? add(inp.answer, [snap, snap]) : inp.answer,
    };
  },
  // tap tiles to fill slots in order
  order(inp, host, ready) {
    const order = [], n = inp.answer.length, slots = el('div', 'slots'), tiles = el('div', 'tiles');
    const sync = () => {
      slots.innerHTML = '';
      order.forEach((i, k) => { const t = el('button', 'tile', inp.tiles[i]); t.onclick = () => { order.splice(k, 1); sync(); }; slots.append(t); });
      [...tiles.children].forEach((t, i) => t.classList.toggle('used', order.includes(i) || order.length >= n));
      ready(order.length === n);
    };
    inp.tiles.forEach((h, i) => { const t = el('button', 'tile', h); t.onclick = () => { order.push(i); sync(); }; tiles.append(t); });
    host.append(slots, tiles);
    return {
      value: () => order, set: o => { order.splice(0, n, ...o); sync(); },
      check: () => { const ok = order.join() === inp.answer.join(); return { correct: ok, why: !ok && inp.why && inp.why(order) }; },
      lock() { slots.classList.add('locked'); tiles.classList.add('locked'); },
      solution: wrong => wrong ? [...inp.answer].reverse() : inp.answer,
    };
  },
  // the visual's state is the answer: inp.check() -> {correct, why}; inp.solve(wrong) sets the state (for tests)
  custom(inp, host, ready, stage) {
    ready(true);
    return {
      value: () => null, set: wrong => { inp.solve(wrong); stage && stage.redraw(); },
      check: () => inp.check(), lock() { stage && stage.cv.classList.add('locked'); }, solution: wrong => wrong,
    };
  },
};

// ---------- flow ----------
function lesson(def) {
  const mode = q.get('mode') === 'review' ? 'review' : 'lesson';
  let saved = null;
  try { saved = JSON.parse(q.get('resume') || 'null'); } catch { /* start fresh */ }
  const seed = saved ? saved.seed : q.has('seed') ? +q.get('seed') : Math.floor(Math.random() * 1000);
  const tag = gen => gen(0).concept;
  let items;
  if (mode === 'review') {
    const want = (q.get('concepts') || '').split(',').filter(Boolean);
    items = want.map(c => {
      const pool = def.problems.filter(g => tag(g) === c); const from = pool.length ? pool : def.learn.filter(g => tag(g) === c);
      return from.length ? { gen: pick(seed, from), phase: 'review', v0: seed } : null;
    }).filter(Boolean);
  } else {
    items = [...def.learn.map(gen => ({ gen, phase: 'learn', v0: 0 })), ...def.problems.map(gen => ({ gen, phase: 'problems', v0: seed }))];
  }
  if (saved && !(saved.done.length <= items.length)) saved = null; // the lesson changed since this was saved

  document.title = def.title;
  document.body.innerHTML = '<header><div class="bar"><i></i></div><div class="phase"><button id="back" aria-label="Previous screen">‹</button><span></span></div></header><main></main><footer><button id="go"></button></footer>';
  const main = document.querySelector('main'), go = document.getElementById('go'), back = document.getElementById('back');
  const bar = document.querySelector('.bar i'), phaseEl = document.querySelector('.phase span');
  const done = saved ? saved.done : [];   // settled items: { v: variant shown, value: the answer given }
  const first = saved ? saved.first : []; // first-attempt result per item
  let attempt = saved ? saved.attempt : 0, ended = false;
  const firstProblem = items.findIndex(x => x.phase === 'problems');
  // While a problem is unanswered the learn screens stay closed: problems test recall, not lookup.
  const floor = () => !ended && done.length < items.length && items[done.length].phase === 'problems' ? firstProblem : 0;
  const api = { log, def, mode, items, cur: null };

  post('lessonStarted', { lessonId: def.id, mode, total: items.length, resumed: !!saved });

  function show(k) {
    if (k >= items.length) return end();
    const it = items[k], d = done[k], s = it.gen(d ? d.v : it.v0 + attempt);
    bar.style.width = (100 * k / items.length) + '%';
    phaseEl.textContent = it.phase === 'learn' ? def.title : it.phase === 'review' ? 'Review' : `Problem ${k - firstProblem + 1} of ${def.problems.length} · no hints`;
    back.hidden = k <= floor();
    back.onclick = () => show(k - 1);
    main.innerHTML = ''; main.scrollTop = 0;
    main.append(el('div', 'prompt', s.prompt));
    let stage = null;
    if (s.visual) {
      const cv = el('canvas', 'stage'); main.append(cv);
      const ro = el('div', 'readout'); main.append(ro);
      stage = new Stage(cv, s.view || [-5, 5, -5, 5]); stage.readout = h => { ro.innerHTML = h; };
      s.visual(stage); stage.redraw();
    }
    const host = el('div'); main.append(host);
    go.textContent = 'Check'; go.disabled = true;
    const inp = inputs[s.input.type](s.input, host, ok => { go.disabled = !ok; }, stage);
    const reveal = (res, retry) => {
      const ok = !!res.correct;
      inp.lock(ok, !ok && it.phase === 'problems');
      const body = ok ? (s.explain || '') : (res.why || 'Not quite.') + (it.phase === 'learn' ? '' : '<br><br>' + (s.explain || ''));
      const fb = el('div', 'fb' + (ok ? '' : ' bad'), `<div class="tag">${ok ? 'Correct' : 'Not quite'}</div>${body}`);
      // with a visual, feedback sits right under it so the reveal animation stays in view
      if (stage) host.before(fb); else main.append(fb);
      fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (!retry && s.after && stage) s.after(stage);
      go.textContent = retry ? 'Try a variant' : 'Continue'; go.disabled = false;
      go.onclick = () => show(retry ? k : k + 1);
    };
    if (d) { // an answered screen, shown again as it was left
      api.cur = null; inp.set(d.value); reveal(inp.check(), false);
      return;
    }
    api.cur = { screen: s, input: inp, phase: it.phase, stage, index: k, attempt };
    go.onclick = () => {
      const res = inp.check(), ok = !!res.correct, retry = !ok && it.phase !== 'problems';
      if (attempt === 0) first[k] = { concept: s.concept, correct: ok };
      post('questionAnswered', { lessonId: def.id, concept: s.concept, correct: ok, phase: it.phase, attempt, index: k });
      reveal(res, retry);
      if (retry) attempt++;
      else { done[k] = { v: it.v0 + attempt, value: s.input.type === 'custom' ? !ok : JSON.parse(JSON.stringify(inp.value())) }; attempt = 0; }
      post('progress', { lessonId: def.id, mode, index: done.length, total: items.length, state: { seed, attempt, done, first } });
    };
  }

  function end() {
    bar.style.width = '100%'; phaseEl.textContent = ''; api.cur = null;
    back.hidden = !items.length;
    back.onclick = () => show(items.length - 1);
    const graded = first.filter((_, k) => items[k].phase !== 'learn');
    const correct = graded.filter(r => r.correct).length, total = graded.length, score = total ? correct / total : 0;
    const missed = [...new Set(first.filter(r => !r.correct).map(r => r.concept))];
    const pass = +(q.get('pass') || 0.7);
    if (!ended) {
      ended = true;
      if (mode === 'review') post('reviewCompleted', { lessonId: def.id, correct, total, results: graded });
      else post('lessonCompleted', { lessonId: def.id, score, correct, total, missed });
    }
    const ok = mode === 'review' || score >= pass;
    main.innerHTML = `<div class="end"><div class="score ${ok ? 'pass' : 'fail'}">${correct}/${total}</div>
      <p>${mode === 'review' ? 'Review cleared.' : ok ? 'Problem set passed.' : `Needs ${Math.round(pass * 100)}% to count. Run it again.`}</p>
      ${missed.length ? `<p style="color:var(--dim)">Queued for review:</p><ul>${missed.map(m => `<li>${m}</li>`).join('')}</ul>` : ''}</div>`;
    go.textContent = ok ? 'Done' : 'Retry'; go.disabled = false;
    go.onclick = () => {
      if (ok) return post('close', { lessonId: def.id });
      const fresh = new URL(location.href); fresh.searchParams.delete('resume'); location.replace(fresh);
    };
  }

  window.Reps.session = api;
  show(done.length);
}

window.Reps = { lesson, C, rad, rot, apply, mul, T, add, sub, rp, fmt, vec, pick, mat, proj, log };
})();
