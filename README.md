# Copper Value Calculator

**Live site:** https://mirasanalyst.github.io/copper-value-calculator/

Should a copper miner build a vanadium reductive-leach plant at the mine, or keep selling concentrate to a smelter? This one-page calculator answers that live, from feedstock to customer value:

**feedstock → process model → techno-economics (TEA) → carbon (LCA) → value vs. selling concentrate**

## What it does

- **Process model:** Cu, Fe, S, V, Au, Ag element balances and electron (charge) balances, closing within 0.1%. Vanadium(II) reductive leach on the chalcopyrite fraction, ferric leach, SX-EW. Electrical sizing from Faraday's law (current, power, electrode area, cells, rectifier).
- **TEA:** factored CAPEX with six-tenths scaling, benchmarked against public smelter costs; OPEX, by-product credits, after-tax cash flow, NPV, IRR, payback.
- **Customer baseline:** concentrate sale with payables, TC/RC, arsenic penalties, freight and export duty. The headline is the gain (or loss) versus that sale, and the break-even smelter charge.
- **Carbon:** t CO₂e per t copper by power source, compared with the smelter route.
- **Risk:** tornado chart, 2,000-run Monte Carlo, and an NPV heatmap over smelter charge × plant size.
- **Presenting mode:** press **P** (or open with `?present`) for large type when screen-sharing.

## Run it locally

Plain HTML and JavaScript; no build step.

```
python3 -m http.server 8000
# open http://localhost:8000
```

## Check the numbers

`validate.py` recomputes the default case independently in Python and compares it with the JavaScript engine (needs Node.js):

```
python3 validate.py
```

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout and styles |
| `app.js` | Inputs, charts, tabs, presenting mode |
| `engine.js` | Calculation engine (process, TEA, LCA, baseline, sensitivity) |
| `validate.py` | Independent Python cross-check |
| `img/` | Photos (credits below) |

## Scope and honesty

This is an independent study of a reductive-leach flowsheet built from published academic research and public press. It is not any company's model and uses no company data. Commercial flowsheets, costs and pilot data are not public; inputs marked "A" on the page are assumptions to be replaced with pilot and vendor data. Prices are as of late July 2026. Not investment advice.

## Photo credits

- Electrowinning plant, Arizona: Cornelius M. Keyes, US National Archives (public domain).
- Chalcopyrite: Didier Descouens, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- Copper cathode bundles: ChrisFountain, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

All via Wikimedia Commons.
