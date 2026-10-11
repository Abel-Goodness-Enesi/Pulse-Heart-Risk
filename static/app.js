(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var GROUPS = [
    { title: 'You', items: [
      { k: 'male', type: 'seg', opts: [[0, 'Female'], [1, 'Male']] },
      { k: 'age', label: 'Age', min: 25, max: 80, step: 1, unit: ' yrs' } ] },
    { title: 'Habits', items: [
      { k: 'cigsPerDay', label: 'Cigarettes a day', min: 0, max: 70, step: 1, unit: '' } ] },
    { title: 'Pressure and blood', items: [
      { k: 'sysBP', label: 'Systolic blood pressure', min: 80, max: 300, step: 1, unit: ' mmHg' },
      { k: 'diaBP', label: 'Diastolic blood pressure', min: 40, max: 150, step: 1, unit: ' mmHg' },
      { k: 'totChol', label: 'Total cholesterol', min: 100, max: 700, step: 1, unit: ' mg/dL' },
      { k: 'glucose', label: 'Glucose', min: 40, max: 400, step: 1, unit: ' mg/dL' } ] },
    { title: 'Body', items: [
      { k: 'BMI', label: 'BMI', min: 15, max: 57, step: 0.1, unit: '' },
      { k: 'heartRate', label: 'Resting heart rate', min: 40, max: 145, step: 1, unit: ' bpm', hint: 'The crowd above beats at this rate.' } ] },
    { title: 'History', items: [
      { k: 'prevalentHyp', type: 'tgl', label: 'Told they have high blood pressure' },
      { k: 'diabetes', type: 'tgl', label: 'Diabetes' },
      { k: 'BPMeds', type: 'tgl', label: 'Takes blood pressure medication' },
      { k: 'prevalentStroke', type: 'tgl', label: 'Has had a stroke' } ] }
  ];
  /* order and plain names for the "why" chart: model's own ranking by coefficient size */
  var WHY = [['age', 'Age'], ['cigsPerDay', 'Cigarettes'], ['sysBP', 'Systolic pressure'], ['male', 'Sex'], ['glucose', 'Glucose'],
    ['prevalentHyp', 'High blood pressure'], ['prevalentStroke', 'Stroke'], ['diabetes', 'Diabetes'], ['BPMeds', 'BP medication'],
    ['totChol', 'Cholesterol'], ['currentSmoker', 'Current smoker'], ['diaBP', 'Diastolic pressure'], ['heartRate', 'Heart rate'], ['BMI', 'BMI']];
  var UNITS = { age: ' yrs', sysBP: ' mmHg', diaBP: ' mmHg', totChol: ' mg/dL', glucose: ' mg/dL', heartRate: ' bpm', BMI: '', cigsPerDay: ' /day' };

  var meta, state = {}, THR = 0.15, reqId = 0, timer = null, inputs = {}, tests = null;

  /* ---------- controls ---------- */
  function fmt(k, v) { return k === 'BMI' ? Number(v).toFixed(1) : Math.round(v); }
  function buildControls() {
    var root = $('#controls');
    GROUPS.forEach(function (g) {
      var wrap = document.createElement('div'); wrap.className = 'grp';
      wrap.innerHTML = '<h3>' + g.title + '</h3>';
      g.items.forEach(function (it) {
        var f = document.createElement('div'); f.className = 'fld';
        if (it.type === 'seg') {
          f.innerHTML = '<div class="seg" role="group" aria-label="Sex">' + it.opts.map(function (o) {
            return '<button type="button" data-v="' + o[0] + '" aria-pressed="false">' + o[1] + '</button>'; }).join('') + '</div>';
          f.querySelectorAll('button').forEach(function (b) {
            b.addEventListener('click', function () { set(it.k, +b.dataset.v); });
          });
          inputs[it.k] = { sync: function (v) { f.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.v === +v)); }); } };
        } else if (it.type === 'tgl') {
          f.innerHTML = '<button type="button" class="tgl" role="switch" aria-checked="false"><span>' + it.label + '</span><i></i></button>';
          var tb = f.querySelector('button');
          tb.addEventListener('click', function () { set(it.k, state[it.k] ? 0 : 1); });
          inputs[it.k] = { sync: function (v) { tb.setAttribute('aria-checked', String(!!+v)); } };
        } else {
          var id = 'in-' + it.k;
          f.innerHTML = '<div class="row"><label for="' + id + '">' + it.label + '</label><output for="' + id + '"></output></div>' +
            '<input id="' + id + '" type="range" min="' + it.min + '" max="' + it.max + '" step="' + it.step + '">' + (it.hint ? '<span class="hint">' + it.hint + '</span>' : '');
          var r = f.querySelector('input'), o = f.querySelector('output');
          r.addEventListener('input', function () { set(it.k, +r.value); });
          inputs[it.k] = { sync: function (v) {
            var c = Math.min(it.max, Math.max(it.min, +v));
            r.value = c; o.textContent = fmt(it.k, v) + it.unit;
            r.style.setProperty('--p', ((c - it.min) / (it.max - it.min) * 100) + '%'); } };
        }
        wrap.appendChild(f);
      });
      root.appendChild(wrap);
    });
  }
  function syncControls() { for (var k in inputs) inputs[k].sync(state[k]); }
  function set(k, v) {
    state[k] = v;
    if (k === 'cigsPerDay') state.currentSmoker = v > 0 ? 1 : 0;
    syncControls();
    clearTimeout(timer); timer = setTimeout(predict, 70);
  }

  /* ---------- prediction ---------- */
  function predict() {
    var id = ++reqId;
    return fetch('/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
      .then(function (r) { return r.json(); })
      .then(function (res) { if (id === reqId) render(res); return res; });
  }
  var shown = 0, tweenRaf = 0;
  function tween(to) {
    cancelAnimationFrame(tweenRaf);
    var from = shown, t0 = performance.now(), d = reduce ? 1 : 520;
    (function step(now) {
      var k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3);
      shown = from + (to - from) * e; $('#pct').textContent = Math.round(shown);
      if (k < 1) tweenRaf = requestAnimationFrame(step);
    })(t0);
  }
  function render(res) {
    var p = res.prob, n = Math.round(p * 100);
    tween(p * 100);
    crowd.setCount(n);
    $('#lede').innerHTML = 'About <b>' + n + ' of 100</b> people with these numbers develop heart disease within ten years. A person average on every input scores ' + Math.round(res.base_prob * 100) + '.';
    var chip = $('#chip');
    chip.className = 'chip ' + (res.flagged ? 'on' : 'off');
    chip.textContent = res.flagged ? 'Flagged: above the ' + res.threshold.toFixed(2) + ' line' : 'Not flagged: below the ' + res.threshold.toFixed(2) + ' line';
    drawTug(res.contributions);
  }

  /* ---------- why chart ---------- */
  var tugRows = {};
  function buildTug() {
    var root = $('#tug');
    WHY.forEach(function (w) {
      var row = document.createElement('div'); row.className = 'tr';
      row.innerHTML = '<span class="nm">' + w[1] + '<small></small></span><div class="track"><i></i></div><output>0.00</output>';
      root.appendChild(row); tugRows[w[0]] = row;
    });
  }
  function drawTug(list) {
    var DOM = 1.8;
    list.forEach(function (c) {
      var row = tugRows[c.feature]; if (!row) return;
      var w = Math.min(1, Math.abs(c.push) / DOM) * 50, bar = row.querySelector('i');
      bar.className = c.push >= 0 ? 'up' : 'dn';
      bar.style.width = w + '%'; bar.style.left = (c.push >= 0 ? 50 : 50 - w) + '%';
      row.querySelector('output').textContent = (c.push > 0 ? '+' : '') + c.push.toFixed(2);
      var v = c.value, u = UNITS[c.feature];
      row.querySelector('small').textContent = (u !== undefined) ? (c.feature === 'BMI' ? v.toFixed(1) : Math.round(v)) + u : (v ? 'yes' : 'no');
      if (c.feature === 'male') row.querySelector('small').textContent = v ? 'male' : 'female';
    });
  }

  /* ---------- the crowd ---------- */
  var crowd = (function () {
    var cv = $('#crowd'), ctx = cv.getContext('2d'), N = 100, W = 0, dots = [];
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var order = []; for (var i = 0; i < N; i++) order.push(i);
    for (var j = N - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)), t = order[j]; order[j] = order[k]; order[k] = t; }
    for (var d = 0; d < N; d++) {
      var cx = d % 10, cy = Math.floor(d / 10);
      dots.push({ x: cx, y: cy, cur: 0, tgt: 0, at: 0, dist: Math.hypot(cx - 4.5, cy - 4.5) / 6.4 });
    }
    function size() { var dpr = window.devicePixelRatio || 1; W = cv.clientWidth; cv.width = W * dpr; cv.height = W * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function setCount(n) {
      var now = performance.now();
      for (var r = 0; r < N; r++) {
        var idx = order[r], want = r < n ? 1 : 0;
        if (dots[idx].tgt !== want) { dots[idx].tgt = want; dots[idx].at = now + r * 9; }
      }
    }
    function frame(now) {
      var bpm = +state.heartRate || 72, period = 60000 / bpm, phase = (now % period) / period, cell = W / 10;
      ctx.clearRect(0, 0, W, W);
      for (var i = 0; i < N; i++) {
        var o = dots[i];
        if (now >= o.at) o.cur += (o.tgt - o.cur) * (reduce ? 1 : 0.14);
        var lag = o.dist * 0.22, q = phase - lag; if (q < 0) q += 1;
        var beat = reduce ? 0 : Math.exp(-Math.pow((q - 0.05) / 0.07, 2)) * 0.34 + Math.exp(-Math.pow((q - 0.3) / 0.09, 2)) * 0.14;
        var r = cell * 0.3 * (1 + beat), x = (o.x + 0.5) * cell, y = (o.y + 0.5) * cell;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(246,247,255,' + (0.7 - 0.45 * o.cur) + ')'; ctx.stroke();
        if (o.cur > 0.02) { ctx.fillStyle = 'rgba(255,232,74,' + Math.min(1, o.cur) + ')'; ctx.fill(); }
      }
      requestAnimationFrame(frame);
    }
    size(); window.addEventListener('resize', size); requestAnimationFrame(frame);
    return { setCount: setCount };
  })();

  /* ---------- live run ---------- */
  var run = { on: false, i: 0, ms: 1300, tally: { tp: 0, fn: 0, fp: 0, tn: 0 } };
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function showStamp(y) {
    var s = $('#stamp'); s.hidden = false; s.className = 'stamp ' + (y ? 'dev' : 'well');
    s.textContent = y ? 'Developed it' : 'Stayed healthy';
    void s.offsetWidth; s.classList.add('pop');
  }
  function scoreboard() {
    var t = run.tally;
    $('#tp').textContent = t.tp; $('#fn').textContent = t.fn; $('#fp').textContent = t.fp; $('#tn').textContent = t.tn;
    $('#rec').textContent = (t.tp + t.fn) ? (t.tp / (t.tp + t.fn)).toFixed(3) : '–';
    $('#prec').textContent = (t.tp + t.fp) ? (t.tp / (t.tp + t.fp)).toFixed(3) : '–';
    $('#count').textContent = 'Patient ' + run.i + ' of ' + tests.rows.length;
  }
  function loadTests() {
    if (tests) return Promise.resolve();
    return fetch('/api/test-patients').then(function (r) { return r.json(); }).then(function (d) { tests = d; scoreboard(); });
  }
  async function loop() {
    await loadTests();
    var cols = tests.columns, yi = cols.indexOf('actual');
    while (run.on && run.i < tests.rows.length) {
      var row = tests.rows[run.i];
      cols.forEach(function (c, j) { if (j !== yi) state[c] = row[j]; });
      syncControls();
      var res = await predict(), y = row[yi], cls;
      showStamp(y);
      if (res.flagged && y) { run.tally.tp++; cls = 'hit'; } else if (!res.flagged && y) { run.tally.fn++; cls = 'miss'; }
      else if (res.flagged) { run.tally.fp++; cls = 'fp'; } else { run.tally.tn++; cls = 'tn'; }
      var cell = document.createElement('i'); cell.className = cls; $('#tape').appendChild(cell);
      run.i++; scoreboard();
      await sleep(run.ms);
    }
    if (run.i >= tests.rows.length) { run.on = false; $('#go').textContent = 'Done'; }
  }
  function resetRun() {
    run.on = false; run.i = 0; run.tally = { tp: 0, fn: 0, fp: 0, tn: 0 };
    $('#tape').innerHTML = ''; $('#stamp').hidden = true; $('#go').textContent = 'Start';
    if (tests) scoreboard();
  }
  $('#go').addEventListener('click', function () {
    if (run.on) { run.on = false; this.textContent = 'Resume'; return; }
    if (tests && run.i >= tests.rows.length) resetRun();
    run.on = true; this.textContent = 'Pause'; loop();
  });
  $('#rst').addEventListener('click', function () { resetRun(); });
  document.querySelectorAll('.speed .btn').forEach(function (b) {
    b.addEventListener('click', function () {
      run.ms = +b.dataset.ms;
      document.querySelectorAll('.speed .btn').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });

  /* ---------- boot ---------- */
  buildControls(); buildTug();
  fetch('/api/meta').then(function (r) { return r.json(); }).then(function (m) {
    meta = m; THR = m.threshold; state = Object.assign({}, m.defaults);
    $('#count').textContent = 'Patient 0 of ' + m.n_test;
    syncControls(); predict();
  }).catch(function () { $('#lede').textContent = 'The model service did not answer. Reload the page in a moment.'; });
})();
