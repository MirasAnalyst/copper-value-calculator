/* Copper Value Calculator — calculation engine.
 * Pure functions, no DOM. Modules run in order and each reads only the one before it:
 * inputs → process → tea → lca → baseline → value → (sensitivity reruns all of it).
 * Units: t = metric tonne, mol, A, V, W, $ (USD 2026). "Assumption" values are labelled in DEFAULTS_META.
 */
(function (root) {
  'use strict';

  // ---------- constants ----------
  const F = 96485.33;            // C/mol e-
  const M = { Cu: 63.546, Fe: 55.845, S: 32.06, V: 50.9415, H2SO4: 98.079, CaO: 56.077, O2: 31.998 };
  const MW_CPY = M.Cu + M.Fe + 2 * M.S;   // CuFeS2 183.51
  const MW_CC = 2 * M.Cu + M.S;           // Cu2S 159.15
  const MW_PY = M.Fe + 2 * M.S;           // FeS2 119.97
  const LB_PER_T = 2204.62;
  const G_PER_OZ = 31.1035;
  const CONC_SG = 4.2;                    // dry concentrate specific gravity (assumption)

  // ---------- power presets (t CO2/MWh) ----------
  // Grid factors are approximate generation-weighted intensities (Ember / IEA, 2024 data); verify before quoting.
  const POWER = {
    world:   { label: 'Grid · world average', ef: 0.47 },
    chile:   { label: 'Grid · Chile (SEN)', ef: 0.30 },
    peru:    { label: 'Grid · Peru', ef: 0.25 },
    usa:     { label: 'Grid · United States', ef: 0.37 },
    china:   { label: 'Grid · China', ef: 0.55 },
    kaz:     { label: 'Grid · Kazakhstan', ef: 0.65 },
    aus:     { label: 'Grid · Australia', ef: 0.55 },
    zambia:  { label: 'Grid · Zambia (hydro-heavy)', ef: 0.10 },
    drc:     { label: 'Grid · DR Congo (hydro)', ef: 0.03 },
    gt_sc:   { label: 'On-site gas turbine · simple cycle', ef: 0.55 },
    gt_cc:   { label: 'On-site gas turbine · combined cycle', ef: 0.35 },
    ppa:     { label: 'Renewables PPA (solar/wind)', ef: 0.05 },
    diesel:  { label: 'Diesel gensets', ef: 0.70 },
  };

  // ---------- defaults ----------
  const DEFAULTS = {
    // Feed
    conc_tpy: 42000, cu_pct: 25, cpy_pct: 80, fe_pct: 25, as_pct: 0.2, au_gpt: 2, ag_gpt: 50, moisture_pct: 8,
    // Process
    reduce_to: 'Cu2S', recovery_pct: 97, avail_pct: 95,
    v_cell_V: 1.7, v_ce_pct: 85, v_j: 500, v_loss_kg_t: 1.0, v_loop_h: 4, v_util_pct: 50,
    ew_V: 2.0, ew_ce_pct: 92, ew_j: 300,
    aux_kwh_t: 600, leach_tau_min: 60, ox_tau_h: 6, solids_pct: 20, sru_rec_pct: 97,
    au_rec_pct: 90, ag_rec_pct: 80,
    // Power
    power_src: 'world', power_price: 70,
    // Market (LME / spot, late Jul 2026)
    cu_price: 13800, au_price: 4150, ag_price: 54, s_price: 150, cathode_premium: 0,
    // Costs
    acid_price: 120, lime_price: 150, v_price: 25, sx_reag_t: 30, residue_cost_t: 5,
    labor_musd: 4.8, maint_pct: 3, ga_pct: 1, cathode_freight_t: 80, lang: 3.0, capex_mult: 1.0,
    // Baseline (concentrate sale)
    payable_pct: 96.5, min_deduct: 1.0, au_pay_pct: 90, ag_pay_pct: 90,
    tc: 0, rc: 0, freight_wmt: 90, as_thresh: 0.2, as_pen: 3, export_duty_pct: 0,
    // Finance
    disc_pct: 10, life_yr: 20, tax_pct: 25, build_yr: 2, dep_yr: 10,
    // LCA
    acid_ef: 0.10, lime_ef: 1.0, v_ef: 30, ship_km: 15000, ship_g_tkm: 10, smelter_ef: 1.2,
  };

  // Example cases: overrides on DEFAULTS. Generic feed, no named mine.
  const CASES = {
    base:    { label: '2026 benchmark terms (TC/RC $0)', set: {} },
    longrun: { label: 'Long-run TC/RC ($80 / 8¢)', set: { tc: 80, rc: 8 } },
    inland:  { label: 'Landlocked mine, coal grid', set: { tc: 80, rc: 8, freight_wmt: 160, power_src: 'kaz', power_price: 50, ship_km: 9000 } },
    dirty:   { label: 'High-arsenic concentrate', set: { tc: 80, rc: 8, as_pct: 0.6, as_pen: 5, freight_wmt: 110 } },
    duty:    { label: 'Export duty 7.5%', set: { tc: 80, rc: 8, export_duty_pct: 7.5 } },
    large:   { label: 'Large mine, 100 kt/yr Cu', set: { conc_tpy: 420000, tc: 80, rc: 8 } },
  };

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // ======================================================================
  // 1. PROCESS MODEL
  // ======================================================================
  function processModel(p) {
    const hours = 8760 * p.avail_pct / 100;
    const toMol = (t, mw) => t * 1e6 / mw;
    const toT = (mol, mw) => mol * mw / 1e6;

    // --- Feed mineralogy (Cu as chalcopyrite / chalcocite; leftover Fe as pyrite) ---
    const cuIn_t = p.conc_tpy * p.cu_pct / 100;
    const feIn_t = p.conc_tpy * p.fe_pct / 100;
    const nCpy = toMol(cuIn_t * p.cpy_pct / 100, M.Cu);        // mol CuFeS2
    const nCcCu = toMol(cuIn_t * (1 - p.cpy_pct / 100), M.Cu);  // mol Cu as Cu2S
    let nPy = toMol(feIn_t, M.Fe) - nCpy;                        // mol FeS2
    const warnings = [];
    if (nPy < 0) { warnings.push('Fe assay is lower than chalcopyrite needs. Pyrite set to zero; Fe balance uses chalcopyrite Fe.'); nPy = 0; }
    const sIn_t = toT(2 * nCpy + 0.5 * nCcCu + 2 * nPy, M.S);
    const minerals = {
      cpy_t: toT(nCpy, MW_CPY), cc_t: toT(nCcCu / 2, MW_CC), py_t: toT(nPy, MW_PY),
    };
    minerals.gangue_t = Math.max(0, p.conc_tpy - minerals.cpy_t - minerals.cc_t - minerals.py_t - p.conc_tpy * p.as_pct / 100);
    minerals.s_pct = sIn_t / p.conc_tpy * 100;

    // --- Reductive leach, chalcopyrite fraction only ---
    // 2CuFeS2 + 6H+ + 2V2+ → Cu2S + 2Fe2+ + 3H2S + 2V3+   (1 e-/Cu)
    // optional: Cu2S + 2H+ + 2V2+ → 2Cu + H2S + 2V3+      (+1 e-/Cu)
    const r = p.recovery_pct / 100;
    const toMetal = p.reduce_to === 'Cu';
    const x = r * nCpy;                    // CuFeS2 reacted
    const y = r * nCcCu;                   // native chalcocite Cu leached
    const eRed = x * (toMetal ? 2 : 1);    // mol e- delivered by V2+
    const h2s = x * (toMetal ? 2 : 1.5);   // mol H2S released
    const feBleed = x;                     // mol Fe2+ released
    const hConsumed = x * (toMetal ? 4 : 3);

    // --- Oxidative (ferric) leach: Cu2S + 4Fe3+ → 2Cu2+ + 4Fe2+ + S0 ; Cu + 2Fe3+ → Cu2+ + 2Fe2+ ---
    const cuAsCu2S = (toMetal ? 0 : x) + y;
    const s0 = 0.5 * cuAsCu2S;
    const fe3 = 2 * (x + y);               // Fe3+ reduced, regenerated with O2
    const o2 = fe3 / 4;

    // --- SX-EW ---
    const nCath = x + y;
    const cath_t = toT(nCath, M.Cu);
    const eEW = 2 * nCath;

    // --- Electrical sizing: I = n·F·ṁ / (M·CE), P = I·V, A = I/j ---
    const sec = hours * 3600;
    const vI = eRed / sec * F / (p.v_ce_pct / 100);
    const vP = vI * p.v_cell_V;
    const vA = vI / p.v_j;
    const ewI = eEW / sec * F / (p.ew_ce_pct / 100);
    const ewP = ewI * p.ew_V;
    const ewA = ewI / p.ew_j;
    const cathodes = Math.ceil(ewA / 2);              // 1 m² blank, both faces plated
    const ewCells = Math.max(1, Math.ceil(cathodes / 60));
    const rectI = ewI / ewCells;                      // cathodes in parallel, cells in series
    const rectV = ewCells * p.ew_V;
    const vMWh = vP * hours / 1e6;
    const ewMWh = ewP * hours / 1e6;
    const auxMWh = p.aux_kwh_t * cath_t / 1000;
    const totMWh = vMWh + ewMWh + auxMWh;
    const perT = (mwh) => cath_t > 0 ? mwh * 1000 / cath_t : 0;

    // --- Vanadium loop ---
    const vCycle_molh = eRed / hours;                 // each V carries one e- per pass
    const vInv_m3 = vCycle_molh / (p.v_util_pct / 100) * p.v_loop_h / 1000; // 1 M VSO4 → 1000 mol/m³
    const vInv_t = toT(vInv_m3 * 1000, M.V);
    const vMakeup_kg = p.v_loss_kg_t * cath_t;

    // --- Side streams & reagents ---
    const sProd_t = toT(h2s * p.sru_rec_pct / 100, M.S);
    const sSlip_t = toT(h2s * (1 - p.sru_rec_pct / 100), M.S);
    const acid_t = toT(feBleed, M.H2SO4) * 1.05;      // sulfate leaving as FeSO4 + 5% losses
    const lime_t = toT(feBleed, M.CaO);               // FeSO4 + CaO + H2O → Fe(OH)2 + CaSO4
    const solids_th = p.conc_tpy / hours;
    const slurry_m3h = solids_th / CONC_SG + solids_th * (100 - p.solids_pct) / p.solids_pct;
    const redVol = slurry_m3h * p.leach_tau_min / 60;
    const oxVol = slurry_m3h * p.ox_tau_h;
    const residue_t = p.conc_tpy - cath_t - toT(feBleed, M.Fe) - toT(h2s, M.S);

    // --- Precious metals ---
    const auIn_oz = p.conc_tpy * p.au_gpt / G_PER_OZ;
    const agIn_oz = p.conc_tpy * p.ag_gpt / G_PER_OZ;
    const auRec_oz = auIn_oz * p.au_rec_pct / 100;
    const agRec_oz = agIn_oz * p.ag_rec_pct / 100;

    // --- Element balances: in vs sum of independently computed outlet streams ---
    const cuRes_t = toT(nCpy - x, M.Cu) + toT(nCcCu - y, M.Cu);
    const feRes_t = toT(nPy, M.Fe) + toT(nCpy - x, M.Fe);
    const sRes_t = toT(s0, M.S) + toT(2 * (nCpy - x), M.S) + toT(0.5 * (nCcCu - y), M.S) + toT(2 * nPy, M.S);
    const bal = [
      { el: 'Cu', in: cuIn_t, outs: { 'Cathode': cath_t, 'Residue': cuRes_t } },
      { el: 'Fe', in: feIn_t > toT(nCpy, M.Fe) ? feIn_t : toT(nCpy, M.Fe), outs: { 'Fe²⁺ bleed': toT(feBleed, M.Fe), 'Residue': feRes_t } },
      { el: 'S', in: sIn_t, outs: { 'Sulfur product': sProd_t, 'SRU slip (SO₂)': sSlip_t, 'Residue (S⁰ + sulfides)': sRes_t } },
      { el: 'V', in: vMakeup_kg / 1000, outs: { 'Loss to residue': p.v_loss_kg_t * cath_t / 1000 } },
      { el: 'Au', in: auIn_oz * G_PER_OZ / 1e6, outs: { 'Doré': auRec_oz * G_PER_OZ / 1e6, 'Tailings': (auIn_oz - auRec_oz) * G_PER_OZ / 1e6 } },
      { el: 'Ag', in: agIn_oz * G_PER_OZ / 1e6, outs: { 'Doré': agRec_oz * G_PER_OZ / 1e6, 'Tailings': (agIn_oz - agRec_oz) * G_PER_OZ / 1e6 } },
    ].map(b => {
      const out = Object.values(b.outs).reduce((a, c) => a + c, 0);
      return { ...b, out, closure: b.in > 0 ? out / b.in * 100 : 100 };
    });
    // Electron balance: charge passed × CE vs stoichiometric demand
    const eBal = [
      { name: 'V³⁺→V²⁺ cell', supplied: vI * sec * (p.v_ce_pct / 100) / F, demand: eRed },
      { name: 'Electrowinning', supplied: ewI * sec * (p.ew_ce_pct / 100) / F, demand: eEW },
    ].map(e => ({ ...e, closure: e.demand > 0 ? e.supplied / e.demand * 100 : 100 }));

    return {
      hours, cuIn_t, cath_t, minerals, warnings,
      ePerCu: { red: nCath > 0 ? eRed / nCath : 0, redOnCpy: toMetal ? 2 : 1, ew: 2, total: nCath > 0 ? (eRed + eEW) / nCath : 0 },
      mol: { nCpy, nCcCu, nPy, x, y, eRed, eEW, h2s, feBleed, hConsumed, s0, fe3, o2 },
      v: { I: vI, P: vP, A: vA, MWh: vMWh, kWh_t: perT(vMWh), cycle_molh: vCycle_molh, inv_m3: vInv_m3, inv_t: vInv_t, makeup_kg: vMakeup_kg },
      ew: { I: ewI, P: ewP, A: ewA, MWh: ewMWh, kWh_t: perT(ewMWh), cathodes, cells: ewCells, rectI, rectV, AhPerKg: F / 3600 * 2 / M.Cu * 1000 },
      aux: { MWh: auxMWh, kWh_t: p.aux_kwh_t },
      power: { MWh: totMWh, kWh_t: perT(totMWh), MW: totMWh / hours },
      streams: {
        sProd_t, sSlip_t, acid_t, lime_t, o2_t: toT(o2, M.O2), feBleed_t: toT(feBleed, M.Fe),
        residue_t, solids_th, slurry_m3h, redVol, oxVol, auRec_oz, agRec_oz, auIn_oz, agIn_oz,
        sru_tpd: sProd_t / (hours / 24),
      },
      bal, eBal,
    };
  }

  // ======================================================================
  // 2. TEA — factored CAPEX, OPEX, revenue
  // ======================================================================
  const scale = (cref, sref, s, n = 0.6) => s > 0 ? cref * Math.pow(s / sref, n) : 0;

  function capexModel(p, pr) {
    // Purchased equipment cost, $M (2026). Reference points are assumptions; six-tenths scaling.
    const items = [
      { k: 'feed',  name: 'Concentrate repulping & feed', pec: scale(1.5, 42000, p.conc_tpy), basis: '$1.5M @ 42 kt/yr conc' },
      { k: 'red',   name: 'Reductive leach reactors (sealed, N₂)', pec: scale(1.2, 25, pr.streams.redVol), basis: '$1.2M @ 25 m³' },
      { k: 'vcell', name: 'V²⁺ regeneration cell stacks', pec: pr.v.A * 2500 / 1e6, basis: '$2,500/m² membrane area' },
      { k: 'ox',    name: 'Ferric leach + O₂ sparging', pec: scale(2.0, 130, pr.streams.oxVol), basis: '$2.0M @ 130 m³' },
      { k: 'sl',    name: 'CCD thickeners & filters', pec: scale(4.0, 5, pr.streams.solids_th), basis: '$4.0M @ 5 t/h solids' },
      { k: 'sx',    name: 'Solvent extraction', pec: scale(7.0, 10000, pr.cath_t), basis: '$7.0M @ 10 kt/yr Cu' },
      { k: 'ew',    name: 'EW tankhouse', pec: pr.ew.A * 1200 / 1e6, basis: '$1,200/m² cathode area' },
      { k: 'rect',  name: 'Rectifiers & transformers', pec: (pr.v.P + pr.ew.P) / 1000 * 150 / 1e6, basis: '$150/kW DC' },
      { k: 'sru',   name: 'H₂S handling + sulfur recovery', pec: scale(6.0, 20, pr.streams.sru_tpd), basis: '$6.0M @ 20 t/d S' },
      { k: 'fe',    name: 'Fe bleed neutralisation & residue', pec: scale(2.5, 7000, pr.streams.feBleed_t), basis: '$2.5M @ 7 kt/yr Fe' },
      { k: 'pm',    name: 'Au/Ag recovery from residue', pec: scale(3.0, 30000, pr.streams.residue_t), basis: '$3.0M @ 30 kt/yr residue' },
    ];
    const pec = items.reduce((a, i) => a + i.pec, 0);
    items.forEach(i => { i.installed = i.pec * p.lang * p.capex_mult; });
    const vInv = pr.v.inv_t * 1000 * p.v_price / 1e6 * p.capex_mult;
    const total = pec * p.lang * p.capex_mult + vInv;
    // Benchmarks: smelter ≈ $1.5B per 300 kt/yr (Aktogay). Scaled to same capacity with 0.6 exponent.
    const smelterPerT = 1500e6 / 300000;
    const smelterSameScale = scale(1500, 300000, pr.cath_t) ;
    return {
      items, pec, vInv, total,
      perAnnualT: pr.cath_t > 0 ? total * 1e6 / pr.cath_t : 0,
      bench: { smelterPerT, smelterAtScale: smelterSameScale, vsPerT: 1 - (total * 1e6 / pr.cath_t) / smelterPerT, vsAtScale: 1 - total / smelterSameScale },
    };
  }

  function opexModel(p, pr, capex) {
    const s = pr.streams;
    const items = [
      { k: 'power', name: 'Electricity', v: pr.power.MWh * p.power_price / 1e6 },
      { k: 'acid',  name: 'Sulfuric acid', v: s.acid_t * p.acid_price / 1e6 },
      { k: 'lime',  name: 'Lime (Fe bleed)', v: s.lime_t * p.lime_price / 1e6 },
      { k: 'vmk',   name: 'Vanadium make-up', v: pr.v.makeup_kg * p.v_price / 1e6 },
      { k: 'sx',    name: 'SX & other reagents', v: pr.cath_t * p.sx_reag_t / 1e6 },
      { k: 'res',   name: 'Residue disposal', v: Math.max(0, s.residue_t) * p.residue_cost_t / 1e6 },
      { k: 'labor', name: 'Labour', v: p.labor_musd * Math.pow(Math.max(pr.cath_t, 1) / 10000, 0.45) }, // labour_musd is at 10 kt/yr Cu
      { k: 'maint', name: 'Maintenance', v: capex.total * p.maint_pct / 100 },
      { k: 'ga',    name: 'G&A & insurance', v: capex.total * p.ga_pct / 100 },
      { k: 'frt',   name: 'Cathode freight', v: pr.cath_t * p.cathode_freight_t / 1e6 },
    ];
    const total = items.reduce((a, i) => a + i.v, 0);
    const credits = [
      { k: 'au', name: 'Gold', v: s.auRec_oz * p.au_price * 0.99 / 1e6 },
      { k: 'ag', name: 'Silver', v: s.agRec_oz * p.ag_price * 0.99 / 1e6 },
      { k: 's',  name: 'Sulfur', v: s.sProd_t * p.s_price / 1e6 },
    ];
    const creditTotal = credits.reduce((a, i) => a + i.v, 0);
    const cuRevenue = pr.cath_t * (p.cu_price + p.cathode_premium) / 1e6;
    const lb = pr.cath_t * LB_PER_T;
    return {
      items, total, credits, creditTotal, cuRevenue,
      revenue: cuRevenue + creditTotal,
      margin: cuRevenue + creditTotal - total,
      grossCentsLb: lb > 0 ? total * 1e8 / lb : 0,
      netCentsLb: lb > 0 ? (total - creditTotal) * 1e8 / lb : 0,
    };
  }

  // ======================================================================
  // 4. CUSTOMER BASELINE — sell concentrate to a smelter
  // ======================================================================
  function baselineModel(p, pr) {
    const cuContained = pr.cuIn_t;
    const deductUnits = Math.max(p.cu_pct * (1 - p.payable_pct / 100), p.min_deduct);
    const payableUnits = Math.max(0, p.cu_pct - deductUnits);
    const payCu_t = p.conc_tpy * payableUnits / 100;
    const wmt = p.conc_tpy / (1 - p.moisture_pct / 100);
    const lines = [
      { k: 'cu', name: 'Payable copper', v: payCu_t * p.cu_price / 1e6 },
      { k: 'au', name: 'Payable gold', v: pr.streams.auIn_oz * p.au_pay_pct / 100 * p.au_price / 1e6 },
      { k: 'ag', name: 'Payable silver', v: pr.streams.agIn_oz * p.ag_pay_pct / 100 * p.ag_price / 1e6 },
      { k: 'tc', name: 'Treatment charge', v: -p.tc * p.conc_tpy / 1e6 },
      { k: 'rc', name: 'Refining charge', v: -p.rc / 100 * payCu_t * LB_PER_T / 1e6 },
      { k: 'as', name: 'Arsenic penalty', v: -Math.max(0, (p.as_pct - p.as_thresh) / 0.1) * p.as_pen * p.conc_tpy / 1e6 },
      { k: 'frt', name: 'Concentrate freight', v: -p.freight_wmt * wmt / 1e6 },
    ];
    lines.push({ k: 'duty', name: 'Export duty', v: -(lines[0].v + lines[1].v + lines[2].v) * p.export_duty_pct / 100 });
    const net = lines.reduce((a, l) => a + l.v, 0);
    const grossCu = cuContained * p.cu_price / 1e6;
    return {
      lines, net, payCu_t, payableUnits, wmt, grossCu,
      // what the smelter route costs the miner, per lb contained Cu
      leakCentsLb: cuContained > 0 ? (grossCu - lines[0].v - lines.slice(3).reduce((a, l) => a + l.v, 0)) * 1e8 / (cuContained * LB_PER_T) : 0,
      blocked: p.as_pct > 0.5,
    };
  }

  // ======================================================================
  // 3. LCA — cradle-to-gate for the concentrate → cathode step, t CO2e / t Cu
  // ======================================================================
  function lcaModel(p, pr, base) {
    const efOf = (key) => (POWER[key] || POWER.world).ef;
    const perT = (v) => pr.cath_t > 0 ? v / pr.cath_t : 0;
    const parts = (ef) => [
      { k: 'power', name: 'Electricity', v: pr.power.kWh_t / 1000 * ef },
      { k: 'acid', name: 'Sulfuric acid', v: perT(pr.streams.acid_t) * p.acid_ef },
      { k: 'lime', name: 'Lime', v: perT(pr.streams.lime_t) * p.lime_ef },
      { k: 'v', name: 'Vanadium make-up', v: p.v_loss_kg_t * p.v_ef / 1000 },
      { k: 'ship', name: 'Shipping (cathode)', v: p.ship_km * p.ship_g_tkm / 1e6 },
    ];
    const sum = (a) => a.reduce((s, x) => s + x.v, 0);
    const racer = parts(efOf(p.power_src));
    const smelterShip = base.payCu_t > 0 ? base.wmt / base.payCu_t * p.ship_km * p.ship_g_tkm / 1e6 : 0;
    const smelter = [
      { k: 'smelt', name: 'Smelting, converting, refining', v: p.smelter_ef },
      { k: 'ship', name: 'Shipping (concentrate)', v: smelterShip },
    ];
    const bySource = Object.entries(POWER).map(([key, o]) => ({ key, label: o.label, ef: o.ef, total: sum(parts(o.ef)) }));
    return { racer, racerTotal: sum(racer), smelter, smelterTotal: sum(smelter), bySource, ef: efOf(p.power_src) };
  }

  // ======================================================================
  // 5. VALUE PROPOSITION + cash flow (incremental: build RACER vs sell concentrate)
  // ======================================================================
  function financeModel(p, capex, opex, base, gainOverride, lean) {
    const gain = gainOverride ?? (opex.margin - base.net); // $M/yr incremental operating gain
    const r = p.disc_pct / 100;
    const build = Math.max(1, Math.round(p.build_yr));
    const life = Math.max(1, Math.round(p.life_yr));
    const depYrs = Math.max(1, Math.round(p.dep_yr));
    const dep = capex.total / depYrs;
    const years = [];
    for (let t = 1; t <= build + life; t++) {
      const ops = t > build;
      const capexT = ops ? 0 : capex.total / build;
      const opYear = t - build;
      const depT = ops && opYear <= depYrs ? dep : 0;
      const ebitda = ops ? gain : 0;
      const tax = ops ? Math.max(0, (ebitda - depT) * p.tax_pct / 100) : 0;
      const cf = ebitda - tax - capexT;
      years.push({ t, capex: capexT, ebitda, tax, cf, dcf: cf / Math.pow(1 + r, t) });
    }
    let cum = 0, cumD = 0, payback = null;
    years.forEach((y) => {
      const prev = cum;
      cum += y.cf; cumD += y.dcf;
      y.cum = cum; y.cumD = cumD;
      if (payback === null && y.t > build && cum >= 0 && prev < 0) payback = (y.t - build - 1) + (-prev / y.cf);
    });
    const npvAt = (rate) => years.reduce((a, y) => a + y.cf / Math.pow(1 + rate, y.t), 0);
    const npv = npvAt(r);
    let irr = null;
    let lo = -0.9, hi = 1.5;
    if (!lean && npvAt(lo) * npvAt(hi) < 0) {
      for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (npvAt(lo) * npvAt(mid) <= 0) hi = mid; else lo = mid; }
      irr = (lo + hi) / 2;
    }
    return { gain, years, npv, irr, payback };
  }

  // Extra smelter-side charge ($/dmt, TC-equivalent) at which building the plant reaches NPV = 0.
  function breakEven(p, capex, opex, base, fin) {
    let lo = -200, hi = 200;
    const npv = (g) => financeModel(p, capex, opex, base, g, true).npv;
    if (npv(lo) > 0 || npv(hi) < 0) return null;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (npv(mid) < 0) lo = mid; else hi = mid; }
    const gainBE = (lo + hi) / 2;
    const extraPerDmt = (gainBE - fin.gain) * 1e6 / p.conc_tpy;
    return { gainBE, extraPerDmt, tcEquiv: p.tc + extraPerDmt };
  }

  // ======================================================================
  // Full run
  // ======================================================================
  function run(inputs, opts = {}) {
    const p = { ...DEFAULTS, ...inputs };
    const process = processModel(p);
    const capex = capexModel(p, process);
    const opex = opexModel(p, process, capex);
    const baseline = baselineModel(p, process);
    const lca = lcaModel(p, process, baseline);
    const finance = financeModel(p, capex, opex, baseline, undefined, opts.lean);
    finance.breakEven = opts.lean ? null : breakEven(p, capex, opex, baseline, finance);
    return { p, process, capex, opex, baseline, lca, finance };
  }

  // ======================================================================
  // 6. SENSITIVITY
  // ======================================================================
  const TORNADO = [
    { k: 'cu_price', name: 'Cu price' },
    { k: 'power_price', name: 'Power price' },
    { k: 'recovery_pct', name: 'Cu recovery', max: 99.5 },
    { k: 'v_cell_V', name: 'V cell voltage' },
    { k: 'ew_V', name: 'EW cell voltage' },
    { k: 'v_ce_pct', name: 'V cell CE', max: 99 },
    { k: 'ew_ce_pct', name: 'EW CE', max: 99 },
    { k: 'v_loss_kg_t', name: 'V loss' },
    { k: 'capex_mult', name: 'CAPEX' },
    { k: 'labor_musd', name: 'Labour' },
    { k: 'freight_wmt', name: 'Conc. freight' },
  ];

  function tornado(inputs, metric = (res) => res.finance.npv, pct = 20) {
    const p = { ...DEFAULTS, ...inputs };
    const base = metric(run(p));
    return TORNADO.map(t => {
      const lo = p[t.k] * (1 - pct / 100);
      const hi = clamp(p[t.k] * (1 + pct / 100), -Infinity, t.max ?? Infinity);
      const vLo = metric(run({ ...p, [t.k]: lo }, { lean: true }));
      const vHi = metric(run({ ...p, [t.k]: hi }, { lean: true }));
      return { ...t, lo, hi, vLo, vHi, swing: Math.abs(vHi - vLo) };
    }).sort((a, b) => b.swing - a.swing).map(t => ({ ...t, base }));
  }

  // Triangular ranges as multipliers on the current input (min, mode, max) unless absolute.
  const MC_VARS = [
    { k: 'cu_price', tri: [0.75, 1, 1.25], name: 'Cu price ±25%' },
    { k: 'power_price', tri: [0.7, 1, 1.4], name: 'Power price −30/+40%' },
    { k: 'recovery_pct', abs: [95, 97, 99], name: 'Recovery 95–99%' },
    { k: 'v_cell_V', abs: [1.5, 1.7, 2.2], name: 'V cell 1.5–2.2 V' },
    { k: 'ew_V', abs: [1.9, 2.0, 2.2], name: 'EW 1.9–2.2 V' },
    { k: 'v_ce_pct', abs: [75, 85, 95], name: 'V CE 75–95%' },
    { k: 'v_loss_kg_t', abs: [0.5, 1.0, 3.0], name: 'V loss 0.5–3 kg/t' },
    { k: 'capex_mult', tri: [0.8, 1, 1.5], name: 'CAPEX −20/+50% (Class 5)' },
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function triangular(u, a, c, b) {
    const f = (c - a) / (b - a);
    return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
  }
  function monteCarlo(inputs, n = 2000, seed = 42) {
    const p = { ...DEFAULTS, ...inputs };
    const rnd = mulberry32(seed);
    const npv = [], cents = [], gain = [];
    for (let i = 0; i < n; i++) {
      const q = { ...p };
      MC_VARS.forEach(v => {
        const u = rnd();
        if (v.abs) {
          // centre the absolute range on the current value so user edits still matter
          const shift = p[v.k] - v.abs[1];
          q[v.k] = triangular(u, v.abs[0] + shift, v.abs[1] + shift, v.abs[2] + shift);
        } else {
          q[v.k] = p[v.k] * triangular(u, v.tri[0], v.tri[1], v.tri[2]);
        }
      });
      q.recovery_pct = clamp(q.recovery_pct, 50, 99.9);
      q.v_ce_pct = clamp(q.v_ce_pct, 30, 99.9);
      q.v_loss_kg_t = Math.max(0, q.v_loss_kg_t);
      const res = run(q, { lean: true });
      npv.push(res.finance.npv); cents.push(res.opex.netCentsLb); gain.push(res.finance.gain);
    }
    const pct = (arr) => { const s = [...arr].sort((a, b) => a - b); const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]; return { p10: at(0.1), p50: at(0.5), p90: at(0.9), min: s[0], max: s[s.length - 1] }; };
    return { n, npv, cents, gain, npvP: pct(npv), centsP: pct(cents), gainP: pct(gain), probPositive: npv.filter(v => v > 0).length / n };
  }

  const api = { F, M, LB_PER_T, POWER, DEFAULTS, CASES, TORNADO, MC_VARS, run, tornado, monteCarlo, processModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CopperEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
