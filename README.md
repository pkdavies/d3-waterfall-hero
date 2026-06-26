# d3-waterfall-hero

An animated RF waterfall spectrogram hero banner for [Framer](https://www.framer.com/), built on top of the original [d3-waterfall](https://github.com/pa7/d3-waterfall) library.

The component renders a live-scrolling waterfall of either **real rtl_power CSV data** or synthetic signals modelling the 2.4 GHz Bluetooth/WiFi band, with a text overlay, corner vignette, and live clock — all configurable from Framer's property panel.

---

## Framer Component

### Files

Two TypeScript files must be present in Framer's code panel (Assets → Code):

| File | Purpose |
|------|---------|
| `waterfall-engine.ts` | Color LUTs, rtl_power CSV parser, synthetic data generator |
| `WaterfallHero.tsx` | React component, layout, property controls |

> **Note on CSS**: Framer components use React inline styles (`style={{}}`). There is no external stylesheet to import — all visual styles live inside `WaterfallHero.tsx`.

### Setup

1. Open your Framer project → **Assets → Code → + Create code file**
2. Paste `waterfall-engine.ts` into the first file
3. Create a second code file and paste `WaterfallHero.tsx`
4. Drop **WaterfallHero** onto any frame — it fills its container automatically

### Property controls

| Control | Default | Description |
|---------|---------|-------------|
| Headline | `"Frontier cyber and electromagnetic"` | Main `<h1>` text |
| Subheadline | `"R&D for critical missions"` | Uppercase overline above the headline |
| Body | (long text) | Body paragraph below the headline |
| Show Buttons | `true` | Toggle CTA button visibility |
| Primary CTA | `"Explore Our Technology"` | Filled accent-colour button |
| Secondary CTA | `"Talk to Our Team"` | Outlined ghost button |
| Live Clock | `true` | HH:MM:SS + date displayed top-right |
| **Color Scheme** | `Random on load` | viridis · inferno · plasma · magma — or random each page load |
| **Data URL** | `""` | URL of an rtl_power CSV file (see below) |
| Scroll Speed | `30` | Rows per second (1–120) |
| Vignette | `0.75` | Corner/edge darkness (0 = off, 1 = opaque) |
| Vignette Color | `#000000` | Base colour of the vignette gradient |
| Text Color | `#ffffff` | Body text, secondary button, date |
| Accent Color | `#00d4ff` | Clock, overline, primary button background |

---

## Real CSV Data

### Capturing data with rtl_power

The component natively reads the CSV format produced by [`rtl_power`](https://github.com/keenerd/rtl-sdr).

```sh
# 2.4 GHz band, 1 MHz steps, 10 s integration, 50 dB gain, run for 1 hour
rtl_power -f 2400M:2485M:1M -i 10 -g 50 -e 1h data.csv
```

Set the **Data URL** property to a publicly accessible URL pointing to this file.

### CSV row format

```
date, time, freq_low_hz, freq_high_hz, freq_step_hz, num_samples, dB0, dB1, …
```

Wide-band captures that span multiple frequency chunks per timestamp are supported — chunks are automatically concatenated into a single time-step per sweep.

### CORS requirement

The CSV host must return the header `Access-Control-Allow-Origin: *`.  
GitHub Pages, Cloudflare Pages, and most static file hosts include this by default.

---

## Synthetic Fallback (2.4 GHz Bluetooth Band)

Without a Data URL the component generates procedural data modelling the 2400–2485 MHz band:

| Signal type | Frequency | Appearance |
|-------------|-----------|------------|
| WiFi ch1 | 2412 MHz | Wide ~20 MHz stable blob |
| WiFi ch6 | 2437 MHz | Wide ~20 MHz stable blob |
| WiFi ch11 | 2462 MHz | Wide ~20 MHz stable blob |
| BLE adv ch37 | 2402 MHz | Narrow pulsing peak |
| BLE adv ch38 | 2426 MHz | Narrow pulsing peak |
| BLE adv ch39 | 2480 MHz | Narrow pulsing peak |
| BT Classic | spread | Fast-hopping narrow-band signals |

---

## Standalone Preview

Open `preview/index.html` in any browser — no build step, no dependencies.

To load your own CSV data, uncomment and update the `fetch()` block in `preview/main.js`.

```
preview/
  index.html   – page structure only
  style.css    – all visual styles
  main.js      – rendering engine (mirrors waterfall-engine.ts in plain JS)
```

---

## Original Library (`src/waterfall.js`)

**d3-waterfall** is a [spectrogram / waterfall display](https://en.wikipedia.org/wiki/Spectrogram) for the web, built with [d3.js v4](https://github.com/d3/d3) and the HTML5 `<canvas>` element. It reads rtl_power CSV files and JSON signal annotations.

**Features:**
- Automatic frequency and time axis labelling
- Configurable colour schemes (default: Viridis)
- Annotated signal tooltips from [SIGIDWIKI](http://www.sigidwiki.com/) data
- Pan/zoom with `ImageBitmap` caching for fast redraws

### Usage

```html
<script src="https://d3js.org/d3.v4.min.js"></script>
<script src="waterfall.js"></script>

<div id="waterfall"></div>
<script>
  // animatable=true, selectable=true, zoomable=false
  var w = new Waterfall("#waterfall", "data.csv", "frequencies.json", true, true, false);
  getData(w, initDisplay);
</script>
```

See `example/index.html` for a working demo.  
You must supply your own `data.csv` (from `rtl_power`) and optionally `frequencies.json` (from `src/sigid_csv_to_json.py`).

### Generating signal annotations

The `src/sigid_csv_to_json.py` script converts the SIGIDWIKI `db.csv` export into the JSON annotation format expected by `waterfall.js`:

```sh
python src/sigid_csv_to_json.py
```

### Notes

- Strip unused CSV columns and update `parseRow()` in `waterfall.js` to reduce file size for web delivery.
- Pan/zoom performance relies on `createImageBitmap()` — the waterfall is cached as an `ImageBitmap` after the first full render.
- The canvas can be saved as PNG via `canvas.toDataURL("image/png")` — wired up in the example demo.
- Use the [keenerd/rtl-sdr](https://github.com/keenerd/rtl-sdr) fork of librtlsdr to avoid bugs in `rtl_power`.
