/* PULSE — everything runs client-side. The model is the notebook's logistic regression,
   expressed in raw units (scaler folded into the weights). */
(() => {
"use strict";
const M = window.MODEL, P = window.PATIENTS;
const COLS = M.cols, N = COLS.length, IDX = Object.fromEntries(COLS.map((c, i) => [c, i]));
const LOCKED = M.thr; // 0.15
const sig = z => 1 / (1 + Math.exp(-z));
const zOf = v => { let z = M.b0; for (let i = 0; i < N; i++) z += M.w[i] * v[i]; return z; };
const probOf = v => sig(zOf(v));
const $ = (s, r = document) => r.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const NICE = { male:"Sex (male)", age:"Age", currentSmoker:"Smoker", cigsPerDay:"Cigarettes/day", BPMeds:"BP medication",
  prevalentStroke:"Prior stroke", prevalentHyp:"Hypertension", diabetes:"Diabetes", totChol:"Cholesterol", sysBP:"Systolic BP",
  diaBP:"Diastolic BP", BMI:"BMI", heartRate:"Heart rate", glucose:"Glucose" };
const pct = (p, d = 1) => (p * 100).toFixed(d) + "%";

let BPM = M.med[IDX.heartRate];
function setBpm(b) {
  BPM = clamp(b, 40, 130);
  $("#navBpm").textContent = Math.round(BPM);
  document.documentElement.style.setProperty("--beat", (60 / BPM).toFixed(3) + "s");
}
setBpm(BPM);

/* ───── reveal on scroll + count-up ───── */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
document.querySelectorAll("[data-r]").forEach(el => io.observe(el));
document.querySelectorAll("[data-count]").forEach(el => {
  const to = parseFloat(el.dataset.count), dec = +el.dataset.dec, suf = el.dataset.suf || "";
  if (reduce) return;
  const t0 = performance.now() + 700;
  (function f(t) {
    const k = clamp((t - t0) / 1600, 0, 1), e = 1 - Math.pow(1 - k, 4);
    el.textContent = (to * e).toFixed(dec) + suf;
    if (k < 1) requestAnimationFrame(f);
  })(performance.now());
});

/* ───── cursor ───── */
const cur = $(".cursor");
if (matchMedia("(pointer:fine)").matches) {
  let cx = 0, cy = 0, tx = 0, ty = 0;
  addEventListener("pointermove", e => { tx = e.clientX; ty = e.clientY; });
  (function f() { cx = lerp(cx, tx, .22); cy = lerp(cy, ty, .22); cur.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(f); })();
  document.addEventListener("pointerover", e => cur.classList.toggle("big", !!e.target.closest("button,a,.chip,input[type=range],#rain")));
}

/* visibility gating so offscreen canvases sleep */
const vis = new Map();
const vio = new IntersectionObserver(es => es.forEach(e => vis.set(e.target, e.isIntersecting)), { rootMargin: "80px" });
function watch(el) { vis.set(el, true); vio.observe(el); }
function fit(c) {
  const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (c.width !== w * d || c.height !== h * d) { c.width = w * d; c.height = h * d; }
  const g = c.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0);
  return [g, w, h];
}

/* ───── HERO ECG ───── */
(() => {
  const c = $("#ecg"); watch(c);
  const g = (ph, c0, w, a) => a * Math.exp(-((ph - c0) ** 2) / (2 * w * w));
  const beat = ph => g(ph, .16, .025, .13) + g(ph, .285, .008, -.15) + g(ph, .31, .007, 1) + g(ph, .335, .011, -.3) + g(ph, .56, .05, .24);
  let t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!vis.get(c)) return;
    const [x, W, H] = fit(c);
    x.clearRect(0, 0, W, H);
    const speed = Math.max(120, W * .16), head = ((now - t0) / 1000 * speed) % (W + 120) - 40, L = W * .72;
    const wide = W >= 700, base = H * (wide ? .47 : .3), amp = wide ? Math.min(H * .22, 200) : Math.min(H * .3, 190);
    const yAt = px => {
      const tAt = (now - t0) / 1000 - (head - px) / speed;
      const ph = ((tAt * BPM / 60) % 1 + 1) % 1;
      return base - beat(ph) * amp;
    };
    x.lineCap = "round"; x.lineJoin = "round";
    const step = 2; let px = Math.max(0, head - L), py = yAt(px);
    for (let xx = px + step; xx <= Math.min(head, W); xx += step) {
      const yy = yAt(xx), a = clamp((xx - (head - L)) / L, 0, 1);
      x.strokeStyle = `rgba(255,74,28,${a * a})`; x.lineWidth = 1 + a * 2.2;
      x.beginPath(); x.moveTo(px, py); x.lineTo(xx, yy); x.stroke(); px = xx; py = yy;
    }
    if (head >= 0 && head <= W) {
      x.save(); x.shadowColor = "#ff4a1c"; x.shadowBlur = 28; x.fillStyle = "#fff3e8";
      x.beginPath(); x.arc(head, yAt(head), 4.5, 0, 7); x.fill(); x.restore();
    }
  }
  requestAnimationFrame(frame);
})();

/* ───── THE MACHINE ───── */
const FIELDS = {
  age:{l:"Age",min:30,max:70,step:1,u:" yrs"}, cigsPerDay:{l:"Cigarettes per day",min:0,max:60,step:1,u:""},
  sysBP:{l:"Systolic BP",min:80,max:250,step:1,u:" mmHg"}, diaBP:{l:"Diastolic BP",min:40,max:150,step:1,u:" mmHg"},
  totChol:{l:"Total cholesterol",min:100,max:700,step:1,u:" mg/dL"}, glucose:{l:"Glucose",min:40,max:400,step:1,u:" mg/dL"},
  BMI:{l:"BMI",min:15,max:45,step:.1,u:"",dec:1}, heartRate:{l:"Heart rate",min:40,max:130,step:1,u:" bpm"}
};
const CHIPS = [["male","Male"],["currentSmoker","Current smoker"],["BPMeds","On BP medication"],["prevalentHyp","Hypertension"],["diabetes","Diabetes"],["prevalentStroke","Prior stroke"]];
const st = M.med.slice();
let loaded = null;

const slWrap = $("#sliders"), chWrap = $("#chips"), sliders = {}, chips = {};
Object.entries(FIELDS).forEach(([k, f]) => {
  const d = document.createElement("div"); d.className = "sl";
  d.innerHTML = `<label for="s_${k}">${f.l}</label><output id="o_${k}"></output><input id="s_${k}" type="range" min="${f.min}" max="${f.max}" step="${f.step}">`;
  slWrap.append(d);
  const inp = d.querySelector("input"); sliders[k] = inp;
  inp.addEventListener("input", () => { st[IDX[k]] = +inp.value; edited(); });
});
CHIPS.forEach(([k, label]) => {
  const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = label; b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => { st[IDX[k]] = st[IDX[k]] ? 0 : 1; edited(); });
  chWrap.append(b); chips[k] = b;
});

function syncControls() {
  Object.entries(FIELDS).forEach(([k, f]) => {
    const v = st[IDX[k]]; sliders[k].value = v;
    sliders[k].style.setProperty("--p", clamp((v - f.min) / (f.max - f.min), 0, 1) * 100 + "%");
    $("#o_" + k).textContent = (f.dec ? v.toFixed(f.dec) : Math.round(v * 10) / 10) + f.u;
  });
  CHIPS.forEach(([k]) => chips[k].setAttribute("aria-pressed", st[IDX[k]] ? "true" : "false"));
}

const typical = probOf(M.med);
let target = 0, shown = 0;

function bandOf(p) {
  if (p < .10) return ["Lower risk", "#8fe0c8"];
  if (p < LOCKED) return ["Approaching the line", "#f1ead9"];
  if (p < .30) return ["Flagged — above the line", "#f2b441"];
  return ["Flagged — well above", "#ff4a1c"];
}

function recompute() {
  const p = probOf(st); target = p;
  setBpm(st[IDX.heartRate]);
  const [txt, col] = bandOf(p), b = $("#band"); b.textContent = txt; b.style.color = col;
  const ratio = p / typical;
  $("#vs").textContent = `${ratio >= 1 ? ratio.toFixed(1) + "×" : (ratio).toFixed(2) + "×"} a typical person (${pct(typical)})`;
  // contributions
  const rows = COLS.map((c, i) => ({ c, i, v: M.w[i] * (st[i] - M.med[i]) }));
  rows.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const top = rows.slice(0, 7), sc = Math.max(.6, ...top.map(r => Math.abs(r.v)));
  const box = $("#why");
  if (!box.children.length) top.forEach(() => { const d = document.createElement("div"); d.className = "ct"; d.innerHTML = `<span></span><div class="bar"><i></i></div><em></em>`; box.append(d); });
  [...box.children].forEach((d, k) => {
    const r = top[k], w = Math.abs(r.v) / sc * 50, up = r.v >= 0;
    d.children[0].textContent = NICE[r.c];
    const bar = d.children[1].firstChild;
    bar.style.width = w + "%"; bar.style.left = (up ? 50 : 50 - w) + "%"; bar.style.background = up ? "#ff4a1c" : "#8fe0c8";
    d.children[2].textContent = (Math.abs(r.v) < .005 ? "±0" : (up ? "+" : "−") + Math.abs(r.v).toFixed(2));
  });
  // reveal
  const rv = $("#reveal");
  if (loaded) {
    const flagged = p >= LOCKED, sick = loaded.actual === 1;
    const verdict = sick ? (flagged ? ["good", "Hit", "The model flagged them, and they did develop heart disease."] : ["bad", "Miss", "The model cleared them, but they developed heart disease anyway."])
                         : (flagged ? ["bad", "False alarm", "The model flagged them, but they stayed well."] : ["good", "Cleared correctly", "The model cleared them, and they stayed well."]);
    rv.hidden = false; rv.className = "reveal " + verdict[0];
    rv.innerHTML = `<p class="tag">Real test patient #${loaded.n + 1} of ${P.length} · ${verdict[1]}</p>
      <p><b>In the 10 years that followed: ${sick ? "developed heart disease." : "no heart disease."}</b></p>
      <p>${verdict[2]} Browser score ${p.toFixed(6)} · notebook score ${loaded.nb.toFixed(6)}.</p>`;
  } else rv.hidden = true;
}

function edited() { loaded = null; syncControls(); recompute(); }
function loadPatient(n) {
  const r = P[n]; for (let i = 0; i < N; i++) st[i] = r[i];
  loaded = { n, actual: r[15], nb: r[14] }; syncControls(); recompute();
}
$("#randBtn").addEventListener("click", () => {
  // bias toward interesting cases: half the time pull someone who actually developed CHD
  const want = Math.random() < .5 ? 1 : 0; let n, guard = 0;
  do { n = Math.floor(Math.random() * P.length); } while (P[n][15] !== want && ++guard < 400);
  loadPatient(n);
});
$("#resetBtn").addEventListener("click", () => { for (let i = 0; i < N; i++) st[i] = M.med[i]; edited(); });

/* heart / crowd canvas */
(() => {
  const c = $("#heart"); watch(c);
  const NDOT = 100, GA = 2.399963;
  let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const perm = [...Array(NDOT).keys()]; for (let i = NDOT - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const rank = new Array(NDOT); perm.forEach((dot, k) => rank[dot] = k);
  const bright = new Float32Array(NDOT);
  let phase = 0, last = performance.now(), rings = [];
  const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!vis.get(c)) return;
    const [x, W, H] = fit(c), cx = W / 2, cy = H / 2, R = Math.min(W, H) * .4;
    shown += (target - shown) * (1 - Math.pow(.0005, dt));
    $("#riskBig").firstChild.textContent = (shown * 100).toFixed(1);
    phase += dt * BPM / 60; if (phase >= 1) { phase -= 1; rings.push(now); if (rings.length > 4) rings.shift(); }
    const pulse = Math.exp(-phase * 9) + .5 * Math.exp(-(((phase - .22) * 14) ** 2));
    const k = 1 + .05 * pulse, tone = mix([143, 224, 200], [255, 74, 28], clamp(target / .35, 0, 1));
    x.clearRect(0, 0, W, H);
    const gl = x.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
    gl.addColorStop(0, `rgba(${tone},${.22 + .22 * pulse})`); gl.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = gl; x.fillRect(0, 0, W, H);
    rings = rings.filter(t => now - t < 1400);
    rings.forEach(t => { const a = (now - t) / 1400; x.strokeStyle = `rgba(${tone},${(1 - a) * .55})`; x.lineWidth = 1.5;
      x.beginPath(); x.arc(cx, cy, R * (1.02 + a * .5) * k, 0, 7); x.stroke(); });
    const lit = Math.round(target * NDOT);
    for (let i = 0; i < NDOT; i++) {
      const goal = rank[i] < lit ? 1 : 0; bright[i] += (goal - bright[i]) * (1 - Math.pow(.002, dt));
      const r = R * Math.sqrt((i + .5) / NDOT) * k, a = i * GA, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      const b = bright[i], rad = R * .047 * (1 + b * .35);
      if (b > .02) { x.save(); x.shadowColor = "#ff4a1c"; x.shadowBlur = 18 * b; x.fillStyle = `rgba(255,${Math.round(74 + 70 * (1 - b))},28,${.35 + .65 * b})`; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill(); x.restore(); }
      else { x.fillStyle = "rgba(241,234,217,.2)"; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill(); }
    }
  }
  requestAnimationFrame(frame);
})();

/* ───── THE REPLAY ───── */
(() => {
  const c = $("#rain"); watch(c);
  const PX = 0.85, T = x => Math.sqrt(x / PX), TI = u => u * u * PX; // sqrt-scaled axis spreads the crowded low end
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const order = [...Array(P.length).keys()]; for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let dots = [], thr = LOCKED, startAt = Infinity, needLayout = true, W = 0, H = 0, pw = 0, ml = 16, floor = 0, running = true, GAP = 7000 / P.length;
  const thrEl = $("#thr"), thrV = $("#thrv");

  function layout() {
    const r = c.getBoundingClientRect(); W = Math.round(r.width);
    H = W < 600 ? 360 : W < 900 ? 420 : 480; c.style.height = H + "px";
    pw = W - ml * 2; floor = H - 44;
    let dw = 3, NB = Math.floor(pw / 3), maxc = 1;
    for (let w = 14; w >= 3; w--) {
      const nb = Math.floor(pw / w), cn = new Array(nb).fill(0);
      order.forEach(pi => cn[Math.min(nb - 1, Math.floor(T(P[pi][14]) * nb))]++);
      const mc = Math.max(...cn); dw = w; NB = nb; maxc = mc;
      if (mc * w <= floor - 84) break;
    }
    const cnt = new Array(NB).fill(0);
    dots = order.map((pi, rank) => {
      const p = P[pi][14], col = Math.min(NB - 1, Math.floor(T(p) * NB)), lvl = cnt[col]++;
      return { pi, p, sick: P[pi][15], col, lvl, rank };
    });
    const step = dw, rad = Math.max(1.1, dw / 2 - .4);
    dots.forEach(d => { d.tx = ml + (d.col + .5) * (pw / NB); d.ty = floor - (d.lvl + .5) * step; d.r = rad; });
  }
  const bounce = t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; };
  const DUR = 950;

  function counts(now) {
    let tp = 0, fn = 0, fp = 0, tn = 0;
    for (const d of dots) { if (now < startAt + d.rank * GAP + DUR * .55) continue; const f = d.p >= thr; if (d.sick) f ? tp++ : fn++; else f ? fp++ : tn++; }
    return [tp, fn, fp, tn];
  }
  let lastScore = "";
  function score(now) {
    const [tp, fn, fp, tn] = counts(now), key = [tp, fn, fp, tn].join();
    if (key === lastScore) return; lastScore = key;
    $("#sCaught").textContent = tp; $("#sMissed").textContent = fn; $("#sFalse").textContent = fp; $("#sClear").textContent = tn;
    $("#sRec").textContent = tp + fn ? (tp / (tp + fn)).toFixed(3) : "—"; $("#sPrec").textContent = tp + fp ? (tp / (tp + fp)).toFixed(3) : "—";
  }
  function setThr(v, fromUser) {
    thr = clamp(v, .03, .6); thrEl.value = thr; thrV.textContent = thr.toFixed(3); lastScore = ""; need = true;
    const n = $("#thrNote"), locked = Math.abs(thr - LOCKED) < .0026;
    n.className = "note" + (locked ? "" : " warn");
    n.textContent = locked ? "Locked on validation data at t = 0.15 — this is the result you report." : "Exploring. t = " + thr.toFixed(3) + " was NOT locked on validation data, so don’t report these numbers as the result.";
  }
  thrEl.addEventListener("input", () => setThr(+thrEl.value));
  $("#thrReset").addEventListener("click", () => setThr(LOCKED));
  $("#runBtn").addEventListener("click", () => { startAt = performance.now() + 150; lastScore = ""; need = true; });
  const fromPtr = e => { const r = c.getBoundingClientRect(); setThr(TI(clamp((e.clientX - r.left - ml) / pw, 0, 1))); };
  let drag = false;
  c.addEventListener("pointerdown", e => { drag = true; c.setPointerCapture(e.pointerId); fromPtr(e); });
  c.addEventListener("pointermove", e => { if (drag) fromPtr(e); });
  c.addEventListener("pointerup", () => drag = false);

  let need = true, started = false;
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !started) { started = true; startAt = performance.now() + 250; } }), { threshold: .25 }).observe(c);
  if (reduce) { startAt = -1e9; started = true; }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!vis.get(c)) return;
    const animating = !started ? false : now < startAt + P.length * GAP + DUR + 60;
    if (!animating && !need && started) return;
    need = false;
    if (needLayout) { layout(); needLayout = false; }
    const [x] = fit(c);
    x.clearRect(0, 0, W, H);
    const tx = ml + T(thr) * pw;
    // flagged zone
    const gz = x.createLinearGradient(tx, 0, W, 0); gz.addColorStop(0, "rgba(255,74,28,.13)"); gz.addColorStop(1, "rgba(255,74,28,.03)");
    x.fillStyle = gz; x.fillRect(tx, 0, W - tx, floor);
    // axis
    x.strokeStyle = "rgba(241,234,217,.2)"; x.lineWidth = 1; x.beginPath(); x.moveTo(ml, floor + .5); x.lineTo(W - ml, floor + .5); x.stroke();
    x.font = "10px 'Geist Mono',monospace"; x.textAlign = "center"; x.fillStyle = "rgba(241,234,217,.5)";
    (W < 600 ? [.05, .15, .3, .6] : [.02, .05, .1, .15, .2, .3, .4, .6, .8]).forEach(v => {
      const px = ml + T(v) * pw; x.fillRect(px, floor, 1, 5); x.fillText(v.toFixed(2), px, floor + 19);
    });
    x.textAlign = "left"; x.fillText("model risk score →", ml, floor + 36);
    // dots
    const t0 = startAt;
    for (const d of dots) {
      const rel = now - (t0 + d.rank * GAP); if (rel < 0) continue;
      const k = clamp(rel / DUR, 0, 1), y = k >= 1 ? d.ty : lerp(-10, d.ty, bounce(k)), f = d.p >= thr;
      if (d.sick) { x.fillStyle = "#ff4a1c"; } else x.fillStyle = f ? "rgba(242,180,65,.9)" : "rgba(241,234,217,.38)";
      x.beginPath(); x.arc(d.tx, y, d.r, 0, 7); x.fill();
      if (d.sick && !f && k >= 1 && d.r > 1.6) { x.strokeStyle = "rgba(241,234,217,.9)"; x.lineWidth = .8; x.beginPath(); x.arc(d.tx, y, d.r + .8, 0, 7); x.stroke(); }
    }
    // threshold line
    x.save(); x.setLineDash([5, 5]); x.strokeStyle = "#f1ead9"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(tx, 14); x.lineTo(tx, floor); x.stroke(); x.restore();
    x.fillStyle = "#f1ead9"; x.beginPath(); x.arc(tx, 14, 5, 0, 7); x.fill();
    x.font = "500 11px 'Geist Mono',monospace"; const left = tx > W * .55;
    x.textAlign = left ? "right" : "left"; x.fillText("t = " + thr.toFixed(3), tx + (left ? -12 : 12), 18);
    x.fillStyle = "rgba(241,234,217,.4)"; x.font = "10px 'Geist Mono',monospace";
    x.textAlign = "left"; if (tx > 110) { x.textAlign = "right"; x.fillText("← CLEARED", tx - 12, 36); }
    x.textAlign = "left"; if (W - tx > 110) x.fillText("FLAGGED →", tx + 12, 36);
    score(now);
  }
  addEventListener("resize", () => { needLayout = true; need = true; });
  requestAnimationFrame(frame);
  setThr(LOCKED);
})();

/* ───── THE EQUATION ───── */
(() => {
  const box = $("#rcLines"); const f = (v, d = 4) => (v < 0 ? "−" : "+") + Math.abs(v).toFixed(d);
  box.innerHTML = `<div class="rc"><span>intercept</span><i></i><b>${f(M.b0, 4)}</b></div>` +
    COLS.map((c, i) => `<div class="rc${M.w[i] < 0 ? " neg" : ""}"><span>${c} ×</span><i></i><b>${f(M.w[i], Math.abs(M.w[i]) < .01 ? 5 : 4)}</b></div>`).join("");
  const defs = [
    ["age", "Ten years older", 10], ["sysBP", "Systolic BP +20 mmHg", 20], ["cigsPerDay", "+10 cigarettes a day", 10], ["male", "Male", 1],
    ["prevalentHyp", "Diagnosed hypertension", 1], ["diabetes", "Diabetes", 1], ["BPMeds", "On BP medication", 1], ["glucose", "Glucose +20 mg/dL", 20],
    ["totChol", "Cholesterol +40 mg/dL", 40], ["BMI", "BMI +5", 5], ["prevalentStroke", "Prior stroke", 1, "very few cases — wobbly"]
  ];
  const od = $("#oddsList"), rows = defs.map(([k, l, s, note]) => ({ l, note, m: Math.exp(M.w[IDX[k]] * s) })).sort((a, b) => b.m - a.m);
  od.innerHTML = rows.map(r => {
    const ln = Math.log(r.m), w = clamp(Math.abs(ln) / Math.log(3), 0, 1) * 50, up = ln >= 0;
    return `<div class="od"><span>${r.l}${r.note ? `<small>${r.note}</small>` : ""}</span><div class="bar"><i data-w="${w}" style="${up ? "left:50%" : "right:50%"};background:${up ? "#ff4a1c" : "#8fe0c8"}"></i></div><b>×${r.m.toFixed(2)}</b></div>`;
  }).join("");
  new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { e.target.querySelectorAll("i[data-w]").forEach(i => i.style.width = i.dataset.w + "%"); o.disconnect(); } }), { threshold: .2 }).observe(od);

  // verification against notebook + live PR-AUC
  let dev = 0; P.forEach(r => { dev = Math.max(dev, Math.abs(probOf(r) - r[14])); });
  const idx = P.map((r, i) => i).sort((a, b) => probOf(P[b]) - probOf(P[a]));
  let tp = 0, ap = 0, pos = P.reduce((s, r) => s + r[15], 0);
  idx.forEach((i, k) => { if (P[i][15]) { tp++; ap += tp / (k + 1); } }); ap /= pos;
  $("#apLive").textContent = ap.toFixed(3);
  $("#verify").innerHTML = `✓ ${P.length} patients re-scored in your browser<br>max deviation from notebook: ${dev.toExponential(1)}`;
})();

/* init */
syncControls(); recompute(); shown = target;
})();
