'use strict';

(function () {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const $ = (sel) => document.querySelector(sel);

  // Theme handling

  const root = document.documentElement;
  const THEMES = ['dark', 'light', 'accessible'];
  const storedTheme = localStorage.getItem('sim-theme');
  const initialTheme = THEMES.includes(storedTheme) ? storedTheme : 'light';
  root.setAttribute('data-theme', initialTheme);

  const themeSelect = $('#themeSelect');

  function cssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  function applyTheme(theme) {
    const next = THEMES.includes(theme) ? theme : 'light';
    root.setAttribute('data-theme', next);
    localStorage.setItem('sim-theme', next);

    drawCanvas();
    drawCharts();
    updateSidebarCounts();
    updateRDisplaysLive();
    updateMetrics();

    if (themeSelect && themeSelect.value !== next) {
      themeSelect.value = next;
    }
  }

  if (themeSelect) {
    themeSelect.value = initialTheme;
    themeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }

  const yearEl = $('#year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Simple seeded RNG for deterministic runs

  function setSeed(s) {
    let seed = (s >>> 0) || 1;
    Math.random = function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // SEIRD states

  const STATE = {
    S: 0,
    E: 1,
    I: 2,
    R: 3,
    D: 4,
  };

  // Central DOM handles

  const els = {
    scenario: $('#scenario'),
    N: $('#N'),
    I0: $('#I0'),
    R0: $('#R0'),
    dt: $('#dt'),
    beta: $('#beta'),
    gamma: $('#gamma'),
    mu: $('#mu'),
    ve: $('#ve'),
    betaVal: $('#betaVal'),
    gammaVal: $('#gammaVal'),
    muVal: $('#muVal'),
    veVal: $('#veVal'),
    vaxCov: $('#vaxCov'),
    vaxCovVal: $('#vaxCovVal'),
    vaxRate: $('#vaxRate'),
    vaxRateVal: $('#vaxRateVal'),
    mutRate: $('#mutRate'),
    mutRateVal: $('#mutRateVal'),
    daysInf: $('#daysInf'),
    daysInfVal: $('#daysInfVal'),
    stoch: $('#stochastic'),
    seed: $('#seed'),
    autoStop: $('#autoStop'),
    contacts: $('#contacts'),
    toggle: $('#toggleBtn'),
    reset: $('#resetBtn'),
    R0disp: $('#R0disp'),
    RtDisp: $('#RtDisp'),
    timeDisp: $('#timeDisp'),
    simCanvas: $('#sim'),
    segS: $('#seg-sus'),
    segE: $('#seg-exp'),
    segI: $('#seg-inf'),
    segR: $('#seg-imm'),
    segD: $('#seg-dead'),
    pctS: $('#pctS'),
    pctE: $('#pctE'),
    pctI: $('#pctI'),
    pctR: $('#pctR'),
    pctD: $('#pctD'),
    cntS: $('#cntS'),
    cntE: $('#cntE'),
    cntI: $('#cntI'),
    cntR: $('#cntR'),
    cntD: $('#cntD'),
    pctVeff: $('#pctVeff'),
    pctVineff: $('#pctVineff'),
    cntVeff: $('#cntVeff'),
    cntVineff: $('#cntVineff'),
    exportCSV: $('#exportCSV'),
    scrubber: $('#scrubber'),
    viewLabel: $('#viewLabel'),
    scrubMin: $('#scrubMin'),
    scrubVal: $('#scrubVal'),
    scrubMax: $('#scrubMax'),
    NVal: $('#NVal'),
    incVaxChart: $('#incVaxChart'),
    sirChart: $('#sirChart'),
    m_t: $('#m-t'),
    m_N: $('#m-N'),
    m_alive: $('#m-alive'),
    m_cumInc: $('#m-cumInc'),
    m_incRisk: $('#m-incRisk'),
    m_riskRate: $('#m-riskRate'),
    m_incRate: $('#m-incRate'),
    m_prevPoint: $('#m-prevPoint'),
    m_everInf: $('#m-everInf'),
    m_cfr: $('#m-cfr'),
    cloneBtn: $('#cloneTimelineBtn'),
  };

  // Top-level simulation state

  const State = {
    N: 5000,
    dt: 1,
    beta: 0.35,
    gamma: 0.1,
    mu: 0.01,
    ve: 0,
    I0: 5,
    R0init: 0,
    vaxRate: 0,
    mutRate: 0,
    t: 0,
    running: false,
    people: [],
    cols: 0,
    rows: 0,
    series: {
      t: [],
      S: [],
      E: [],
      I: [],
      R: [],
      D: [],
      inc: [],
      prev: [],
      cumInc: [],
      vAllPct: [],
      vEffPct: [],
      everInf: [],
    },
    snapshots: [],
    viewIndex: null,
    stableCounter: 0,
    everInfectedCount: 0,
  };

  function getViewSnapshot() {
    const idx = State.viewIndex;
    if (idx != null && State.snapshots[idx]) {
      return State.snapshots[idx];
    }
    return null;
  }

  function computeAggregatesFromCurrentView() {
    const snap = getViewSnapshot();
    const src = snap || State.people;
    const N = src.length || 1;

    let S = 0,
      E = 0,
      I = 0,
      R = 0,
      D = 0;
    let vEff = 0,
      vIneff = 0;

    for (const p of src) {
      const s = p.state;
      if (s === STATE.S) S++;
      else if (s === STATE.E) E++;
      else if (s === STATE.I) I++;
      else if (s === STATE.R) R++;
      else if (s === STATE.D) D++;

      if (p.v) {
        if (p.vEff) vEff++;
        else vIneff++;
      }
    }

    return { N, S, E, I, R, D, vEff, vIneff };
  }

  function updateSidebarFromAggregates(agg) {
    const { N, S, E, I, R, D, vEff, vIneff } = agg;
    const pct = (x) => (100 * x) / Math.max(1, N);

    const pS = pct(S),
      pE = pct(E),
      pI = pct(I),
      pR = pct(R),
      pD = pct(D);
    const total = pS + pE + pI + pR + pD || 1;
    const k = 100 / total;

    const hS = pS * k,
      hE = pE * k,
      hI = pI * k,
      hR = pR * k,
      hD = pD * k;

    els.segS.style.height = hS + '%';
    els.segE.style.height = hE + '%';
    els.segI.style.height = hI + '%';
    els.segR.style.height = hR + '%';
    els.segD.style.height = hD + '%';

    els.pctS.textContent = hS.toFixed(0) + '%';
    els.pctE.textContent = hE.toFixed(0) + '%';
    els.pctI.textContent = hI.toFixed(0) + '%';
    els.pctR.textContent = hR.toFixed(0) + '%';
    els.pctD.textContent = hD.toFixed(0) + '%';

    els.cntS.textContent = `(${S})`;
    els.cntE.textContent = `(${E})`;
    els.cntI.textContent = `(${I})`;
    els.cntR.textContent = `(${R})`;
    els.cntD.textContent = `(${D})`;

    const pctEff = pct(vEff);
    const pctInef = pct(vIneff);

    if (els.pctVeff) els.pctVeff.textContent = pctEff.toFixed(0) + '%';
    if (els.cntVeff) els.cntVeff.textContent = `(${vEff})`;
    if (els.pctVineff) els.pctVineff.textContent = pctInef.toFixed(0) + '%';
    if (els.cntVineff) els.cntVineff.textContent = `(${vIneff})`;
  }

  function updateSidebarCounts() {
    const agg = computeAggregatesFromCurrentView();
    updateSidebarFromAggregates(agg);
  }

  function computeVaxStats() {
    const N = State.people.length || 1;
    let vAll = 0;
    for (const p of State.people) {
      if (p.v) vAll++;
    }
    return {
      vAll,
      vAllPct: (100 * vAll) / Math.max(1, N),
    };
  }

  function syncVaxCovSliderToState() {
    if (!els.vaxCov) return;
    const { vAllPct } = computeVaxStats();
    const val = clamp(vAllPct, 0, 100);
    els.vaxCov.value = val.toFixed(0);
    if (els.vaxCovVal) {
      els.vaxCovVal.textContent = val.toFixed(0) + '%';
    }
  }

  // Metrics table

  function updateMetrics() {
    const s = State.series;
    const len = s.t.length;

    const idx =
      State.viewIndex != null
        ? Math.min(State.viewIndex, Math.max(0, len - 1))
        : Math.max(0, len - 1);

    if (len === 0 || idx < 0) {
      setMetricsDash();
      return;
    }

    const t = s.t[idx];
    const S = s.S[idx];
    const E = s.E[idx];
    const I = s.I[idx];
    const R = s.R[idx];
    const D = s.D[idx];

    const N = State.N || S + E + I + R + D || 1;
    const atRisk0 = Math.max(1, N - (State.I0 || 0) - (State.R0init || 0));

    const everInfected =
      s.everInf && s.everInf[idx] != null
        ? s.everInf[idx]
        : State.everInfectedCount || 0;

    const cumIncRisk = atRisk0 > 0 ? everInfected / atRisk0 : NaN;
    const incRisk = cumIncRisk;
    const riskRate = t > 0 && atRisk0 > 0 ? cumIncRisk / t : NaN;

    let ptAtRisk = 0;
    for (let j = 0; j <= idx; j++) {
      const Sj = s.S[j] ?? S;
      const dt =
        j === 0
          ? s.t[0] || State.dt || 1
          : (s.t[j] - s.t[j - 1]) || State.dt || 1;
      ptAtRisk += Sj * dt;
    }
    const incRate = ptAtRisk > 0 ? everInfected / ptAtRisk : NaN;

    const alive = Math.max(1, N - D);
    const prevPoint = I / alive;
    const cfr = everInfected > 0 ? D / everInfected : NaN;

    const fmtPct = (x) =>
      !isFinite(x) ? '–' : (x * 100).toFixed(1) + '%';

    const fmtRate = (x, unit) =>
      !isFinite(x) ? '–' : x.toFixed(4) + ' ' + unit;

    const fmtCount = (x) =>
      !isFinite(x) ? '–' : Math.round(x).toString();

    const fmtTime = (x) =>
      !isFinite(x) ? '–' : x.toFixed(1) + ' d';

    if (els.m_t) els.m_t.textContent = fmtTime(t);
    if (els.m_N) els.m_N.textContent = fmtCount(N);
    if (els.m_alive) els.m_alive.textContent = fmtCount(alive);

    if (els.m_cumInc) els.m_cumInc.textContent = fmtPct(cumIncRisk);
    if (els.m_incRisk) els.m_incRisk.textContent = fmtPct(incRisk);
    if (els.m_riskRate) els.m_riskRate.textContent = fmtRate(riskRate, '/day');
    if (els.m_incRate) els.m_incRate.textContent = fmtRate(incRate, 'per person-day');

    if (els.m_prevPoint) els.m_prevPoint.textContent = fmtPct(prevPoint);
    if (els.m_everInf) els.m_everInf.textContent = fmtCount(everInfected);
    if (els.m_cfr) els.m_cfr.textContent = fmtPct(cfr);
  }

  function setMetricsDash() {
    const ids = [
      'm-t',
      'm-N',
      'm-alive',
      'm-cumInc',
      'm-incRisk',
      'm-riskRate',
      'm-incRate',
      'm-prevPoint',
      'm-everInf',
      'm-cfr',
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '–';
    });
  }

  function computeR0() {
    const beta = +els.beta.value;
    const gamma = +els.gamma.value;
    return gamma > 0 ? beta / gamma : Infinity;
  }

  function updateRDisplaysLive() {
    if (!els.R0disp || !els.RtDisp) return;

    const R0 = computeR0();
    els.R0disp.textContent = Number.isFinite(R0) ? R0.toFixed(2) : '∞';

    const agg = computeAggregatesFromCurrentView();
    const N = agg.N || State.N || 1;
    const effectivePop = Math.max(1, N - agg.D);
    const Rt = R0 * (agg.S / effectivePop);

    els.RtDisp.textContent = Number.isFinite(Rt) ? Rt.toFixed(2) : '∞';
  }

  function syncSliders() {
    if (els.betaVal) els.betaVal.textContent = Number(els.beta.value).toFixed(3);
    if (els.gammaVal) els.gammaVal.textContent = Number(els.gamma.value).toFixed(3);
    if (els.muVal) els.muVal.textContent = Number(els.mu.value).toFixed(3);
    if (els.veVal) els.veVal.textContent = Number(els.ve.value).toFixed(0) + '%';

    if (els.vaxCov && els.vaxCovVal) {
      els.vaxCovVal.textContent = Number(els.vaxCov.value).toFixed(0) + '%';
    }
    if (els.vaxRate && els.vaxRateVal) {
      els.vaxRateVal.textContent =
        Number(els.vaxRate.value).toFixed(3) + ' pts/day';
    }
    if (els.mutRate && els.mutRateVal) {
      els.mutRateVal.textContent = Number(els.mutRate.value).toFixed(4);
    }
    if (els.daysInf && els.daysInfVal) {
      els.daysInfVal.textContent = Number(els.daysInf.value).toFixed(1);
    }
    if (els.NVal && els.N) {
      els.NVal.textContent = els.N.value;
    }

    updateRDisplaysLive();
    updateMetrics();
  }

  function setToggleRunning() {
    State.running = true;
    els.toggle.textContent = '⏸︎ Pause';
    els.toggle.setAttribute('aria-pressed', 'true');
  }

  function resetToggleToStopped() {
    State.running = false;
    els.toggle.textContent = '▶ Run';
    els.toggle.setAttribute('aria-pressed', 'false');
  }

  // Maps days infectious slider to gamma

  function applyDaysInfToGamma() {
    if (!els.daysInf || !els.gamma) return;
    const days = +els.daysInf.value || 10;
    const g = days > 0 ? 1 / days : +els.gamma.value || 0.1;
    els.gamma.value = g.toFixed(2);
  }

  function syncDaysInfFromGamma() {
    if (!els.gamma || !els.daysInf) return;
    const g = parseFloat(els.gamma.value);
    if (g > 0) {
      els.daysInf.value = (1 / g).toFixed(1);
    }
  }

  // Canvas sizing (charts + sim)

  function prepareChartCanvas(c) {
    if (!c || !c.parentElement) return;
    const parent = c.parentElement;
    const dpr = window.devicePixelRatio || 1;

    let cssWidth = parent.clientWidth * 0.94;
    if (cssWidth <= 0) cssWidth = 400;

    let cssHeight = Math.max(130, Math.round(cssWidth * 0.35));

    c.style.width = cssWidth + 'px';
    c.style.height = cssHeight + 'px';

    const displayWidth = Math.floor(cssWidth * dpr);
    const displayHeight = Math.floor(cssHeight * dpr);

    if (c.width !== displayWidth || c.height !== displayHeight) {
      c.width = displayWidth;
      c.height = displayHeight;
    }

    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function updateChartLayouts() {
    prepareChartCanvas(els.incVaxChart);
    prepareChartCanvas(els.sirChart);
  }

  function resizeSimCanvas() {
    const c = els.simCanvas;
    if (!c) return;

    const wrapper = c.parentElement;
    if (!wrapper) return;

    const dpr = window.devicePixelRatio || 1;
    const styles = getComputedStyle(wrapper);
    const paddingX =
      parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);

    const availableOuter = wrapper.getBoundingClientRect().width || 900;
    const cssWidth = Math.min(availableOuter - paddingX, 900);
    const aspect = 520 / 900;
    const cssHeight = cssWidth * aspect;

    c.style.width = cssWidth + 'px';
    c.style.height = cssHeight + 'px';

    const w = Math.floor(cssWidth * dpr);
    const h = Math.floor(cssHeight * dpr);

    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }

    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Population init/reset

  function initPeople() {
    applyDaysInfToGamma();
    syncSliders();

    const N = clamp(+els.N.value || 5000, 2, 10000);
    const I0 = clamp(+els.I0.value || 5, 0, N);
    const R0init = clamp(+els.R0.value || 0, 0, N - I0);

    const cols = Math.ceil(Math.sqrt(N) * 1.3);
    const rows = Math.ceil(N / cols);

    State.cols = cols;
    State.rows = rows;

    State.people = new Array(N).fill(0).map((_, i) => ({
      col: i % cols,
      row: Math.floor(i / cols),
      state: STATE.S,
      v: 0,
      vEff: 0,
      everInf: 0,
    }));

    const idxs = shuffle([...Array(N).keys()]);

    for (let i = 0; i < R0init && i < idxs.length; i++) {
      State.people[idxs[i]].state = STATE.R;
    }

    let used = R0init;
    let assignedI = 0;
    while (assignedI < I0 && used < idxs.length) {
      const p = State.people[idxs[used]];
      if (p.state === STATE.S) {
        p.state = STATE.I;
        assignedI++;
      }
      used++;
    }

    State.N = N;
    State.I0 = I0;
    State.R0init = R0init;
    State.t = 0;

    State.series = {
      t: [],
      S: [],
      E: [],
      I: [],
      R: [],
      D: [],
      inc: [],
      prev: [],
      cumInc: [],
      vAllPct: [],
      vEffPct: [],
      everInf: [],
    };
    State.snapshots = [];
    State.viewIndex = null;
    State.stableCounter = 0;
    State.everInfectedCount = 0;

    assignVaccinationInitial();
    syncVaxCovSliderToState();

    resetToggleToStopped();
    els.timeDisp.textContent = '0';
    els.viewLabel.textContent = 'Live';
    refreshScrubber();
    resizeSimCanvas();
    drawCanvas();
    updateSidebarCounts();
    drawCharts();
    updateRDisplaysLive();
    updateMetrics();
  }

  function assignVaccinationInitial() {
    const cov = (+els.vaxCov.value || 0) / 100;
    const ve = (+els.ve.value || 0) / 100;
    const N = State.people.length;
    const k = Math.round(N * cov);

    State.people.forEach((p) => {
      p.v = 0;
      p.vEff = 0;
    });

    const idxs = shuffle([...State.people.keys()]);
    for (let i = 0; i < k && i < idxs.length; i++) {
      const p = State.people[idxs[i]];
      p.v = 1;
      p.vEff = Math.random() < ve ? 1 : 0;
    }
  }

  // Used when scrubbing and then changing parameters

  function branchFromCurrent({ reassignVaccination }) {
    const len = State.series.t.length;
    const haveHistory = len > 0 && State.snapshots.length >= len;

    if (!haveHistory) {
      if (reassignVaccination) {
        assignVaccinationInitial();
        syncVaxCovSliderToState();
        drawCanvas();
        updateSidebarCounts();
        drawCharts();
        updateRDisplaysLive();
        updateMetrics();
      }
      return;
    }

    const idx =
      State.viewIndex != null ? clamp(State.viewIndex, 0, len - 1) : len - 1;

    const snap = State.snapshots[idx];
    if (!snap) return;

    State.people.forEach((p, i) => {
      const s = snap[i];
      if (!s) return;
      p.state = s.state;
      p.v = s.v;
      p.vEff = s.vEff;
      p.everInf = s.everInf || 0;
    });

    if (reassignVaccination) {
      const cov = (+els.vaxCov.value || 0) / 100;
      const ve = (+els.ve.value || 0) / 100;
      const N = State.people.length;
      const k = Math.round(N * cov);

      State.people.forEach((p) => {
        p.v = 0;
        p.vEff = 0;
      });
      const idxs2 = shuffle([...State.people.keys()]);
      for (let j = 0; j < k && j < idxs2.length; j++) {
        const p = State.people[idxs2[j]];
        p.v = 1;
        p.vEff = Math.random() < ve ? 1 : 0;
      }
    }

    Object.keys(State.series).forEach((key) => {
      State.series[key] = State.series[key].slice(0, idx + 1);
    });
    State.snapshots = State.snapshots.slice(0, idx + 1);

    State.t = State.series.t[idx] || 0;
    State.viewIndex = null;
    State.stableCounter = 0;
    State.everInfectedCount =
      State.series.everInf && State.series.everInf[idx] != null
        ? State.series.everInf[idx]
        : 0;

    syncVaxCovSliderToState();
    els.viewLabel.textContent = `t=${State.t.toFixed(0)} days`;
    refreshScrubber();
    drawCanvas();
    updateSidebarCounts();
    drawCharts();
    updateRDisplaysLive();
    updateMetrics();
  }

  // Neighborhoods: 4-neighbor or hex-like 6-neighbor

  function infectiousNeighborCount(p, infSet, contact) {
    const col = p.col;
    const row = p.row;

    if (contact === '4') {
      const coords = [
        [col + 1, row],
        [col - 1, row],
        [col, row + 1],
        [col, row - 1],
      ];
      let k = 0;
      for (const [c, r] of coords) {
        if (infSet.has(c + ',' + r)) k++;
      }
      return k;
    }

    const isOdd = row % 2 === 1;
    let coords;
    if (!isOdd) {
      coords = [
        [col - 1, row],
        [col + 1, row],
        [col, row - 1],
        [col - 1, row - 1],
        [col, row + 1],
        [col - 1, row + 1],
      ];
    } else {
      coords = [
        [col - 1, row],
        [col + 1, row],
        [col + 1, row - 1],
        [col, row - 1],
        [col + 1, row + 1],
        [col, row + 1],
      ];
    }
    let k = 0;
    for (const [c, r] of coords) {
      if (infSet.has(c + ',' + r)) k++;
    }
    return k;
  }

  // Single integration step (S/E/I/R/D + vaccination + waning)

  function step() {
    const beta = +els.beta.value;
    const gamma = +els.gamma.value;
    const mu = +els.mu.value;
    const dt = +els.dt.value;
    const N = State.people.length;
    const contact = els.contacts.value || '4';

    const vaxRate = els.vaxRate ? +els.vaxRate.value || 0 : 0;
    const mutRate = els.mutRate ? +els.mutRate.value || 0 : 0;
    const veFrac = (+els.ve.value || 0) / 100;

    if (!N) return;

    const curStates = State.people.map((p) => p.state);
    const infSet = new Set();
    State.people.forEach((p, i) => {
      if (curStates[i] === STATE.I) {
        infSet.add(p.col + ',' + p.row);
      }
    });

    const newStates = curStates.slice();
    let newI = 0;
    let newIncidents = 0;

    for (let i = 0; i < N; i++) {
      const p = State.people[i];
      const s = curStates[i];

      if (s === STATE.S) {
        if (p.v && p.vEff) continue;
        const kInf = infectiousNeighborCount(p, infSet, contact);
        if (kInf > 0) {
          const prob = 1 - Math.exp(-beta * kInf * dt);
          if (els.stoch.value === '1') {
            if (Math.random() < prob) {
              newStates[i] = STATE.E;
              if (p.everInf === 0) {
                p.everInf = 1;
                newIncidents++;
              }
            }
          } else {
            if (prob > 0.01) {
              newStates[i] = STATE.E;
              if (p.everInf === 0) {
                p.everInf = 1;
                newIncidents++;
              }
            }
          }
        }
      } else if (s === STATE.E) {
        if (Math.random() < 0.5 * dt) {
          newStates[i] = STATE.I;
          newI++;
        }
      } else if (s === STATE.I) {
        const pr = 1 - Math.exp(-gamma * dt);
        const pm = 1 - Math.exp(-mu * dt);
        const u = Math.random();
        if (u < pm) {
          newStates[i] = STATE.D;
        } else if (u < pm + pr) {
          newStates[i] = STATE.R;
        }
      }
    }

    State.everInfectedCount += newIncidents;

    if (mutRate > 0) {
      const pMut = 1 - Math.exp(-mutRate * dt);
      for (let i = 0; i < N; i++) {
        const st = newStates[i];
        const person = State.people[i];
        const isImmune = st === STATE.R;
        const isEffVax = person.v && person.vEff;
        if (isImmune || isEffVax) {
          if (Math.random() < pMut) {
            newStates[i] = STATE.S;
            person.v = 0;
            person.vEff = 0;
          }
        }
      }
    }

    for (let i = 0; i < N; i++) {
      State.people[i].state = newStates[i];
    }

    if (vaxRate > 0) {
      const stepPoints = vaxRate * dt;
      let targetNew = Math.round((stepPoints / 100) * N);
      if (targetNew > 0) {
        const candidates = [];
        for (let i = 0; i < N; i++) {
          const p = State.people[i];
          if (p.state !== STATE.D && !p.v) {
            candidates.push(i);
          }
        }
        if (targetNew > candidates.length) targetNew = candidates.length;

        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        for (let k = 0; k < targetNew; k++) {
          const idx = candidates[k];
          const p = State.people[idx];
          p.v = 1;
          p.vEff = Math.random() < veFrac ? 1 : 0;
        }
      }
    }

    let S = 0,
      E = 0,
      I = 0,
      R = 0,
      D = 0;
    let vAll = 0,
      vEff = 0;
    for (const p of State.people) {
      if (p.state === STATE.S) S++;
      else if (p.state === STATE.E) E++;
      else if (p.state === STATE.I) I++;
      else if (p.state === STATE.R) R++;
      else if (p.state === STATE.D) D++;

      if (p.v) {
        vAll++;
        if (p.vEff) vEff++;
      }
    }

    const prevT = State.series.t.at(-1) || 0;
    const tNext = prevT + dt;

    const vAllPct = (100 * vAll) / Math.max(1, N);
    const vEffPct = (100 * vEff) / Math.max(1, N);

    const atRisk0 = Math.max(1, State.N - State.I0 - State.R0init);
    const cumInc =
      atRisk0 > 0 ? State.everInfectedCount / atRisk0 : 0;

    State.series.t.push(tNext);
    State.series.S.push(S);
    State.series.E.push(E);
    State.series.I.push(I);
    State.series.R.push(R);
    State.series.D.push(D);
    State.series.inc.push(Math.max(0, newI));
    State.series.prev.push(I / Math.max(1, N));
    State.series.cumInc.push(cumInc);
    State.series.vAllPct.push(vAllPct);
    State.series.vEffPct.push(vEffPct);
    State.series.everInf.push(State.everInfectedCount);

    State.snapshots.push(
      State.people.map((p) => ({
        state: p.state,
        v: p.v,
        vEff: p.vEff,
        everInf: p.everInf,
      }))
    );

    syncVaxCovSliderToState();
    updateHeaderStats(tNext);
    refreshScrubber();
    drawCanvas();
    updateSidebarCounts();
    drawCharts();
    updateMetrics();

    const stableNow = I === 0 && E === 0;
    State.stableCounter = stableNow ? State.stableCounter + 1 : 0;

    if (els.autoStop.value === '1' && State.stableCounter >= 10) {
      State.running = false;
      resetToggleToStopped();
      const timerEl = $('#simTimer');
      if (timerEl) {
        timerEl.textContent = `t=${tNext.toFixed(0)} days · paused (stable)`;
      }
    }
  }

  function updateHeaderStats(t) {
    els.timeDisp.textContent = t.toFixed(0);
    const timerEl = $('#simTimer');
    if (timerEl) {
      timerEl.textContent = `t=${t.toFixed(0)} days`;
    }
    updateRDisplaysLive();
    updateMetrics();
  }

  // Grid rendering

  function getColor(state) {
    if (state === STATE.S) return cssVar('--c-sus');
    if (state === STATE.E) return cssVar('--c-exp');
    if (state === STATE.I) return cssVar('--c-inf');
    if (state === STATE.R) return cssVar('--c-imm');
    return cssVar('--c-dead');
  }

  function drawCanvas() {
    const c = els.simCanvas;
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const W = c.clientWidth || c.width / dpr;
    const H = c.clientHeight || c.height / dpr;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = cssVar('--canvas-bg') || '#0e1320';
    ctx.fillRect(0, 0, W, H);

    const N = State.people.length;
    if (!N) return;

    const cols = State.cols || Math.ceil(Math.sqrt(N));
    const rows = State.rows || Math.ceil(N / cols);
    const contact = els.contacts.value || '4';

    const idx = State.viewIndex;
    const snapshot = idx != null && State.snapshots[idx]
      ? State.snapshots[idx]
      : null;

    if (contact === '4') {
      const cell = Math.min(W / cols, H / rows);
      const offsetX = (W - cols * cell) / 2;
      const offsetY = (H - rows * cell) / 2;
      const useDenseStyle = cell < 3.5;

      State.people.forEach((p, i) => {
        const sObj = snapshot ? snapshot[i] : p;
        const state = sObj.state;
        const v = sObj.v;
        const vEff = sObj.vEff;

        const x = offsetX + (p.col + 0.5) * cell;
        const y = offsetY + (p.row + 0.5) * cell;
        const r = Math.max(1.5, cell * 0.3);

        ctx.fillStyle = getColor(state);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        if (!v) return;

        if (useDenseStyle) {
          const dotR = Math.max(0.8, r * 0.45);
          ctx.fillStyle = cssVar('--vax-eff');
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = cssVar('--vax-eff');
          ctx.lineWidth = 1;
          if (vEff) {
            ctx.setLineDash([]);
          } else {
            ctx.setLineDash([3, 3]);
          }
          ctx.beginPath();
          ctx.arc(x, y, r + 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    } else {
      const colsHex = cols;
      const rowsHex = rows;
      const baseWUnits = 2 + 1.5 * (colsHex - 1) + 0.75;
      const baseHUnits = 2 + (rowsHex - 1) * Math.sqrt(3);
      const r = Math.max(2, Math.min(W / baseWUnits, H / baseHUnits));
      const w = 1.5 * r;
      const h = Math.sqrt(3) * r;

      const totalW = 2 * r + (colsHex - 1) * w + 0.5 * w;
      const totalH = 2 * r + (rowsHex - 1) * h;
      const offsetX = (W - totalW) / 2;
      const offsetY = (H - totalH) / 2;

      const useDenseStyle = r * 0.5 < 3 || N > 6000;

      State.people.forEach((p, i) => {
        const sObj = snapshot ? snapshot[i] : p;
        const state = sObj.state;
        const v = sObj.v;
        const vEff = sObj.vEff;

        const row = p.row;
        const col = p.col;

        const x = offsetX + r + col * w + (row % 2 ? w / 2 : 0);
        const y = offsetY + r + row * h;
        const rr = r * 0.5;

        ctx.fillStyle = getColor(state);
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();

        if (!v) return;

        if (useDenseStyle) {
          const dotR = Math.max(0.8, rr * 0.6);
          ctx.fillStyle = cssVar('--vax-eff');
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = cssVar('--vax-eff');
          ctx.lineWidth = 1;
          if (vEff) {
            ctx.setLineDash([]);
          } else {
            ctx.setLineDash([3, 3]);
          }
          ctx.beginPath();
          ctx.arc(x, y, rr + 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    }
  }

  // Scrubber

  function refreshScrubber() {
    const len = State.series.t.length;
    const maxIndex = Math.max(0, len - 1);
    els.scrubber.max = String(maxIndex);

    if (State.viewIndex == null) {
      els.scrubber.value = String(maxIndex);
    }

    const lastT = len ? State.series.t[maxIndex] || 0 : 0;
    if (els.scrubMin) els.scrubMin.textContent = '0';
    if (els.scrubMax) els.scrubMax.textContent = lastT.toFixed(0);

    const currentIdx =
      State.viewIndex != null ? State.viewIndex : maxIndex;
    const currentT =
      len && currentIdx >= 0 ? State.series.t[currentIdx] || 0 : 0;
    if (els.scrubVal) els.scrubVal.textContent = currentT.toFixed(0);
  }

  // Clone URL for sharing current config

  function buildCloneURL() {
    const base = new URL(window.location.href);
    let url;

    if (base.protocol === 'file:') {
      url = new URL(base.href);
      url.search = '';
      url.hash = '';
    } else {
      url = new URL(base.pathname, base.origin);
      url.search = '';
      url.hash = '';
    }

    const p = url.searchParams;

    if (els.scenario) p.set('scenario', els.scenario.value);
    if (els.N) p.set('N', els.N.value);
    if (els.I0) p.set('I0', els.I0.value);
    if (els.R0) p.set('R0', els.R0.value);
    if (els.dt) p.set('dt', els.dt.value);
    if (els.seed) p.set('seed', els.seed.value);
    if (els.stoch) p.set('stochastic', els.stoch.value);
    if (els.autoStop) p.set('autoStop', els.autoStop.value);
    if (els.contacts) p.set('contacts', els.contacts.value);

    if (els.beta) p.set('beta', els.beta.value);
    if (els.gamma) p.set('gamma', els.gamma.value);
    if (els.mu) p.set('mu', els.mu.value);
    if (els.ve) p.set('ve', els.ve.value);
    if (els.vaxCov) p.set('vaxCov', els.vaxCov.value);
    if (els.vaxRate) p.set('vaxRate', els.vaxRate.value);
    if (els.mutRate) p.set('mutRate', els.mutRate.value);
    if (els.daysInf) p.set('daysInf', els.daysInf.value);

    return url.toString();
  }

  if (els.cloneBtn) {
    els.cloneBtn.addEventListener('click', () => {
      const cloneURL = buildCloneURL();

      const features = [
        'width=1200',
        'height=800',
        'resizable=yes',
        'scrollbars=yes',
      ].join(',');

      let newWin = null;
      try {
        newWin = window.open(cloneURL, '_blank', features);
      } catch (e) {
        newWin = null;
      }

      if (!newWin) {
        window.location.href = cloneURL;
      }
    });
  }

  function loadParamsFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (!params.toString()) return;

    const setIf = (key, el) => {
      if (params.has(key) && el) el.value = params.get(key);
    };

    if (params.has('scenario') && els.scenario) {
      els.scenario.value = params.get('scenario');
    }

    setIf('N', els.N);
    setIf('I0', els.I0);
    setIf('R0', els.R0);
    setIf('dt', els.dt);
    setIf('seed', els.seed);
    setIf('stochastic', els.stoch);
    setIf('autoStop', els.autoStop);
    setIf('contacts', els.contacts);

    setIf('beta', els.beta);
    setIf('gamma', els.gamma);
    setIf('mu', els.mu);
    setIf('ve', els.ve);
    setIf('vaxCov', els.vaxCov);
    setIf('vaxRate', els.vaxRate);
    setIf('mutRate', els.mutRate);
    setIf('daysInf', els.daysInf);
  }

  // Charts

  function drawCharts() {
    drawIncVaxChart();
    drawSIRChart();
  }

  function drawIncVaxChart() {
    const c = els.incVaxChart;
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const W = c.clientWidth || c.width / dpr;
    const H = c.clientHeight || c.height / dpr;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = cssVar('--canvas-bg') || '#0e1320';
    ctx.fillRect(0, 0, W, H);

    const s = State.series;
    const len = s.t.length;
    const upto =
      State.viewIndex != null
        ? Math.min(State.viewIndex, len - 1)
        : len - 1;

    const padL = 52;
    const padR = 42;
    const padT = 16;
    const padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.fillStyle = cssVar('--muted');
    ctx.font = `${cssVar('--fz-2xs')} ${cssVar('--font-sans')}`;
    ctx.textAlign = 'center';
    ctx.fillText('Time (days)', padL + plotW / 2, H - 10);

    ctx.save();
    ctx.translate(14, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Count (incidence & prevalence)', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(W - 10, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('% Vaccinated', 0, 0);
    ctx.restore();

    if (len === 0 || upto < 0 || plotW <= 0 || plotH <= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, H - padB);
      ctx.lineTo(W - padR, H - padB);
      ctx.stroke();
      return;
    }

    const maxT = s.t[upto] || 1;
    const maxInc = Math.max(0, ...s.inc.slice(0, upto + 1));
    const maxPrev = Math.max(0, ...s.I.slice(0, upto + 1));
    const maxLeft = Math.max(1, maxInc, maxPrev);

    const xForIndex = (i) => padL + (s.t[i] / maxT) * plotW;
    const yForLeft = (v) => (H - padB) - (v / maxLeft) * plotH;
    const yForPct = (pct) => (H - padB) - (pct / 100) * plotH;

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.fillStyle = cssVar('--muted');
    ctx.font = `${cssVar('--fz-2xs')} ${cssVar('--font-sans')}`;

    const xTicks = 5;
    ctx.textAlign = 'center';
    for (let i = 0; i <= xTicks; i++) {
      const frac = i / xTicks;
      const tVal = frac * maxT;
      const x = padL + frac * plotW;

      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
      ctx.stroke();

      ctx.fillText(tVal.toFixed(0), x, H - 12);
    }

    const yTicks = 4;
    ctx.textAlign = 'right';
    for (let i = 0; i <= yTicks; i++) {
      const frac = i / yTicks;
      const v = maxLeft * (1 - frac);
      const y = padT + frac * plotH;

      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();

      ctx.fillText(v.toFixed(0), padL - 4, y + 3);
    }

    ctx.textAlign = 'left';
    for (let i = 0; i <= yTicks; i++) {
      const frac = i / yTicks;
      const pct = 100 * (1 - frac);
      const y = padT + frac * plotH;
      ctx.fillText(pct.toFixed(0), W - padR + 4, y + 3);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, H - padB);
    ctx.lineTo(W - padR, H - padB);
    ctx.stroke();

    ctx.strokeStyle = cssVar('--c-exp');
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= upto; i++) {
      const x = xForIndex(i);
      const y = yForLeft(s.inc[i] || 0);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = cssVar('--accent2');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= upto; i++) {
      const x = xForIndex(i);
      const y = yForLeft(s.I[i] || 0);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (s.vAllPct && s.vAllPct.length) {
      ctx.strokeStyle = cssVar('--accent');
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= upto; i++) {
        const x = xForIndex(i);
        const y = yForPct(s.vAllPct[i] || 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawSIRChart() {
    const c = els.sirChart;
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const W = c.clientWidth || c.width / dpr;
    const H = c.clientHeight || c.height / dpr;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = cssVar('--canvas-bg') || '#0e1320';
    ctx.fillRect(0, 0, W, H);

    const s = State.series;
    const len = s.t.length;
    const upto =
      State.viewIndex != null
        ? Math.min(State.viewIndex, len - 1)
        : len - 1;

    const padL = 42;
    const padR = 10;
    const padT = 16;
    const padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.fillStyle = cssVar('--muted');
    ctx.font = `${cssVar('--fz-2xs')} ${cssVar('--font-sans')}`;
    ctx.textAlign = 'center';
    ctx.fillText('Time (days)', padL + plotW / 2, H - 10);

    ctx.save();
    ctx.translate(10, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Individuals', 0, 0);
    ctx.restore();

    if (len === 0 || upto < 0 || plotW <= 0 || plotH <= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, H - padB);
      ctx.lineTo(W - padR, H - padB);
      ctx.stroke();
      return;
    }

    const maxT = s.t[upto] || 1;
    const N = State.N || 1;

    const xForIndex = (i) => padL + (s.t[i] / maxT) * plotW;
    const yForVal = (v) =>
      (H - padB) - (v / Math.max(1, N)) * plotH;

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.fillStyle = cssVar('--muted');
    ctx.font = `${cssVar('--fz-2xs')} ${cssVar('--font-sans')}`;

    const xTicks = 5;
    ctx.textAlign = 'center';
    for (let i = 0; i <= xTicks; i++) {
      const frac = i / xTicks;
      const tVal = frac * maxT;
      const x = padL + frac * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
      ctx.stroke();
      ctx.fillText(tVal.toFixed(0), x, H - 12);
    }

    const yTicks = 4;
    ctx.textAlign = 'right';
    for (let i = 0; i <= yTicks; i++) {
      const frac = i / yTicks;
      const v = N * (1 - frac);
      const y = padT + frac * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(0), padL - 4, y + 3);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, H - padB);
    ctx.lineTo(W - padR, H - padB);
    ctx.stroke();

    const plotLine = (arr, colorVar) => {
      if (!arr || !arr.length) return;
      ctx.strokeStyle = cssVar(colorVar);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= upto; i++) {
        const x = xForIndex(i);
        const y = yForVal(arr[i] || 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    plotLine(s.S, '--c-sus');
    plotLine(s.E, '--c-exp');
    plotLine(s.I, '--c-inf');
    plotLine(s.R, '--c-imm');
    plotLine(s.D, '--c-dead');
  }

  // UI bindings

  els.scenario.addEventListener('change', (e) =>
    applyScenario(e.target.value)
  );

  function applyScenario(name) {
    const presets = {
      rare: {
        N: 5000,
        I0: 1,
        beta: 0.12,
        gamma: 0.2,
        mu: 0.005,
      },
      endemic: {
        N: 5000,
        I0: 10,
        beta: 0.18,
        gamma: 0.18,
        mu: 0.002,
      },
      outbreak: {
        N: 5000,
        I0: 5,
        beta: 0.55,
        gamma: 0.1,
        mu: 0.01,
      },
      flu: {
        N: 5000,
        I0: 3,
        beta: 0.32,
        gamma: 0.14,
        mu: 0.004,
      },
      covid: {
        N: 5000,
        I0: 5,
        beta: 0.45,
        gamma: 0.08,
        mu: 0.006,
      },
      measles: {
        N: 5000,
        I0: 3,
        beta: 1.1,
        gamma: 0.14,
        mu: 0.0005,
        vaxCov: 70,
        ve: 97,
      },
      ebola: {
        N: 5000,
        I0: 2,
        beta: 0.25,
        gamma: 0.14,
        mu: 0.12,
        vaxCov: 0,
        ve: 0,
      },
      sars1: {
        N: 5000,
        I0: 3,
        beta: 0.3,
        gamma: 0.14,
        mu: 0.02,
      },
      mers: {
        N: 5000,
        I0: 3,
        beta: 0.14,
        gamma: 0.14,
        mu: 0.08,
      },
      noro: {
        N: 5000,
        I0: 5,
        beta: 0.7,
        gamma: 0.4,
        mu: 0.0001,
      },
    };

    const p = presets[name];
    if (p) {
      if (p.N != null) els.N.value = p.N;
      if (p.I0 != null) els.I0.value = p.I0;
      if (p.beta != null) els.beta.value = p.beta;
      if (p.gamma != null) els.gamma.value = p.gamma;
      if (p.mu != null) els.mu.value = p.mu;

      if (p.gamma != null && els.daysInf) {
        const days = p.gamma > 0 ? 1 / p.gamma : 10;
        els.daysInf.value = days.toFixed(1);
      }

      if (p.vaxCov != null && els.vaxCov) {
        els.vaxCov.value = p.vaxCov;
      }
      if (p.ve != null && els.ve) {
        els.ve.value = p.ve;
      }
    }

    syncSliders();
    initPeople();
  }

  [
    els.N,
    els.I0,
    els.R0,
    els.dt,
    els.stoch,
    els.seed,
    els.autoStop,
    els.contacts,
    els.daysInf,
  ].forEach((input) => {
    if (!input) return;
    input.addEventListener('change', () => {
      if (input === els.seed) {
        setSeed(+els.seed.value || 42);
      }
      initPeople();
    });
  });

  if (els.N) {
    els.N.addEventListener('input', () => {
      if (els.NVal) {
        els.NVal.textContent = els.N.value;
      }
      initPeople();
    });
  }

  ['beta', 'gamma', 'mu'].forEach((id) => {
    const el = els[id];
    if (!el) return;
    el.addEventListener('input', () => {
      if (id === 'gamma') {
        syncDaysInfFromGamma();
      }
      syncSliders();
      branchFromCurrent({ reassignVaccination: false });
    });
  });

  ['ve', 'vaxCov'].forEach((id) => {
    const el = els[id];
    if (!el) return;
    el.addEventListener('input', () => {
      syncSliders();
      branchFromCurrent({ reassignVaccination: true });
    });
  });

  ['vaxRate', 'mutRate'].forEach((id) => {
    const el = els[id];
    if (!el) return;
    el.addEventListener('input', () => {
      syncSliders();
      branchFromCurrent({ reassignVaccination: false });
    });
  });

  els.toggle.addEventListener('click', () => {
    if (State.running) {
      resetToggleToStopped();
    } else {
      if (State.viewIndex != null) {
        branchFromCurrent({ reassignVaccination: false });
      }
      setToggleRunning();
      loop();
    }
  });

  els.reset.addEventListener('click', () => {
    setSeed(+els.seed.value || 42);
    els.vaxCov.value = 0;
    syncSliders();
    initPeople();
  });

  els.scrubber.addEventListener('input', () => {
    const vIndex = parseInt(els.scrubber.value, 10) || 0;
    State.viewIndex = vIndex;
    const tVal = State.series.t[vIndex] ?? 0;

    els.viewLabel.textContent = State.series.t.length
      ? `t=${(tVal || 0).toFixed(0)} days`
      : 'Live';

    if (els.scrubVal) els.scrubVal.textContent = (tVal || 0).toFixed(0);

    if (State.series.t.length && els.scrubMax) {
      const last = State.series.t[State.series.t.length - 1] || 0;
      els.scrubMax.textContent = last.toFixed(0);
    }

    drawCanvas();
    updateSidebarCounts();
    drawCharts();
    updateRDisplaysLive();
    updateMetrics();
  });

  // CSV export

  els.exportCSV.addEventListener('click', () => {
    const rows = [['t', 'S', 'E', 'I', 'R', 'D', 'everInf']];
    const s = State.series;
    for (let i = 0; i < s.t.length; i++) {
      rows.push([
        s.t[i],
        s.S[i],
        s.E[i],
        s.I[i],
        s.R[i],
        s.D[i],
        s.everInf && s.everInf[i] != null ? s.everInf[i] : '',
      ]);
    }
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'simulation_timeseries.csv';
    a.click();
  });

  // Animation loop

  function loop() {
    if (!State.running) return;
    step();
    requestAnimationFrame(loop);
  }

  // Resize handling

  window.addEventListener('resize', () => {
    resizeSimCanvas();
    updateChartLayouts();
    drawCanvas();
    drawCharts();
    updateSidebarCounts();
    updateRDisplaysLive();
    updateMetrics();
  });

  // Boot

  syncSliders();
  setSeed(+els.seed.value || 42);
  loadParamsFromURL();
  initPeople();
  updateChartLayouts();
  drawCharts();
})();
