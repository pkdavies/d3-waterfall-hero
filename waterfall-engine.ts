/**
 * waterfall-engine.ts
 *
 * Pure rendering engine for WaterfallHero.tsx.
 * Contains color LUTs, the rtl_power CSV parser, linear interpolation,
 * and the synthetic 2.4 GHz Bluetooth-band data generator.
 *
 * This file has no React or Framer dependency and can be imported by any
 * TypeScript/JavaScript consumer.
 */

// ─── Color helpers ────────────────────────────────────────────────────────────

/** Parse any CSS color string into an `"r,g,b"` string for use in `rgba()`. */
export function colorToRgb(color: string): string {
    const rgba = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
    if (rgba) return `${rgba[1]},${rgba[2]},${rgba[3]}`
    const hex6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color)
    if (hex6)
        return `${parseInt(hex6[1], 16)},${parseInt(hex6[2], 16)},${parseInt(hex6[3], 16)}`
    const hex3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(color)
    if (hex3)
        return `${parseInt(hex3[1] + hex3[1], 16)},${parseInt(hex3[2] + hex3[2], 16)},${parseInt(hex3[3] + hex3[3], 16)}`
    return "0,0,0"
}

// ─── 256-entry RGB look-up tables (ported from d3-scale-chromatic) ────────────

function buildLUT(stops: number[][]): Uint8Array {
    const lut = new Uint8Array(256 * 3)
    for (let i = 0; i < 256; i++) {
        const t = i / 255
        const pos = t * (stops.length - 1)
        const lo = Math.floor(pos)
        const hi = Math.min(lo + 1, stops.length - 1)
        const f = pos - lo
        lut[i * 3] = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f)
        lut[i * 3 + 1] = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f)
        lut[i * 3 + 2] = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f)
    }
    return lut
}

export const COLOR_MAPS: Record<string, Uint8Array> = {
    viridis: buildLUT([
        [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
        [38, 130, 142], [31, 158, 137], [53, 183, 121], [110, 206, 88],
        [181, 222, 43], [253, 231, 37],
    ]),
    inferno: buildLUT([
        [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99],
        [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164],
    ]),
    plasma: buildLUT([
        [13, 8, 135], [75, 3, 161], [125, 3, 168], [168, 34, 150],
        [203, 70, 121], [229, 107, 93], [248, 148, 65], [253, 195, 40],
        [240, 249, 33],
    ]),
    magma: buildLUT([
        [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129],
        [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135],
        [252, 253, 191],
    ]),
}

export const SCHEME_KEYS = ["viridis", "inferno", "plasma", "magma"] as const
export type SchemeKey = (typeof SCHEME_KEYS)[number]

/** Return a specific scheme, or pick one at random when `s === "random"`. */
export function pickScheme(s: string): SchemeKey {
    if (s === "random") return SCHEME_KEYS[Math.floor(Math.random() * SCHEME_KEYS.length)]
    return s in COLOR_MAPS ? (s as SchemeKey) : "viridis"
}

// ─── rtl_power CSV parser ─────────────────────────────────────────────────────
//
// Expected row format (standard rtl_power output):
//   date, time, freq_low_hz, freq_high_hz, freq_step_hz, num_samples, dB0, dB1, …
//
// Wide-band scans that cover multiple frequency chunks per timestamp are
// automatically concatenated: a new time step begins whenever freq_low resets
// to the first frequency seen in the file.

export interface ParsedData {
    rows: Float32Array[]        // one entry per time step; each entry = all frequency bins
    dbRange: [number, number]   // [min, max] dB across the entire dataset
}

export function parseRtlPowerCSV(text: string): ParsedData {
    const lines = text.trim().split(/\r?\n/)
    const allRows: Float32Array[] = []
    let bins: number[] = []
    let firstFreq: number | null = null
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

    if (!isFinite(dbMin)) dbMin = DB_MIN
    if (!isFinite(dbMax)) dbMax = DB_MAX

    return { rows: allRows, dbRange: [dbMin, dbMax] }
}

/** Linearly resample a source row of dB values to a different pixel width. */
export function interpolateRow(src: Float32Array, targetCols: number): Float32Array {
    const out = new Float32Array(targetCols)
    const n = src.length
    if (n === 0) return out
    if (n === 1) { out.fill(src[0]); return out }
    for (let f = 0; f < targetCols; f++) {
        const pos = (f / (targetCols - 1)) * (n - 1)
        const lo = Math.floor(pos)
        const hi = Math.min(lo + 1, n - 1)
        out[f] = src[lo] + (src[hi] - src[lo]) * (pos - lo)
    }
    return out
}

// ─── Synthetic 2.4 GHz Bluetooth-band data ───────────────────────────────────
//
// Frequency axis normalised to 2400–2485 MHz (85 MHz span):
//
//   WiFi ch1   2412 MHz → 0.141    WiFi ch6  2437 MHz → 0.435
//   WiFi ch11  2462 MHz → 0.729
//   BLE adv37  2402 MHz → 0.024    BLE adv38 2426 MHz → 0.306
//   BLE adv39  2480 MHz → 0.941

interface SigDef {
    freq: number    // normalised centre frequency 0–1
    str: number     // peak above noise floor (dB)
    w: number       // Gaussian σ (normalised)
    dr: number      // drift rate (higher = faster hopping)
    pulse?: number  // if present, signal pulses at this rate
}

const SIGNALS: SigDef[] = [
    // WiFi 2.4 GHz — wide (~20 MHz), stable
    { freq: 0.141, str: 18, w: 0.118, dr: 0.01 },
    { freq: 0.435, str: 22, w: 0.118, dr: 0.01 },
    { freq: 0.729, str: 16, w: 0.118, dr: 0.01 },
    // BLE advertising channels — narrow, burst-pulsing
    { freq: 0.024, str: 24, w: 0.014, dr: 0.05, pulse: 0.30 },
    { freq: 0.306, str: 24, w: 0.014, dr: 0.05, pulse: 0.25 },
    { freq: 0.941, str: 24, w: 0.014, dr: 0.05, pulse: 0.28 },
    // Bluetooth Classic — narrow, fast-hopping
    { freq: 0.20, str: 10, w: 0.009, dr: 2.2 },
    { freq: 0.50, str: 10, w: 0.009, dr: 3.1 },
    { freq: 0.68, str:  9, w: 0.009, dr: 1.9 },
    { freq: 0.83, str:  8, w: 0.009, dr: 2.7 },
]

export const DB_MIN = -90
export const DB_MAX = -55

/** Generate one row of synthetic 2.4 GHz RF data for time step `t`. */
export function genRow(t: number, cols: number): Float32Array {
    const row = new Float32Array(cols)
    for (let f = 0; f < cols; f++) {
        const fn = f / cols
        let dB =
            -83 +
            (Math.random() - 0.5) * 5 +
            Math.sin(fn * 12 + t * 0.15) * 1.8 +
            Math.sin(fn * 38 + t * 0.08) * 0.8

        // Slightly elevated background from BT Classic hopping
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
