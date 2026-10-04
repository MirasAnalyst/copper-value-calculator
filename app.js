/* Copper Value Calculator — page logic. Reads CopperEngine, renders verdict, controls, tabs and charts. */
(function () {
  'use strict';
  const E = window.CopperEngine;
  const $ = (id) => document.getElementById(id);

  const REFS = [
    ['Vardner et al., V(II) sulfate reductive leaching of chalcopyrite, ChemElectroChem (2022)', 'https://chemistry-europe.onlinelibrary.wiley.com/doi/full/10.1002/celc.202200920'],
    ['V(II) reductive upgrading of chalcopyrite, Hydrometallurgy (2025)', 'https://www.sciencedirect.com/science/article/abs/pii/S0304386X2500074X'],
    ['Leaching mechanism study, ACS Sustainable Chem. Eng. (2024)', 'https://pubs.acs.org/doi/10.1021/acssuschemeng.4c03630'],
    ['TechCrunch, 30 Jul 2025: electrochemical copper refining startup', 'https://techcrunch.com/2025/07/30/how-a-new-jersey-startup-found-an-electrifying-way-to-slash-copper-costs/'],
    ['Canary Media: startups refining copper more cleanly', 'https://www.canarymedia.com/articles/clean-industry/copper-is-in-high-demand-these-startups-aim-to-refine-it-in-a-cleaner-way'],
    ['Axios, 14 Aug 2026: American copper processing technology', 'https://www.axios.com/2026/08/14/american-tech-copper-processing'],
    ['Crux Investor: 2026 TC/RC benchmark and negative spot terms', 'https://www.cruxinvestor.com/posts/chinese-smelters-pay-miners-for-copper-concentrate-as-mine-supply-becomes-the-key-constraint'],
    ['USGS Mineral Commodity Summaries 2026: Copper', 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-copper.pdf'],
    ['Mining.com: $1.5B, 300 kt/yr Aktogay smelter', 'https://www.mining.com/kaz-minerals-signs-agreement-for-1-5bn-copper-smelter-project/'],
    ['Times of Central Asia: Balkhash smelter, 300 kt/yr', 'https://timesca.com/kazakhstan-targets-50-increase-in-refined-copper-output-with-balkhash-smelter/'],
    ['Skillings mining wrap, 24 Jul 2026: Cu > $14k/t, Au ≈ $4,155/oz', 'https://skillings.net/daily-mining-market-wrap-july-24-2026-copper-holds-above-14k-gold-steady-at-4155'],
    ['Ember / IEA grid carbon intensity by country (2024, approximate)', 'https://ember-energy.org/data/'],
    ['International Copper Association, copper cathode LCA (smelting share approximate)', null],
    ['Schlesinger et al., Extractive Metallurgy of Copper, 6th ed.', null],
    ['Peters, Timmerhaus & West, Plant Design and Economics for Chemical Engineers', null],
  ];

  // ---------- main controls ----------
  const SLIDERS = [
    { k: 'cu_price', label: 'Copper price', min: 8000, max: 20000, step: 100, out: (s) => '$' + fmt(s.cu_price) + '/t', hint: 'LME, late Jul 2026 ≈ $13,800', marks: [[13800, 'Jul 2026']] },
    { k: 'tc', label: 'Smelter charges (TC/RC)', min: -150, max: 250, step: 5, out: (s) => '$' + fmt(s.tc) + '/dmt · ' + fmt(s.rc, 1) + '¢/lb', hint: 'RC follows TC at 1/10 (¢/lb per $/dmt)', marks: [[0, '2026'], [80, 'long-run']], set: (v) => ({ tc: v, rc: v / 10 }) },
    { k: 'freight_wmt', label: 'Concentrate freight', min: 20, max: 250, step: 5, out: (s) => '$' + fmt(s.freight_wmt) + '/wmt', hint: 'Mine to smelter, rail + sea' },
    { k: 'scale', label: 'Plant size', min: 2, max: 100, step: 1, out: () => fmt(R.process.cath_t / 1000, 1) + ' kt Cu/yr', hint: 'Commercial target ≈ 10 kt/yr',
      get: (s) => Math.round(s.conc_tpy * s.cu_pct / 100 * s.recovery_pct / 100 / 1000),
      set: (v, s) => ({ conc_tpy: Math.round(v * 1000 / (s.cu_pct / 100 * s.recovery_pct / 100)) }) },
    { k: 'power_src', label: 'Power source', select: true, out: (s) => fmt(E.POWER[s.power_src].ef, 2) + ' t CO₂/MWh', hint: 'Sets the carbon footprint' },
    { k: 'power_price', label: 'Power price', min: 20, max: 200, step: 5, out: (s) => '$' + fmt(s.power_price) + '/MWh', hint: 'Delivered industrial tariff' },
  ];
  const SLID_KEYS = ['cu_price', 'tc', 'rc', 'freight_wmt', 'conc_tpy', 'power_src', 'power_price'];

  // ---------- advanced inputs: [key, label, unit, step, src] ----------
  const ADV = [
    { title: 'Feed', f: [
      ['cu_pct', 'Cu grade', '%', 0.5, 'A'], ['cpy_pct', 'Cu as chalcopyrite', '%', 5, 'A'], ['fe_pct', 'Fe', '%', 0.5, 'A'],
      ['as_pct', 'Arsenic', '%', 0.05, 'A'], ['au_gpt', 'Gold', 'g/t', 0.1, 'A'], ['ag_gpt', 'Silver', 'g/t', 1, 'A'], ['moisture_pct', 'Moisture', '%', 0.5, 'A']] },
    { title: 'Process', f: [
      ['reduce_to', 'Reduce to', 'sel', null, 1], ['recovery_pct', 'Cu recovery', '%', 0.5, 1], ['avail_pct', 'Availability', '%', 1, 'A'],
      ['v_cell_V', 'V cell voltage', 'V', 0.05, 1], ['v_ce_pct', 'V cell efficiency', '%', 1, 'A'], ['v_j', 'V cell current density', 'A/m²', 50, 'A'],
      ['ew_V', 'EW voltage', 'V', 0.05, 14], ['ew_ce_pct', 'EW efficiency', '%', 1, 14], ['ew_j', 'EW current density', 'A/m²', 10, 14],
      ['aux_kwh_t', 'Auxiliary power', 'kWh/t', 50, 'A'], ['v_loss_kg_t', 'Vanadium loss', 'kg/t', 0.1, 'A'],
      ['leach_tau_min', 'Reductive leach time', 'min', 5, 1], ['ox_tau_h', 'Ferric leach time', 'h', 0.5, 'A'], ['solids_pct', 'Leach solids', '%', 1, 'A'],
      ['v_loop_h', 'V loop hold-up', 'h', 0.5, 'A'], ['v_util_pct', 'V²⁺ used per pass', '%', 5, 'A'], ['sru_rec_pct', 'Sulfur recovery', '%', 0.5, 'A'],
      ['au_rec_pct', 'Au recovery', '%', 1, 'A'], ['ag_rec_pct', 'Ag recovery', '%', 1, 'A']] },
    { title: 'Prices & costs', f: [
      ['au_price', 'Gold', '$/oz', 50, 11], ['ag_price', 'Silver', '$/oz', 1, 11], ['s_price', 'Sulfur', '$/t', 10, 'A'], ['cathode_premium', 'Cathode premium', '$/t', 10, 'A'],
      ['acid_price', 'Sulfuric acid', '$/t', 5, 'A'], ['lime_price', 'Lime', '$/t', 5, 'A'], ['v_price', 'Vanadium', '$/kg', 1, 'A'],
      ['sx_reag_t', 'SX reagents', '$/t Cu', 5, 'A'], ['residue_cost_t', 'Residue disposal', '$/t', 1, 'A'], ['labor_musd', 'Labour at 10 kt/yr', '$M/yr', 0.1, 'A'],
      ['maint_pct', 'Maintenance', '% capex', 0.5, 'A'], ['ga_pct', 'G&A, insurance', '% capex', 0.5, 'A'], ['cathode_freight_t', 'Cathode freight', '$/t', 5, 'A'],
      ['lang', 'Installation factor', '× PEC', 0.1, 15], ['capex_mult', 'CAPEX multiplier', '×', 0.05, 'A']] },
    { title: 'Smelter terms', f: [
      ['payable_pct', 'Cu payable', '%', 0.1, 'A'], ['min_deduct', 'Min. deduction', 'units', 0.1, 'A'], ['au_pay_pct', 'Au payable', '%', 1, 'A'], ['ag_pay_pct', 'Ag payable', '%', 1, 'A'],
      ['as_thresh', 'As penalty above', '%', 0.05, 'A'], ['as_pen', 'As penalty', '$/0.1%', 0.5, 'A'], ['export_duty_pct', 'Export duty', '%', 0.5, 'A']] },
    { title: 'Finance', f: [
      ['disc_pct', 'Discount rate', '%', 0.5, 'A'], ['life_yr', 'Plant life', 'yr', 1, 'A'], ['tax_pct', 'Tax', '%', 1, 'A'], ['build_yr', 'Construction', 'yr', 1, 'A'], ['dep_yr', 'Depreciation', 'yr', 1, 'A']] },
    { title: 'Carbon factors', f: [
      ['acid_ef', 'Acid', 't/t', 0.01, 'A'], ['lime_ef', 'Lime', 't/t', 0.05, 'A'], ['v_ef', 'Vanadium', 'kg/kg', 1, 'A'],
      ['ship_km', 'Shipping distance', 'km', 500, 'A'], ['ship_g_tkm', 'Shipping intensity', 'g/t·km', 1, 'A'], ['smelter_ef', 'Smelter route', 't/t Cu', 0.1, 13]] },
  ];
  const FIELD = {};
  ADV.forEach(g => g.f.forEach(([k, label, unit, step, src]) => { FIELD[k] = { k, label, unit, step, src, group: g.title }; }));

  // ---------- state ----------
  let state = { ...E.DEFAULTS };
  let caseKey = 'base';
  let caseA = null;
  let tab = 'flow';
  let R = null;
  let presenting = false;
  const fs = (n) => presenting ? Math.round(n * 13) / 10 : n;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };
  const ref = () => ({ ...E.DEFAULTS, ...E.CASES[caseKey].set });

  // ---------- formatting ----------
  const nf = {};
  const fmt = (v, d = 0) => (v === null || v === undefined || !isFinite(v)) ? '–' : (nf[d] ||= new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })).format(v);
  const money = (v, d = 1) => (v < 0 ? '−$' : '$') + fmt(Math.abs(v), d) + 'M';
  const signed = (v, d = 1) => (v > 0 ? '+$' : v < 0 ? '−$' : '$') + fmt(Math.abs(v), d) + 'M';
  const kt = (t) => t >= 10000 ? fmt(t / 1000, 1) + ' kt' : fmt(t, 0) + ' t';

  // ---------- build controls ----------
  function buildControls() {
    $('sliders').innerHTML = SLIDERS.map(s => s.select
      ? `<div class="ctl" id="c_${s.k}"><div class="top"><label for="s_${s.k}">${s.label}</label><output id="o_${s.k}"></output></div>
          <select id="s_${s.k}" class="select" name="${s.k}" autocomplete="off">${Object.entries(E.POWER).map(([k, o]) => `<option value="${k}">${o.label}</option>`).join('')}</select><div class="hint">${s.hint}</div></div>`
      : `<div class="ctl" id="c_${s.k}"><div class="top"><label for="s_${s.k}">${s.label}</label><output id="o_${s.k}"></output></div>
          <input type="range" id="s_${s.k}" name="${s.k}" autocomplete="off" min="${s.min}" max="${s.max}" step="${s.step}"><div class="marks" aria-hidden="true">${(s.marks || []).map(([v, l]) => `<span style="--p:${(v - s.min) / (s.max - s.min)}">${l}</span>`).join('')}</div><div class="hint">${s.hint}</div></div>`).join('');
    SLIDERS.forEach(s => {
      $('s_' + s.k).addEventListener('input', (e) => {
        const raw = s.select ? e.target.value : parseFloat(e.target.value);
        Object.assign(state, s.set ? s.set(raw, state) : { [s.k]: raw });
        changed();
      });
    });

    $('adv').innerHTML = ADV.map(g => `<div><h4>${g.title}</h4>${g.f.map(([k, label, unit, step, src]) => {
      const tag = src === 'A' ? '' : `<span class="tag">[${src}]</span>`;
      const ctl = unit === 'sel'
        ? `<select id="in_${k}" name="${k}" autocomplete="off" data-k="${k}"><option value="Cu2S">Cu₂S · 1 e⁻/Cu</option><option value="Cu">Cu metal · 2 e⁻/Cu</option></select>`
        : `<input id="in_${k}" name="${k}" autocomplete="off" data-k="${k}" type="number" step="${step}" inputmode="decimal"><span class="u">${unit}</span>`;
      return `<div class="f" id="f_${k}"><label for="in_${k}">${label}${tag}</label><span class="box">${ctl}</span></div>`;
    }).join('')}</div>`).join('');
    $('moreCnt').textContent = `(${Object.keys(FIELD).length})`;
    $('adv').addEventListener('input', (e) => {
      const k = e.target.dataset.k; if (!k) return;
      if (e.target.tagName === 'SELECT') state[k] = e.target.value;
      else { const v = parseFloat(e.target.value); if (!isFinite(v)) return; state[k] = v; }
      changed();
    });
  }
  function changed() {
    store.set('cvc_state2', { state, caseKey });
    update();
  }
  function writeControls() {
    SLIDERS.forEach(s => {
      const el = $('s_' + s.k);
      el.value = s.get ? s.get(state) : state[s.k];
      if (!s.select) el.style.setProperty('--pct', ((el.value - s.min) / (s.max - s.min) * 100) + '%');
    });
    Object.keys(FIELD).forEach(k => { const el = $('in_' + k); if (el && document.activeElement !== el) el.value = state[k]; });
  }
  function syncControls() {
    const r = ref();
    SLIDERS.forEach(s => {
      const el = $('s_' + s.k);
      if (document.activeElement !== el) el.value = s.get ? s.get(state) : state[s.k];
      if (!s.select) el.style.setProperty('--pct', ((el.value - s.min) / (s.max - s.min) * 100) + '%');
      $('o_' + s.k).textContent = s.out(state);
      const keys = s.k === 'scale' ? ['conc_tpy'] : [s.k];
      $('c_' + s.k).classList.toggle('changed', keys.some(k => String(state[k]) !== String(r[k])));
    });
    let n = 0;
    Object.keys(FIELD).forEach(k => { const ch = String(state[k]) !== String(r[k]); n += ch; $('f_' + k).classList.toggle('changed', ch); });
    $('moreCnt').textContent = `(${Object.keys(FIELD).length}${n ? ` · ${n} changed` : ''})`;
  }

  // ---------- update ----------
  function update() {
    R = E.run(state);
    syncControls();
    renderVerdict();
    renderCompare();
    renderTab();
  }

  function renderVerdict() {
    const f = R.finance, L = R.lca, be = f.breakEven;
    const w = $('verdictWord'), t = $('verdictText');
    const beShort = be ? `<b>$${fmt(be.tcEquiv)}/dmt</b>` : 'no charge in range';
    if (f.gain < 0) {
      w.innerHTML = 'Sell the <span class="em">concentrate.</span>';
      t.innerHTML = `Smelters pay <b>${money(-f.gain)} a year more</b> than the plant would earn. The plant wins once charges pass ${beShort}.`;
    } else if (f.npv < 0) {
      w.innerHTML = 'Close, but <span class="em">not yet.</span>';
      t.innerHTML = `The plant earns <b>${money(f.gain)} a year more</b>, but not enough to repay ${money(R.capex.total, 0)} of CAPEX. It pays above ${beShort}.`;
    } else {
      w.innerHTML = 'Build the <span class="em">plant.</span>';
      t.innerHTML = `It earns <b>${money(f.gain)} a year more</b> than selling concentrate and repays its CAPEX in ${f.payback === null ? 'over its life' : '<b>' + fmt(f.payback, 1) + ' years</b>'}.`;
    }
    renderMeter(f, be);
    const co2d = L.racerTotal - L.smelterTotal;
    $('stats').innerHTML = [
      ['Gain vs selling', `<span class="${f.gain >= 0 ? 'pos' : 'neg'}">${signed(f.gain)}</span><small>/yr</small>`, 'before capital'],
      [`NPV at ${fmt(state.disc_pct)}%`, `${money(f.npv, 0)}`, `IRR ${f.irr === null ? 'n/a' : fmt(f.irr * 100, 1) + '%'} · CAPEX ${money(R.capex.total, 0)}`],
      ['Break-even charge', `${be ? '$' + fmt(be.tcEquiv) : '–'}<small>/dmt</small>`, `today $${fmt(state.tc)}/dmt`],
      ['Carbon', `${fmt(L.racerTotal, 2)}<small>t CO₂e/t</small>`, `${co2d <= 0 ? fmt(-co2d / L.smelterTotal * 100) + '% below' : fmt(co2d / L.smelterTotal * 100) + '% above'} smelter route`],
    ].map(([k, v, d]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
  }

  // ---------- break-even meter ----------
  const M_MIN = -150, M_MAX = 600;
  const mpos = (v) => Math.min(100, Math.max(0, (v - M_MIN) / (M_MAX - M_MIN) * 100));
  function renderMeter(f, be) {
    let cut;
    if (be) cut = mpos(be.tcEquiv);
    else cut = f.npv >= 0 ? 0 : 100;
    $('zSell').style.width = cut + '%';
    $('zBuild').style.width = (100 - cut) + '%';
    const lx = (p) => p > 85 ? '-100%' : p < 12 ? '0%' : '-50%';
    $('mkBE').hidden = !be || be.tcEquiv > M_MAX || be.tcEquiv < M_MIN;
    if (be) { $('mkBE').style.transform = `translateX(${cut}%)`; $('mkBE').style.setProperty('--lx', lx(cut)); $('mkBEL').textContent = `break-even $${fmt(be.tcEquiv)}`; }
    $('mkToday').style.setProperty('--lx', lx(mpos(state.tc)));
    $('mkToday').style.transform = `translateX(${mpos(state.tc)}%)`;
    $('mkTodayL').textContent = `today $${fmt(state.tc)}`;
    if (!$('ticks').childElementCount) {
      $('ticks').innerHTML = [-150, 0, 150, 300, 450, 600].map(v => `<span class="${v === -150 ? 'first' : v === 600 ? 'last' : ''}" style="left:${mpos(v)}%">${v < 0 ? '−' + Math.abs(v) : v}</span>`).join('');
    }
  }

  // ---------- compare ----------
  const snap = (res, label) => ({ label, gain: res.finance.gain, npv: res.finance.npv, be: res.finance.breakEven ? res.finance.breakEven.tcEquiv : null, co2: res.lca.racerTotal, capex: res.capex.total });
  function renderCompare() {
    const box = $('compare');
    if (!caseA) { box.hidden = true; $('saveA').textContent = 'Pin as case A'; return; }
    box.hidden = false;
    $('saveA').textContent = 'Re-pin case A';
    const B = snap(R);
    const d = (a, b, f) => { const x = b - a; return Math.abs(x) < 1e-6 ? 'same' : (x > 0 ? '+' : '−') + f(Math.abs(x)); };
    const items = [
      ['Gain/yr', (s) => signed(s.gain), (x) => '$' + fmt(x, 1) + 'M', 'gain'],
      ['NPV', (s) => money(s.npv, 0), (x) => '$' + fmt(x, 0) + 'M', 'npv'],
      ['Break-even', (s) => s.be === null ? '–' : '$' + fmt(s.be) + '/dmt', (x) => '$' + fmt(x), 'be'],
      ['Carbon', (s) => fmt(s.co2, 2) + ' t', (x) => fmt(x, 2) + ' t', 'co2'],
    ];
    box.innerHTML = `<div class="it"><span class="k">Case A</span><span>${caseA.label}</span></div>` +
      items.map(([n, f, df, k]) => `<div class="it"><span class="k">${n}: A → now</span><span class="num">${f(caseA)} → ${f(B)} <span style="color:var(--muted)">(${caseA[k] === null || B[k] === null ? '–' : d(caseA[k], B[k], df)})</span></span></div>`).join('') +
      `<button class="ghost" id="clearA" type="button" style="margin-left:auto">Clear</button>`;
    $('clearA').onclick = () => { caseA = null; store.del('cvc_caseA2'); renderCompare(); };
  }

  // ---------- tabs ----------
  function renderTab() {
    if (!R) return;
    ({ flow: renderFlow, econ: renderEcon, co2: renderCo2, risk: renderRisk, method: renderMethod })[tab]();
  }
  function setTab(t, push) {
    tab = t;
    if (push) { try { history.replaceState(null, '', '#' + t); } catch (e) { /* sandboxed */ } }
    document.querySelectorAll('.tab').forEach(b => { const on = b.id === 't-' + t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== 'p-' + t; });
    renderTab();
  }

  function renderFlow() {
    const P = R.process, s = P.streams;
    $('fs_conc').textContent = `${kt(state.conc_tpy)}/yr`;
    $('fs_vcell').textContent = `${fmt(P.v.P / 1e6, 2)} MW`;
    $('fs_red').textContent = `${fmt(state.cpy_pct)}% of Cu · ambient`;
    $('fs_ox').textContent = `Fe³⁺ / O₂`;
    $('fs_ccd').textContent = `${fmt(s.solids_th, 1)} t/h solids`;
    $('fs_ew').textContent = `${fmt(P.ew.P / 1e6, 2)} MW`;
    $('fs_cath').textContent = `${kt(P.cath_t)}/yr`;
    $('fs_sru').textContent = `${kt(s.sProd_t)} S/yr`;
    $('fs_fe').textContent = `${kt(s.lime_t)} lime/yr`;
    $('fs_res').textContent = `${fmt(s.auRec_oz / 1000, 1)} koz Au/yr`;
    const minClose = Math.min(...P.bal.map(b => b.closure), ...P.eBal.map(e => e.closure));
    const maxClose = Math.max(...P.bal.map(b => b.closure), ...P.eBal.map(e => e.closure));
    $('procFigs').innerHTML = [
      [fmt(P.power.kWh_t), 'kWh/t', 'electricity per t copper'],
      [fmt(P.ePerCu.total, 2), 'e⁻/Cu', 'vs 2.00 for conventional SX-EW'],
      [fmt(P.power.MW, 1), 'MW', 'average plant load'],
      [fmt(Math.abs(100 - minClose) > Math.abs(100 - maxClose) ? minClose : maxClose, 1), '%', 'mass & charge balance closure'],
    ].map(([v, u, k]) => `<div class="fig"><div class="v">${v}<small>${u}</small></div><div class="k">${k}</div></div>`).join('');

    $('balTbl').innerHTML = `<thead><tr><th>Element</th><th class="n">In</th><th>Out</th><th class="n">Closure</th></tr></thead><tbody>` +
      P.bal.map(b => `<tr><td><b>${b.el}</b></td><td class="n">${mass(b.el, b.in)}</td><td style="color:var(--ink-2)">${Object.entries(b.outs).map(([n, v]) => `${n} ${mass(b.el, v)}`).join('<br>')}</td><td class="n"><span class="ok">${fmt(b.closure, 2)}%</span></td></tr>`).join('') +
      P.eBal.map(e => `<tr><td><b>e⁻</b></td><td class="n">${fmt(e.demand / 1e6, 1)} Mmol</td><td style="color:var(--ink-2)">${e.name}</td><td class="n"><span class="ok">${fmt(e.closure, 2)}%</span></td></tr>`).join('') + '</tbody>';
    $('elecTbl').innerHTML = `<thead><tr><th>Duty</th><th class="n">Current</th><th class="n">Power</th><th class="n">kWh/t</th></tr></thead><tbody>
      <tr><td>V²⁺ electrolyzer · ${fmt(P.v.A)} m²</td><td class="n">${fmt(P.v.I / 1e3)} kA</td><td class="n">${fmt(P.v.P / 1e6, 2)} MW</td><td class="n">${fmt(P.v.kWh_t)}</td></tr>
      <tr><td>Electrowinning · ${fmt(P.ew.cathodes)} cathodes, ${P.ew.cells} cells</td><td class="n">${fmt(P.ew.I / 1e3)} kA</td><td class="n">${fmt(P.ew.P / 1e6, 2)} MW</td><td class="n">${fmt(P.ew.kWh_t)}</td></tr>
      <tr><td>Auxiliaries</td><td class="n"></td><td class="n">${fmt(P.aux.MWh / P.hours, 2)} MW</td><td class="n">${fmt(P.aux.kWh_t)}</td></tr>
      <tr class="tot"><td>Total</td><td class="n"></td><td class="n">${fmt(P.power.MW, 2)} MW</td><td class="n">${fmt(P.power.kWh_t)}</td></tr></tbody>`;
    $('elecNote').textContent = `Check: ${fmt(P.ew.AhPerKg, 1)} Ah per kg Cu at 2 e⁻ and 100% efficiency. EW rectifier ≈ ${fmt(P.ew.rectI / 1e3, 1)} kA × ${fmt(P.ew.rectV)} V. Vanadium inventory ≈ ${fmt(P.v.inv_t, 1)} t.`;
  }
  const mass = (el, t) => (el === 'Au' || el === 'Ag') ? fmt(t * 1000) + ' kg' : el === 'V' ? fmt(t, 1) : fmt(t);

  function bars(el, items, cls = '', unit = (v) => money(v, 1), top = 5) {
    const sorted = [...items].sort((a, b) => b.v - a.v);
    const shown = sorted.slice(0, top);
    const rest = sorted.slice(top).reduce((a, i) => a + i.v, 0);
    if (rest > 0) shown.push({ name: 'Everything else', v: rest });
    const max = Math.max(...shown.map(i => i.v), 1e-9);
    el.innerHTML = shown.map(i => `<div class="bar"><span class="lab">${i.name}</span><span class="track2"><span class="fill ${cls}" style="width:${i.v / max * 100}%"></span></span><span class="val">${unit(i.v)}</span></div>`).join('');
  }

  function renderEcon() {
    const b = R.baseline, o = R.opex, f = R.finance, c = R.capex;
    $('econLead').innerHTML = `Selling concentrate costs the miner <b>${fmt(b.leakCentsLb, 1)} ¢/lb</b> in payable deductions, smelter charges and freight. The plant costs <b>${fmt(o.grossCentsLb, 1)} ¢/lb</b> to run before gold, silver and sulfur credits, plus ${money(c.total, 0)} to build.`;
    const row = (n, v, cls = '') => `<tr class="${cls}"><td>${n}</td><td class="n ${v < 0 ? 'neg' : ''}">${money(v, 1)}</td></tr>`;
    $('ledBase').innerHTML = `<tbody>${b.lines.filter(l => Math.abs(l.v) > 1e-6).map(l => row(l.name, l.v)).join('')}${row('Net to miner', b.net, 'tot')}</tbody>`;
    $('ledRacer').innerHTML = `<tbody>${row('Copper cathode', o.cuRevenue)}${o.credits.map(x => row(x.name, x.v)).join('')}${row('Running cost', -o.total)}${row('Net to miner', o.margin, 'tot')}</tbody>`;
    $('opexSub').textContent = `${money(o.total)}/yr`;
    bars($('opexBars'), o.items.map(i => ({ name: i.name, v: i.v })), '', (v) => money(v, 1));
    $('capexSub').textContent = `${money(c.total, 0)} installed`;
    bars($('capexBars'), c.items.map(i => ({ name: i.name, v: i.installed })).concat([{ name: 'Vanadium fill', v: c.vInv }]), 'c', (v) => money(v, 1), 8);
    $('benchNote').textContent = `$${fmt(c.perAnnualT)} per annual tonne. A 300 kt/yr smelter costs ≈ $5,000/t [9]; scaled down to the same size it would cost ≈ ${money(c.bench.smelterAtScale, 0)}, so this plant is ${fmt(Math.abs(c.bench.vsAtScale) * 100)}% ${c.bench.vsAtScale >= 0 ? 'cheaper' : 'dearer'}.`;
    drawCashFlow();
    drawBridge();
  }

  function bridgeSteps() {
    const b = R.baseline, o = R.opex, P = R.process;
    const L = Object.fromEntries(b.lines.map(l => [l.k, l.v]));
    const O = Object.fromEntries(o.items.map(i => [i.k, i.v]));
    const credits = o.creditTotal - (L.au + L.ag);
    return [
      { name: ['Smelter', 'deductions'], v: (b.grossCu - L.cu) - (L.tc + L.rc + L.as + L.duty) },
      { name: ['Concentrate', 'freight saved'], v: -L.frt },
      { name: ['By-product', 'credits'], v: credits },
      { name: ['Recovery', 'loss'], v: o.cuRevenue - b.grossCu },
      { name: ['Power'], v: -O.power },
      { name: ['Reagents'], v: -(O.acid + O.lime + O.vmk + O.sx + O.res) },
      { name: ['Labour &', 'overheads'], v: -(O.labor + O.maint + O.ga) },
      { name: ['Cathode', 'freight'], v: -O.frt },
    ];
  }
  function drawBridge() {
    if (!window.Chart) return;
    const T = tok();
    const steps = bridgeSteps();
    let run = 0;
    const data = steps.map(st => { const a = run; run += st.v; return [a, run]; });
    const total = run;
    data.push([0, total]);
    const labels = steps.map(st => st.name).concat([['Net', 'difference']]);
    const vals = steps.map(st => st.v).concat([total]);
    const colors = steps.map(st => st.v >= 0 ? T.copper : T.data2).concat([T.ink]);
    const valueLabels = {
      id: 'vl',
      afterDatasetsDraw(chart) {
        const { ctx } = chart; const meta = chart.getDatasetMeta(0);
        ctx.save(); ctx.font = `400 ${fs(11.5)}px "Geist Mono", monospace`; ctx.fillStyle = T.ink; ctx.textAlign = 'center';
        meta.data.forEach((bar, i) => {
          const v = vals[i]; const top = Math.min(bar.y, bar.base);
          ctx.fillText((v >= 0 ? '+' : '−') + fmt(Math.abs(v), 1), bar.x, top - 6);
        });
        ctx.restore();
      },
    };
    upsert('bridgeChart', {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 0, borderSkipped: false, barPercentage: 0.62, categoryPercentage: 0.9 }] },
      options: opts(T, {
        layout: { padding: { top: 22 } },
        plugins: { tooltip: { callbacks: { title: (c) => labels[c[0].dataIndex].join(' '), label: (c) => ` ${signed(vals[c.dataIndex], 2)} per year` } } },
        scales: {
          x: axis(T, '', { grid: { display: false }, ticks: { color: T.ink2, font: { family: 'Geist', size: fs(12) }, maxRotation: 0, autoSkip: false } }),
          y: axis(T, '', { ticks: { color: T.muted, font: { family: 'Geist Mono', size: fs(11) }, callback: (v) => money(v, 0) } }),
        },
      }),
      plugins: [valueLabels, { id: 'zero', beforeDatasetsDraw(chart) { const { ctx, chartArea: a, scales } = chart; const y = scales.y.getPixelForValue(0); ctx.save(); ctx.strokeStyle = T.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke(); ctx.restore(); } }],
    });
  }

  function renderCo2() {
    const L = R.lca;
    const elec = L.racer.find(p => p.k === 'power').v;
    $('co2Lead').innerHTML = `On <b>${E.POWER[state.power_src].label.replace('Grid · ', '').toLowerCase()}</b> power the plant emits <b>${fmt(L.racerTotal, 2)} t CO₂e per t copper</b>, against ${fmt(L.smelterTotal, 2)} for the smelter route. Electricity is ${fmt(elec / L.racerTotal * 100)}% of the plant's footprint, so the power contract decides the carbon story.`;
    drawCo2();
  }

  let mcTimer = null;
  function renderRisk() {
    const t = drawTornado();
    $('riskLead').innerHTML = `The biggest lever is <b>${t[0].name}</b>, then ${t[1].name} and ${t[2].name}. Copper price matters less than you might expect, because it moves both routes.`;
    clearTimeout(mcTimer); mcTimer = setTimeout(() => { drawMC(); drawHeat(); }, 200);
  }


  // ---------- where the plant pays: NPV over smelter charge × plant size ----------
  const HEAT_TC = Array.from({ length: 19 }, (_, i) => -50 + i * 25);
  const HEAT_KT = [100, 80, 60, 40, 30, 20, 15, 10, 5, 2];
  let heatData = null;
  function drawHeat() {
    if (tab !== 'risk') return;
    const T = tok();
    const box = $('heatBox'), cv = $('heat');
    const W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const m = { l: presenting ? 100 : 74, r: 8, t: 8, b: presenting ? 46 : 40 };
    const cw = (W - m.l - m.r) / HEAT_TC.length, ch = (H - m.t - m.b) / HEAT_KT.length;
    const conc = (kt) => Math.round(kt * 1000 / (state.cu_pct / 100 * state.recovery_pct / 100));
    const grid = HEAT_KT.map(kt => HEAT_TC.map(tc => E.run({ ...state, tc, rc: tc / 10, conc_tpy: conc(kt) }, { lean: true }).finance.npv));
    const flat = grid.flat(), maxP = Math.max(1, ...flat.filter(v => v > 0)), maxN = Math.max(1, ...flat.filter(v => v < 0).map(Math.abs));
    heatData = { grid, m, cw, ch };
    const font = (w, px) => `${w} ${px}px "Geist Mono", monospace`;
    grid.forEach((row, r) => row.forEach((v, c) => {
      const t = Math.sqrt(Math.abs(v) / (v > 0 ? maxP : maxN));
      ctx.fillStyle = v > 0 ? `rgba(217,130,74,${0.22 + 0.78 * t})` : `rgba(120,128,136,${0.08 + 0.42 * t})`;
      ctx.fillRect(m.l + c * cw + 1, m.t + r * ch + 1, cw - 2, ch - 2);
    }));
    // break-even boundary
    ctx.strokeStyle = T.ink; ctx.lineWidth = 2; ctx.beginPath();
    grid.forEach((row, r) => row.forEach((v, c) => {
      const x = m.l + c * cw, y = m.t + r * ch;
      if (c + 1 < row.length && (v > 0) !== (row[c + 1] > 0)) { ctx.moveTo(x + cw, y); ctx.lineTo(x + cw, y + ch); }
      if (r + 1 < grid.length && (v > 0) !== (grid[r + 1][c] > 0)) { ctx.moveTo(x, y + ch); ctx.lineTo(x + cw, y + ch); }
    }));
    ctx.stroke();
    // axes
    ctx.fillStyle = T.muted; ctx.font = font(400, fs(11)); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    HEAT_KT.forEach((kt, r) => ctx.fillText(kt + ' kt/yr', m.l - 10, m.t + r * ch + ch / 2));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    HEAT_TC.forEach((tc, c) => { if (tc % 100 === 0) ctx.fillText((tc < 0 ? '−$' : '$') + Math.abs(tc), m.l + c * cw + cw / 2, H - m.b + 10); });
    // current case
    const cx = m.l + (Math.min(400, Math.max(-50, state.tc)) + 50) / 25 * cw + cw / 2;
    const ktNow = R.process.cath_t / 1000;
    let ry = HEAT_KT.length - 1;
    for (let i = 0; i < HEAT_KT.length - 1; i++) { if (ktNow <= HEAT_KT[i] && ktNow >= HEAT_KT[i + 1]) { ry = i + (HEAT_KT[i] - ktNow) / (HEAT_KT[i] - HEAT_KT[i + 1]); break; } }
    if (ktNow > HEAT_KT[0]) ry = 0;
    const cy = m.t + ry * ch + ch / 2;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.lineWidth = 2.5; ctx.strokeStyle = T.surface; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = T.ink; ctx.fill();
    // note: break-even charge per size
    const beAt = (kt) => { const r = HEAT_KT.indexOf(kt); const c = grid[r].findIndex(v => v > 0); return c < 0 ? null : HEAT_TC[c]; };
    const fmtBe = (kt) => { const v = beAt(kt); return v === null ? `above $${HEAT_TC[HEAT_TC.length - 1]}/dmt` : `about $${v}/dmt`; };
    $('heatNote').textContent = `NPV turns positive at ${fmtBe(10)} for a 10 kt/yr plant, ${fmtBe(40)} at 40 kt/yr and ${fmtBe(100)} at 100 kt/yr. Other inputs held at the current case. RC follows TC at 1/10.`;
  }
  function heatTip(e) {
    if (!heatData) return;
    const { grid, m, cw, ch } = heatData, rect = $('heat').getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const c = Math.floor((x - m.l) / cw), r = Math.floor((y - m.t) / ch), tip = $('heatTip');
    if (c < 0 || r < 0 || r >= grid.length || c >= grid[0].length) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.innerHTML = `<b>${money(grid[r][c], 0)}</b> NPV<br>TC $${HEAT_TC[c]}/dmt · ${HEAT_KT[r]} kt/yr`;
    tip.style.transform = `translate(${Math.min(x + 14, rect.width - 190)}px, ${Math.max(0, y - 54)}px)`;
  }

  // ---------- charts ----------
  const charts = {};
  const tok = () => { const cs = getComputedStyle(document.documentElement); const g = (n) => cs.getPropertyValue(n).trim(); return { ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'), line: g('--line'), surface: g('--bg'), data2: g('--data-2'), copper: g('--copper'), good: g('--good'), bad: g('--bad') }; };
  const tip = (T) => ({ backgroundColor: T.surface, titleColor: T.ink, bodyColor: T.ink2, borderColor: T.line, borderWidth: 1, padding: 10, titleFont: { family: 'Geist', weight: '600' }, bodyFont: { family: 'Geist Mono', size: fs(11.5) } });
  const axis = (T, title, extra = {}) => ({ grid: { color: T.line, drawTicks: false }, border: { display: false }, ticks: { color: T.muted, font: { family: 'Geist Mono', size: fs(11) }, padding: 8 }, title: title ? { display: true, text: title, color: T.muted, font: { family: 'Geist', size: fs(12), weight: '600' } } : undefined, ...extra });
  const opts = (T, extra) => ({ responsive: true, maintainAspectRatio: false, animation: { duration: 200 }, ...extra, plugins: { legend: { display: false }, ...(extra.plugins || {}), tooltip: { ...tip(T), ...((extra.plugins || {}).tooltip || {}) } } });
  const upsert = (id, cfg) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart($(id), cfg); };
  const vline = (id, get) => ({ id, afterDatasetsDraw(chart) {
    const { ctx, chartArea: a, scales } = chart;
    get().forEach(l => {
      const x = scales.x.getPixelForValue(l.v); if (x < a.left - 1 || x > a.right + 1) return;
      ctx.save(); ctx.strokeStyle = l.color; ctx.lineWidth = l.w || 1.5; ctx.setLineDash(l.dash || []);
      ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
      if (l.label) { ctx.setLineDash([]); ctx.fillStyle = l.color; ctx.font = `400 ${fs(11)}px "Geist Mono", monospace`; ctx.textAlign = l.align || 'center'; ctx.fillText(l.label, x + (l.dx || 0), a.top - 7); }
      ctx.restore();
    });
  } });

  function drawCashFlow() {
    if (!window.Chart) return;
    const T = tok(), ys = R.finance.years;
    upsert('cfChart', {
      type: 'line',
      data: { labels: ys.map(y => 'Yr ' + y.t), datasets: [{ data: ys.map(y => y.cum), borderColor: T.copper, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: T.copper, fill: { target: 'origin', above: T.copper + '26', below: T.data2 + '33' }, tension: 0 }] },
      options: opts(T, {
        interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { callbacks: { label: (c) => ` cumulative ${money(c.parsed.y, 1)}` } } },
        scales: { x: axis(T, '', { grid: { display: false }, ticks: { color: T.muted, font: { family: 'Geist Mono', size: fs(11) }, maxRotation: 0, autoSkipPadding: 12 } }), y: axis(T, '', { ticks: { color: T.muted, font: { family: 'Geist Mono', size: fs(11) }, callback: (v) => money(v, 0) } }) },
      }),
    });
  }

  function drawCo2() {
    if (!window.Chart) return;
    const T = tok(), L = R.lca;
    const rows = [...L.bySource].sort((a, b) => a.total - b.total);
    upsert('co2Chart', {
      type: 'bar',
      data: { labels: rows.map(r => r.label.replace('Grid · ', '').replace('On-site gas turbine · ', 'Gas turbine, ').replace(' (solar/wind)', '')), datasets: [{ data: rows.map(r => r.total), backgroundColor: rows.map(r => r.key === state.power_src ? T.copper : T.data2), borderRadius: 0, barPercentage: 0.7, categoryPercentage: 0.9 }] },
      options: opts(T, {
        indexAxis: 'y', layout: { padding: { top: 18, right: 12 } },
        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt(c.parsed.x, 2)} t CO₂e/t Cu` } } },
        scales: { x: axis(T, '', { beginAtZero: true, suggestedMax: Math.max(L.smelterTotal * 1.15, rows[rows.length - 1].total) }), y: axis(T, '', { grid: { display: false }, ticks: { color: T.ink2, font: { family: 'Geist', size: fs(12) } } }) },
      }),
      plugins: [vline('sm', () => [{ v: L.smelterTotal, color: T.ink, dash: [5, 4], label: `smelter route ${fmt(L.smelterTotal, 2)}`, align: 'left', dx: 6 }])],
    });
  }

  function drawTornado() {
    const t = E.tornado(state).slice(0, 7);
    if (!window.Chart) return t;
    const T = tok(), base = t[0].base;
    upsert('torChart', {
      type: 'bar',
      data: { labels: t.map(r => r.name), datasets: [
        { label: '−20%', data: t.map(r => [base, r.vLo]), backgroundColor: T.data2, borderRadius: 0, borderSkipped: false, barPercentage: 0.7, categoryPercentage: 0.85, grouped: false },
        { label: '+20%', data: t.map(r => [base, r.vHi]), backgroundColor: T.copper, borderRadius: 0, borderSkipped: false, barPercentage: 0.7, categoryPercentage: 0.85, grouped: false },
      ] },
      options: opts(T, {
        indexAxis: 'y', layout: { padding: { top: 18 } },
        plugins: { tooltip: { callbacks: { label: (c) => { const r = t[c.dataIndex], lo = c.datasetIndex === 0; return ` input ${c.dataset.label}: NPV ${money(lo ? r.vLo : r.vHi, 0)}`; } } } },
        scales: { x: axis(T, '', { ticks: { color: T.muted, font: { family: 'Geist Mono', size: fs(11) }, callback: (v) => money(v, 0), maxTicksLimit: 6 } }), y: axis(T, '', { grid: { display: false }, ticks: { color: T.ink2, font: { family: 'Geist', size: fs(12.5) } } }) },
      }),
      plugins: [vline('tb', () => [{ v: base, color: T.ink, w: 1.2, label: `base ${money(base, 0)}` }])],
    });
    return t;
  }

  function drawMC() {
    if (!window.Chart || tab !== 'risk') return;
    const T = tok();
    const mc = E.monteCarlo(state, 2000, 42);
    const span = (mc.npvP.max - mc.npvP.min) || 1;
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(x => span / x <= 6) || 1000;
    const lo = Math.floor(mc.npvP.min / step) * step, hi = Math.ceil(mc.npvP.max / step) * step, nb = 30, w = (hi - lo) / nb;
    const bins = Array.from({ length: nb }, (_, i) => ({ x: lo + w * (i + 0.5), y: 0 }));
    mc.npv.forEach(v => { bins[Math.min(nb - 1, Math.floor((v - lo) / w))].y++; });
    upsert('mcChart', {
      type: 'bar',
      data: { datasets: [{ data: bins, backgroundColor: bins.map(b => b.x >= 0 ? T.copper : T.data2), barPercentage: 1, categoryPercentage: 1, borderColor: T.surface, borderWidth: { left: 1, right: 1 }, borderRadius: 0 }] },
      options: opts(T, {
        layout: { padding: { top: 20 } },
        plugins: { tooltip: { callbacks: { title: (c) => `NPV ${money(c[0].parsed.x - w / 2, 0)} to ${money(c[0].parsed.x + w / 2, 0)}`, label: (c) => ` ${c.parsed.y} runs` } } },
        scales: { x: axis(T, '', { type: 'linear', min: lo, max: hi, ticks: { color: T.muted, font: { family: 'Geist Mono', size: fs(11) }, stepSize: step, callback: (v) => money(v, 0) } }), y: axis(T, '', { beginAtZero: true, ticks: { display: false }, grid: { display: false } }) },
      }),
      plugins: [vline('mcp', () => [
        { v: mc.npvP.p10, color: T.muted, dash: [3, 3], label: 'P10' },
        { v: mc.npvP.p50, color: T.ink, w: 1.6, label: 'P50' },
        { v: mc.npvP.p90, color: T.muted, dash: [3, 3], label: 'P90' },
      ])],
    });
    $('mcStats').innerHTML = [['P10', mc.npvP.p10], ['P50', mc.npvP.p50], ['P90', mc.npvP.p90]].map(([k, v]) => `<div><span class="k">${k} NPV</span><span class="v">${money(v, 0)}</span></div>`).join('');
    $('mcNote').textContent = `NPV is positive in ${fmt(mc.probPositive * 100)}% of runs. ${E.MC_VARS.length} inputs varied together; ranges in Method.`;
  }

  // ---------- method ----------
  const EQS = [
    ['I = ṁ·n·F / (M·CE)', 'Current for a production rate; 843.5 Ah/kg Cu at n = 2'],
    ['E = n·F·V / (M·CE)', 'Specific energy; EW at 2.0 V, 92% → 1,834 kWh/t'],
    ['2CuFeS₂ + 6H⁺ + 2V²⁺ → Cu₂S + 2Fe²⁺ + 3H₂S + 2V³⁺', 'Reductive leach on the chalcopyrite fraction: 1 e⁻/Cu [1]'],
    ['Cu₂S + 4Fe³⁺ → 2Cu²⁺ + 4Fe²⁺ + S⁰', 'Ferric leach; Fe³⁺ regenerated with O₂'],
    ['V_cell = E_rev + η_a + |η_c| + I·R', 'Cell voltage build-up'],
    ['A = I / j', 'Electrode area; cathodes in parallel, cells in series'],
    ['C = C_ref · (S / S_ref)^0.6 × f_install', 'Factored CAPEX [15]'],
    ['Net conc. = payable Cu·P + Au, Ag − TC − RC − penalties − freight', 'What the smelter route pays the miner'],
    ['Gain = (cathode + credits − OPEX) − net conc.', 'Value proposition to the miner'],
    ['NPV = Σ CF_t / (1 + r)^t', 'Incremental after-tax cash flow, CAPEX over construction'],
    ['CO₂e/t = kWh/t × EF + reagents × EF + shipping', 'Concentrate-to-cathode footprint'],
  ];
  let methodDone = false;
  function renderMethod() {
    if (!methodDone) {
      $('eqs').innerHTML = EQS.map(([c, s]) => `<div class="eq"><code>${c}</code><span>${s}</span></div>`).join('');
      $('refs').innerHTML = REFS.map(([t, u]) => `<li>${u ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : t}</li>`).join('');
      $('mcRanges').textContent = 'Triangular distributions, 2,000 runs, seed 42: ' + E.MC_VARS.map(v => v.name).join('; ') + '. Absolute ranges shift with the current input.';
      methodDone = true;
    }
    const all = [
      ['Copper price', state.cu_price, '$/t', 11], ['Treatment / refining charge', `${state.tc} / ${state.rc}`, '$/dmt / ¢/lb', 7],
      ['Concentrate freight', state.freight_wmt, '$/wmt', 'A'], ['Concentrate', state.conc_tpy, 't/yr dry', 'A'],
      ['Power source', E.POWER[state.power_src].label, '', 12], ['Power price', state.power_price, '$/MWh', 'A'],
      ...Object.values(FIELD).map(f => [f.label, state[f.k], f.unit === 'sel' ? '' : f.unit, f.src]),
    ];
    $('assTbl').innerHTML = `<thead><tr><th>Input</th><th class="n">Value</th><th>Unit</th><th>Basis</th></tr></thead><tbody>` +
      all.map(([n, v, u, s]) => `<tr><td>${n}</td><td class="n">${v}</td><td style="color:var(--muted)">${u}</td><td>${s === 'A' ? '<span class="badge a">A</span>' : `<span class="badge s">[${s}]</span>`}</td></tr>`).join('') + '</tbody>';
  }

  // ---------- presenting mode ----------
  function setPresenting(on) {
    presenting = on;
    document.documentElement.classList.toggle('presenting', on);
    $('presentBtn').setAttribute('aria-pressed', String(on));
    $('presentBtn').textContent = on ? 'Exit presenting' : 'Present';
    if (on) $('more').open = false;
    if (R) renderTab();
  }

  // ---------- init ----------
  function setCase(k) {
    caseKey = k; state = { ...E.DEFAULTS, ...E.CASES[k].set };
    $('caseSel').value = k;
    writeControls(); changed();
  }
  function init() {
    $('caseSel').innerHTML = Object.entries(E.CASES).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
    buildControls();
    const saved = store.get('cvc_state2');
    if (saved && saved.state && E.CASES[saved.caseKey]) { state = { ...E.DEFAULTS, ...saved.state }; caseKey = saved.caseKey; }
    caseA = store.get('cvc_caseA2');
    $('caseSel').value = caseKey;
    writeControls();
    $('caseSel').addEventListener('change', (e) => setCase(e.target.value));
    $('resetBtn').addEventListener('click', () => setCase('base'));
    $('presentBtn').addEventListener('click', () => setPresenting(!presenting));
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape' && presenting) setPresenting(false);
      else if (e.key === 'p' || e.key === 'P') setPresenting(!presenting);
    });
    $('saveA').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const edited = Object.keys(state).some(k => String(state[k]) !== String(ref()[k]));
      caseA = snap(R, E.CASES[caseKey].label + (edited ? ', edited' : ''));
      store.set('cvc_caseA2', caseA); renderCompare();
    });
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.id.slice(2), true)));
    $('p-flow').parentElement.querySelector('.tablist').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const ids = ['flow', 'econ', 'co2', 'risk', 'method'];
      const i = (ids.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
      setTab(ids[i], true); $('t-' + ids[i]).focus();
    });
    $('heat').addEventListener('mousemove', heatTip);
    $('heat').addEventListener('mouseleave', () => { $('heatTip').hidden = true; });
    let rz = null; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawHeat, 150); });
    update();
    if (/[?&]present\b/.test(location.search)) setPresenting(true);
    const TABS = ['flow', 'econ', 'co2', 'risk', 'method'];
    window.addEventListener('hashchange', () => {
      const t = location.hash.slice(1);
      if (TABS.includes(t)) { setTab(t); $('detail').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
    });
    const h = (location.hash || '').slice(1);
    setTab(['flow', 'econ', 'co2', 'risk', 'method'].includes(h) ? h : 'flow');
    const redraw = () => { renderVerdict(); if (['econ', 'co2', 'risk'].includes(tab)) renderTab(); };
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw); } catch (e) { /* older browsers */ }
    new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
