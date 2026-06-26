/**
 * WaterfallHero – animated RF waterfall hero banner for Framer
 *
 * Requires TWO files in Framer's code panel:
 *   1. waterfall-engine.ts  – color maps, CSV parser, synthetic data
 *   2. WaterfallHero.tsx    – this file (React component + property controls)
 *
 * DATA  Supply a URL to an rtl_power CSV file via the "Data URL" control.
 *       The server must return CORS headers (Access-Control-Allow-Origin: *).
 *       Without a URL the component renders synthetic 2.4 GHz Bluetooth data.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerDisableUnlink
 */

import React, {
    useEffect,
    useRef,
    useCallback,
    useState,
    CSSProperties,
} from "react"
import { addPropertyControls, ControlType } from "framer"
import {
    colorToRgb,
    COLOR_MAPS,
    SCHEME_KEYS,
    type SchemeKey,
    pickScheme,
    type ParsedData,
    parseRtlPowerCSV,
    interpolateRow,
    DB_MIN,
    DB_MAX,
    genRow,
} from "./waterfall-engine"

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
    headline: string
    subheadline: string
    bodyText: string
    ctaPrimaryLabel: string
    ctaSecondaryLabel: string
    showCTA: boolean
    showTimestamp: boolean
    colorScheme: "random" | SchemeKey
    dataURL: string
    scrollSpeed: number
    vignetteOpacity: number
    vignetteColor: string
    textColor: string
    accentColor: string
    style?: CSSProperties
}

export function WaterfallHero({
    headline = "Frontier cyber and electromagnetic",
    subheadline = "R&D for critical missions",
    bodyText = "Develop deployable AI, RF and cyber technologies that help critical organisations detect hidden threats, understand complex environments and act with confidence.",
    ctaPrimaryLabel = "Explore Our Technology",
    ctaSecondaryLabel = "Talk to Our Team",
    showCTA = true,
    showTimestamp = true,
    colorScheme = "random",
    dataURL = "",
    scrollSpeed = 30,
    vignetteOpacity = 0.75,
    vignetteColor = "#000000",
    textColor = "#ffffff",
    accentColor = "#00d4ff",
    style,
}: Props) {
    // ── Color scheme – locked in at mount; re-picked when prop changes ────────
    const [activeScheme, setActiveScheme] = useState<SchemeKey>(() => pickScheme(colorScheme))
    useEffect(() => { setActiveScheme(pickScheme(colorScheme)) }, [colorScheme])

    // ── Refs ──────────────────────────────────────────────────────────────────
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imgDataRef = useRef<ImageData | null>(null)
    const rafRef = useRef(0)
    const tRef = useRef(0)       // synthetic time counter
    const accRef = useRef(0)     // fractional-row accumulator
    const dataRef = useRef<ParsedData | null>(null)
    const dataIdxRef = useRef(0) // current row index in real data
    const dbRangeRef = useRef<[number, number]>([DB_MIN, DB_MAX])

    // ── Live clock ────────────────────────────────────────────────────────────
    const [now, setNow] = useState(() => new Date())
    useEffect(() => {
        if (!showTimestamp) return
        const id = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(id)
    }, [showTimestamp])

    // ── Fetch + parse rtl_power CSV ───────────────────────────────────────────
    useEffect(() => {
        if (!dataURL) {
            dataRef.current = null
            dbRangeRef.current = [DB_MIN, DB_MAX]
            imgDataRef.current = null
            return
        }
        fetch(dataURL)
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                return r.text()
            })
            .then(text => {
                const parsed = parseRtlPowerCSV(text)
                if (parsed.rows.length > 0) {
                    dataRef.current = parsed
                    dataIdxRef.current = 0
                    dbRangeRef.current = parsed.dbRange
                    imgDataRef.current = null
                }
            })
            .catch(() => { /* fall back to synthetic data */ })
    }, [dataURL])

    // ── Canvas resize observer ────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect
            canvas.width = Math.round(width)
            canvas.height = Math.round(height)
            imgDataRef.current = null
        })
        obs.observe(canvas)
        return () => obs.disconnect()
    }, [])

    // ── Animation loop ────────────────────────────────────────────────────────
    const animate = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const W = canvas.width
        const H = canvas.height
        if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(animate); return }

        const lut = COLOR_MAPS[activeScheme] ?? COLOR_MAPS.viridis
        const [dbMin, dbMax] = dbRangeRef.current
        const dbSpan = Math.max(1, dbMax - dbMin)

        // Lazy-init or reinit after resize / scheme change / data load
        if (!imgDataRef.current || imgDataRef.current.width !== W || imgDataRef.current.height !== H) {
            imgDataRef.current = ctx.createImageData(W, H)
            for (let i = 0; i < imgDataRef.current.data.length; i += 4) {
                imgDataRef.current.data[i] = lut[0]
                imgDataRef.current.data[i + 1] = lut[1]
                imgDataRef.current.data[i + 2] = lut[2]
                imgDataRef.current.data[i + 3] = 255
            }
        }

        const imgData = imgDataRef.current

        // Fractional accumulator decouples scroll speed from frame rate
        accRef.current += scrollSpeed / 60
        const rows = Math.floor(accRef.current)
        accRef.current -= rows

        if (rows > 0) {
            imgData.data.copyWithin(0, W * 4 * rows)

            for (let r = 0; r < rows; r++) {
                let row: Float32Array
                const data = dataRef.current

                if (data && data.rows.length > 0) {
                    row = interpolateRow(data.rows[dataIdxRef.current % data.rows.length], W)
                    dataIdxRef.current++
                } else {
                    row = genRow(tRef.current++, W)
                }

                const base = (H - rows + r) * W * 4
                for (let f = 0; f < W; f++) {
                    const norm = Math.max(0, Math.min(1, (row[f] - dbMin) / dbSpan))
                    const li = Math.round(norm * 255) * 3
                    const pi = base + f * 4
                    imgData.data[pi] = lut[li]
                    imgData.data[pi + 1] = lut[li + 1]
                    imgData.data[pi + 2] = lut[li + 2]
                    imgData.data[pi + 3] = 255
                }
            }

            ctx.putImageData(imgData, 0, 0)
        }

        rafRef.current = requestAnimationFrame(animate)
    }, [activeScheme, scrollSpeed])

    useEffect(() => {
        imgDataRef.current = null
        rafRef.current = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(rafRef.current)
    }, [animate])

    // ── Derived styles ────────────────────────────────────────────────────────

    const vc = colorToRgb(vignetteColor)
    const v = vignetteOpacity

    const vignetteStyle: CSSProperties = {
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: [
            `radial-gradient(ellipse 60% 75% at 0%   0%,   rgba(${vc},${(v * 0.9).toFixed(2)}) 0%, transparent 65%)`,
            `radial-gradient(ellipse 60% 75% at 100% 0%,   rgba(${vc},${(v * 0.9).toFixed(2)}) 0%, transparent 65%)`,
            `radial-gradient(ellipse 60% 75% at 0%   100%, rgba(${vc},${v.toFixed(2)}) 0%, transparent 65%)`,
            `radial-gradient(ellipse 60% 75% at 100% 100%, rgba(${vc},${v.toFixed(2)}) 0%, transparent 65%)`,
            `linear-gradient(to bottom, rgba(${vc},0.30) 0%, transparent 28%, transparent 52%, rgba(${vc},0.65) 100%)`,
        ].join(", "),
    }

    const padH = "clamp(32px, 6vw, 80px)"
    const padV = "clamp(36px, 6vh, 72px)"

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                backgroundColor: "#050508",
                ...style,
            }}
        >
            {/* Waterfall canvas */}
            <canvas
                ref={canvasRef}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
            />

            {/* Vignette */}
            <div style={vignetteStyle} />

            {/* Scan-line texture */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    backgroundImage:
                        "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.055) 3px, rgba(0,0,0,0.055) 4px)",
                }}
            />

            {/* Content */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    paddingTop: padV,
                    paddingBottom: padV,
                    paddingLeft: padH,
                    paddingRight: padH,
                }}
            >
                {/* Live clock – top right */}
                {showTimestamp && (
                    <div
                        style={{
                            position: "absolute",
                            top: padV,
                            right: padH,
                            fontFamily: "ui-monospace, 'SF Mono', 'Courier New', monospace",
                            textAlign: "right",
                            lineHeight: 1.5,
                            userSelect: "none",
                        }}
                    >
                        <div
                            style={{
                                fontSize: "clamp(13px, 1.3vw, 16px)",
                                fontWeight: 500,
                                letterSpacing: "0.1em",
                                color: accentColor,
                                opacity: 0.9,
                            }}
                        >
                            {now.toTimeString().slice(0, 8)}
                        </div>
                        <div
                            style={{
                                marginTop: 3,
                                fontSize: "clamp(10px, 0.95vw, 12px)",
                                letterSpacing: "0.07em",
                                color: textColor,
                                opacity: 0.4,
                            }}
                        >
                            {now
                                .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                                .toUpperCase()}
                        </div>
                    </div>
                )}

                {/* Text block – bottom left */}
                <div style={{ maxWidth: "min(600px, 58%)" }}>
                    {/* Overline */}
                    <div
                        style={{
                            marginBottom: 10,
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            fontSize: "clamp(10px, 1.0vw, 12px)",
                            fontWeight: 600,
                            letterSpacing: "0.22em",
                            textTransform: "uppercase",
                            color: accentColor,
                            userSelect: "none",
                        }}
                    >
                        {subheadline}
                    </div>

                    {/* Headline */}
                    <h1
                        style={{
                            margin: "0 0 18px",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            fontSize: "clamp(28px, 4.4vw, 62px)",
                            fontWeight: 700,
                            lineHeight: 1.07,
                            letterSpacing: "-0.025em",
                            color: textColor,
                            userSelect: "none",
                        }}
                    >
                        {headline}
                    </h1>

                    {/* Body */}
                    {bodyText && (
                        <p
                            style={{
                                margin: "0 0 28px",
                                fontFamily: "system-ui, -apple-system, sans-serif",
                                fontSize: "clamp(13px, 1.2vw, 16px)",
                                lineHeight: 1.65,
                                color: textColor,
                                opacity: 0.65,
                                maxWidth: 480,
                                userSelect: "none",
                            }}
                        >
                            {bodyText}
                        </p>
                    )}

                    {/* CTA buttons */}
                    {showCTA && (
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <button
                                style={{
                                    padding: "11px 22px",
                                    background: accentColor,
                                    color: "#000",
                                    border: "none",
                                    borderRadius: 3,
                                    fontFamily: "system-ui, -apple-system, sans-serif",
                                    fontSize: "clamp(11px, 1.0vw, 13px)",
                                    fontWeight: 600,
                                    letterSpacing: "0.05em",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {ctaPrimaryLabel}
                            </button>
                            <button
                                style={{
                                    padding: "10px 22px",
                                    background: "transparent",
                                    color: textColor,
                                    border: "1px solid rgba(255,255,255,0.30)",
                                    borderRadius: 3,
                                    fontFamily: "system-ui, -apple-system, sans-serif",
                                    fontSize: "clamp(11px, 1.0vw, 13px)",
                                    fontWeight: 500,
                                    letterSpacing: "0.05em",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {ctaSecondaryLabel}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Framer defaults ──────────────────────────────────────────────────────────

WaterfallHero.defaultProps = {
    headline: "Frontier cyber and electromagnetic",
    subheadline: "R&D for critical missions",
    bodyText:
        "Develop deployable AI, RF and cyber technologies that help critical organisations detect hidden threats, understand complex environments and act with confidence.",
    ctaPrimaryLabel: "Explore Our Technology",
    ctaSecondaryLabel: "Talk to Our Team",
    showCTA: true,
    showTimestamp: true,
    colorScheme: "random",
    dataURL: "",
    scrollSpeed: 30,
    vignetteOpacity: 0.75,
    vignetteColor: "#000000",
    textColor: "#ffffff",
    accentColor: "#00d4ff",
}

// ─── Framer property controls ─────────────────────────────────────────────────

addPropertyControls(WaterfallHero, {
    headline: {
        type: ControlType.String,
        title: "Headline",
        defaultValue: "Frontier cyber and electromagnetic",
    },
    subheadline: {
        type: ControlType.String,
        title: "Subheadline",
        defaultValue: "R&D for critical missions",
    },
    bodyText: {
        type: ControlType.String,
        title: "Body",
        displayTextArea: true,
        defaultValue:
            "Develop deployable AI, RF and cyber technologies that help critical organisations detect hidden threats, understand complex environments and act with confidence.",
    },
    showCTA: {
        type: ControlType.Boolean,
        title: "Show Buttons",
        defaultValue: true,
        enabledTitle: "Visible",
        disabledTitle: "Hidden",
    },
    ctaPrimaryLabel: {
        type: ControlType.String,
        title: "Primary CTA",
        defaultValue: "Explore Our Technology",
        hidden: (props: Props) => !props.showCTA,
    },
    ctaSecondaryLabel: {
        type: ControlType.String,
        title: "Secondary CTA",
        defaultValue: "Talk to Our Team",
        hidden: (props: Props) => !props.showCTA,
    },
    showTimestamp: {
        type: ControlType.Boolean,
        title: "Live Clock",
        defaultValue: true,
        enabledTitle: "Visible",
        disabledTitle: "Hidden",
    },
    colorScheme: {
        type: ControlType.Enum,
        title: "Color Scheme",
        options: ["random", "viridis", "inferno", "plasma", "magma"],
        optionTitles: ["Random on load", "Viridis", "Inferno", "Plasma", "Magma"],
        defaultValue: "random",
    },
    dataURL: {
        type: ControlType.String,
        title: "Data URL",
        placeholder: "https://…/data.csv",
        defaultValue: "",
        description: "rtl_power CSV — server must return CORS headers. Leave blank for synthetic data.",
    },
    scrollSpeed: {
        type: ControlType.Number,
        title: "Scroll Speed",
        min: 1,
        max: 120,
        step: 1,
        defaultValue: 30,
        description: "Rows per second",
    },
    vignetteOpacity: {
        type: ControlType.Number,
        title: "Vignette",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.75,
        description: "Corner / edge darkness (0 = off, 1 = opaque)",
    },
    vignetteColor: {
        type: ControlType.Color,
        title: "Vignette Color",
        defaultValue: "#000000",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text Color",
        defaultValue: "#ffffff",
    },
    accentColor: {
        type: ControlType.Color,
        title: "Accent Color",
        defaultValue: "#00d4ff",
    },
})
