/**
 * preview/main.js
 *
 * Standalone vanilla-JS implementation of the WaterfallHero rendering engine.
 * Mirrors waterfall-engine.ts exactly so the preview matches the Framer component.
 *
 * To load your own rtl_power data, uncomment and update the fetch() block below.
 */

"use strict"

// ── Color LUT builder ──────────────────────────────────────────────────────────

function buildLUT(stops) {
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    const pos = t * (stops.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(lo + 1, stops.length - 1)
    const f = pos - lo
    lut[i * 3]     = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f)
    lut[i * 3 + 1] = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f)
    lut[i * 3 + 2] = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f)
  }
  return lut
}

const COLOR_MAPS = {
  viridis: buildLUT([
    [68,1,84],[72,40,120],[62,74,137],[49,104,142],
    [38,130,142],[31,158,137],[53,183,121],[110,206,88],
    [181,222,43],[253,231,37],
  ]),
  inferno: buildLUT([
    [0,0,4],[40,11,84],[101,21,110],[159,42,99],
    [212,72,66],[245,125,21],[250,193,39],[252,255,164],
  ]),
  plasma: buildLUT([
    [13,8,135],[75,3,161],[125,3,168],[168,34,150],
    [203,70,121],[229,107,93],[248,148,65],[253,195,40],
    [240,249,33],
  ]),
  magma: buildLUT([
    [0,0,4],[28,16,68],[79,18,123],[129,37,129],
    [181,54,122],[229,80,100],[251,135,97],[254,194,135],
    [252,253,191],
  ]),
}

const SCHEME_KEYS = Object.keys(COLOR_MAPS)
const activeScheme = SCHEME_KEYS[Math.floor(Math.random() * SCHEME_KEYS.length)]
let LUT = COLOR_MAPS[activeScheme]

document.getElementById("scheme-badge").textContent = activeScheme

// ── rtl_power CSV parser ───────────────────────────────────────────────────────

function parseRtlPowerCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  const allRows = []
  let bins = []
  let firstFreq = null
  let dbMin = Infinity
  let dbMax = -Infinity

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const parts = trimmed.split(",")
    if (parts.length < 7) continue

    const freqLow = parseFloat(parts[2])
    if (isNaN(freqLow)) continue

    if (firstFreq === null) {
      firstFreq = freqLow
    } else if (Math.abs(freqLow - firstFreq) < 0.5 && bins.length > 0) {
      allRows.push(new Float32Array(bins))
      bins = []
    }

    for (let i = 6; i < parts.length; i++) {
      const db = parseFloat(parts[i])
      if (isFinite(db)) {
        bins.push(db)
        if (db < dbMin) dbMin = db
        if (db > dbMax) dbMax = db
      }
    }
  }

  if (bins.length > 0) allRows.push(new Float32Array(bins))
  if (!isFinite(dbMin)) dbMin = -90
  if (!isFinite(dbMax)) dbMax = -55

  return { rows: allRows, dbRange: [dbMin, dbMax] }
}

function interpolateRow(src, targetCols) {
  const out = new Float32Array(targetCols)
  const n = src.length
  if (!n) return out
  if (n === 1) { out.fill(src[0]); return out }
  for (let f = 0; f < targetCols; f++) {
    const pos = (f / (targetCols - 1)) * (n - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(lo + 1, n - 1)
    out[f] = src[lo] + (src[hi] - src[lo]) * (pos - lo)
  }
  return out
}

// ── Synthetic 2.4 GHz Bluetooth-band signals ──────────────────────────────────

const DB_MIN = -90
const DB_MAX = -55

const SIGNALS = [
  // WiFi channels
  { freq: 0.141, str: 18, w: 0.118, dr: 0.01 },
  { freq: 0.435, str: 22, w: 0.118, dr: 0.01 },
  { freq: 0.729, str: 16, w: 0.118, dr: 0.01 },
  // BLE advertising (pulsing)
  { freq: 0.024, str: 24, w: 0.014, dr: 0.05, pulse: 0.30 },
  { freq: 0.306, str: 24, w: 0.014, dr: 0.05, pulse: 0.25 },
  { freq: 0.941, str: 24, w: 0.014, dr: 0.05, pulse: 0.28 },
  // Bluetooth Classic (fast-hopping)
  { freq: 0.20, str: 10, w: 0.009, dr: 2.2 },
  { freq: 0.50, str: 10, w: 0.009, dr: 3.1 },
  { freq: 0.68, str:  9, w: 0.009, dr: 1.9 },
  { freq: 0.83, str:  8, w: 0.009, dr: 2.7 },
]

function genRow(t, cols) {
  const row = new Float32Array(cols)
  for (let f = 0; f < cols; f++) {
    const fn = f / cols
    let dB = -83
      + (Math.random() - 0.5) * 5
      + Math.sin(fn * 12 + t * 0.15) * 1.8
      + Math.sin(fn * 38 + t * 0.08) * 0.8

    if (fn >= 0.02 && fn <= 0.95) {
      dB += 2.5 + Math.sin(fn * 60 + t * 3.5) * 1.5
    }

    for (const s of SIGNALS) {
      const driftAmp = s.dr > 1 ? 0.06 : 0.003
      const fp = s.freq + Math.sin(t * s.dr * 0.012) * driftAmp
      const dist = fn - fp
      if (Math.abs(dist) < s.w * 4.5) {
        let p = Math.exp(-0.5 * (dist / s.w) ** 2) * s.str
        p *= s.pulse
          ? 0.5 + 0.5 * Math.abs(Math.sin(t * s.pulse * 0.1))
          : 0.88 + Math.sin(t * s.dr * 0.07) * 0.12
        dB += p
      }
    }

    row[f] = dB
  }
  return row
}

// ── Data state ─────────────────────────────────────────────────────────────────

let parsedData = null
let dataIdx = 0
let dbRange = [DB_MIN, DB_MAX]

// To load real rtl_power data, uncomment and update the URL below.
// The server must return: Access-Control-Allow-Origin: *
//
// fetch("https://your-host.example.com/data.csv")
//   .then(r => { if (!r.ok) throw new Error(r.statusText); return r.text() })
//   .then(text => {
//     parsedData = parseRtlPowerCSV(text)
//     dbRange = parsedData.dbRange
//     imgData = null  // force canvas reinit with the real dB range
//   })
//   .catch(err => console.warn("CSV load failed, using synthetic data:", err))

// ── Canvas & animation ─────────────────────────────────────────────────────────

const canvas = document.getElementById("wf")
let imgData = null
let t = 0
let acc = 0
const SPEED = 30 // rows / second

function sizeCanvas() {
  canvas.width  = canvas.offsetWidth
  canvas.height = canvas.offsetHeight
  imgData = null
}

new ResizeObserver(sizeCanvas).observe(canvas)
sizeCanvas()

function frame() {
  const ctx = canvas.getContext("2d")
  const W = canvas.width
  const H = canvas.height
  if (!W || !H) { requestAnimationFrame(frame); return }

  if (!imgData || imgData.width !== W || imgData.height !== H) {
    imgData = ctx.createImageData(W, H)
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i] = LUT[0]; imgData.data[i + 1] = LUT[1]
      imgData.data[i + 2] = LUT[2]; imgData.data[i + 3] = 255
    }
  }

  acc += SPEED / 60
  const rows = Math.floor(acc)
  acc -= rows

  if (rows > 0) {
    imgData.data.copyWithin(0, W * 4 * rows)

    const [dbMin, dbMax] = dbRange
    const dbSpan = Math.max(1, dbMax - dbMin)

    for (let r = 0; r < rows; r++) {
      let row
      if (parsedData && parsedData.rows.length > 0) {
        row = interpolateRow(parsedData.rows[dataIdx % parsedData.rows.length], W)
        dataIdx++
      } else {
        row = genRow(t++, W)
      }

      const base = (H - rows + r) * W * 4
      for (let f = 0; f < W; f++) {
        const norm = Math.max(0, Math.min(1, (row[f] - dbMin) / dbSpan))
        const li = Math.round(norm * 255) * 3
        const pi = base + f * 4
        imgData.data[pi] = LUT[li]
        imgData.data[pi + 1] = LUT[li + 1]
        imgData.data[pi + 2] = LUT[li + 2]
        imgData.data[pi + 3] = 255
      }
    }

    ctx.putImageData(imgData, 0, 0)
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

// ── Live clock ─────────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date()
  document.getElementById("ts-time").textContent = now.toTimeString().slice(0, 8)
  document.getElementById("ts-date").textContent =
    now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()
}

updateClock()
setInterval(updateClock, 1000)
