"""Independent reference calculation for the default case.

Recomputes the headline numbers from first principles (no shared code with engine.js),
then asks Node for the JavaScript engine's numbers and checks they agree within 0.1%.

    python3 validate.py
"""
import json
import math
import subprocess

F = 96485.33
M_CU, M_FE, M_S, M_V, M_ACID, M_CAO = 63.546, 55.845, 32.06, 50.9415, 98.079, 56.077
LB = 2204.62
OZ = 31.1035

# ---- default inputs (must match DEFAULTS in engine.js) ----
conc, cu, cpy, fe, as_pct, au, ag, moist = 42000, 0.25, 0.80, 0.25, 0.2, 2, 50, 0.08
rec, avail = 0.97, 0.95
v_V, v_ce, v_j, v_loss, v_price = 1.7, 0.85, 500, 1.0, 25
ew_V, ew_ce, ew_j, aux = 2.0, 0.92, 300, 600
power_price, cu_price, au_price, ag_price, s_price = 70, 13800, 4150, 54, 150
acid_price, lime_price, sx_reag, labor, maint, ga, cath_frt = 120, 150, 30, 4.8, 0.03, 0.01, 80
payable, min_ded, tc, rc, frt_wmt = 0.965, 1.0, 0, 0, 90
disc, life, tax, build, dep_yr = 0.10, 20, 0.25, 2, 10

hours = 8760 * avail
sec = hours * 3600

# ---- process ----
cu_in = conc * cu
n_cpy = cu_in * cpy * 1e6 / M_CU
n_cc = cu_in * (1 - cpy) * 1e6 / M_CU
x, y = rec * n_cpy, rec * n_cc
cath = (x + y) * M_CU / 1e6
e_red = x * 1                      # reduce to Cu2S: 1 e-/Cu on chalcopyrite
e_ew = 2 * (x + y)

v_I = e_red / sec * F / v_ce
ew_I = e_ew / sec * F / ew_ce
v_kwh_t = v_I * v_V * hours / 1e3 / cath
ew_kwh_t = ew_I * ew_V * hours / 1e3 / cath
tot_mwh = (v_I * v_V + ew_I * ew_V) * hours / 1e6 + aux * cath / 1e3

# ---- hand checks from the brief ----
ah_per_kg = 2 * F / 3600 / M_CU * 1000
ew_hand = 2 * F * ew_V / (M_CU / 1000) / ew_ce / 3.6e6 * 1000   # kWh/t

# ---- OPEX (excluding CAPEX-linked lines) ----
acid_t = x * M_ACID / 1e6 * 1.05
lime_t = x * M_CAO / 1e6
opex_var = (tot_mwh * power_price + acid_t * acid_price + lime_t * lime_price
            + v_loss * cath * v_price + cath * sx_reag + cath * cath_frt) / 1e6

# ---- baseline: sell concentrate ----
deduct = max(cu * 100 * (1 - payable), min_ded)
pay_cu = conc * (cu * 100 - deduct) / 100
wmt = conc / (1 - moist)
au_oz, ag_oz = conc * au / OZ, conc * ag / OZ
base_net = (pay_cu * cu_price + au_oz * 0.9 * au_price + ag_oz * 0.9 * ag_price
            - tc * conc - rc / 100 * pay_cu * LB - frt_wmt * wmt) / 1e6

ref = {
    "Ah per kg Cu (n=2, CE=100%)": ah_per_kg,
    "EW kWh/t at 2.0 V, 92% CE": ew_hand,
    "Cathode t/yr": cath,
    "V-cell current kA": v_I / 1e3,
    "EW current kA": ew_I / 1e3,
    "V-cell kWh/t": v_kwh_t,
    "EW kWh/t (model)": ew_kwh_t,
    "Total MWh/yr": tot_mwh,
    "Acid t/yr": acid_t,
    "Lime t/yr": lime_t,
    "Variable OPEX $M/yr": opex_var,
    "Baseline net revenue $M/yr": base_net,
}

js_src = r"""
const E = require('./engine.js');
const r = E.run({});
const o = Object.fromEntries(r.opex.items.map(i => [i.k, i.v]));
console.log(JSON.stringify({
  "Ah per kg Cu (n=2, CE=100%)": r.process.ew.AhPerKg,
  "EW kWh/t at 2.0 V, 92% CE": r.process.ew.kWh_t,
  "Cathode t/yr": r.process.cath_t,
  "V-cell current kA": r.process.v.I / 1e3,
  "EW current kA": r.process.ew.I / 1e3,
  "V-cell kWh/t": r.process.v.kWh_t,
  "EW kWh/t (model)": r.process.ew.kWh_t,
  "Total MWh/yr": r.process.power.MWh,
  "Acid t/yr": r.process.streams.acid_t,
  "Lime t/yr": r.process.streams.lime_t,
  "Variable OPEX $M/yr": o.power + o.acid + o.lime + o.vmk + o.sx + o.frt,
  "Baseline net revenue $M/yr": r.baseline.net,
  "_closures": r.process.bal.map(b => [b.el, b.closure]).concat(r.process.eBal.map(e => [e.name, e.closure])),
}));
"""

js = json.loads(subprocess.check_output(["node", "-e", js_src], cwd=__file__.rsplit("/", 1)[0] or "."))

ok = True
print(f"{'Quantity':34s} {'Python':>14s} {'JS':>14s} {'diff %':>8s}")
for k, v in ref.items():
    d = (js[k] - v) / v * 100 if v else 0
    flag = "" if abs(d) <= 0.1 else "  <-- FAIL"
    ok &= abs(d) <= 0.1
    print(f"{k:34s} {v:14,.2f} {js[k]:14,.2f} {d:8.4f}{flag}")
print("\nBalance closures (JS):")
for name, c in js["_closures"]:
    flag = "" if abs(c - 100) <= 0.1 else "  <-- FAIL"
    ok &= abs(c - 100) <= 0.1
    print(f"  {name:20s} {c:9.4f} %{flag}")

# Brief's hand checks
assert abs(ah_per_kg - 843.5) < 0.1, ah_per_kg
assert abs(ew_hand - 1834) < 2, ew_hand
print("\nHand checks: 843.5 Ah/kg OK; ~1,834 kWh/t EW OK")
print("ALL CHECKS PASS" if ok else "SOME CHECKS FAILED")
raise SystemExit(0 if ok else 1)
