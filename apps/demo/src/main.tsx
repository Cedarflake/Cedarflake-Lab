import { StrictMode, type ChangeEvent, type MouseEvent as ReactMouseEvent, useId, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { Check, ChevronDown, Copy, Orbit, RotateCcw } from "lucide-react"

import {
  FocusOrbBackground,
  FocusOrbButton,
  focusOrbDefaultInteractionOptions,
  focusOrbDefaultMotionOptions,
  focusOrbDefaultRenderingOptions,
  focusOrbDefaultShaderOptions,
  focusOrbTextureUrl,
  type FocusOrbAudioInput,
  type FocusOrbColors,
  type FocusOrbFit,
  type FocusOrbRenderStatus,
  type FocusOrbState,
  type ResolvedFocusOrbInteractionOptions,
  type ResolvedFocusOrbMotionOptions,
  type ResolvedFocusOrbRenderingOptions,
  type ResolvedFocusOrbShaderOptions,
} from "@igcrystal/focus-orb"

import { texturePresets, type TextureChoice } from "./texturePresets"

import "@igcrystal/focus-orb/style.css"

import "./styles.css"

type PreviewMode = "button" | "background"
type MotionControlKey = Extract<keyof ResolvedFocusOrbMotionOptions, string>
type ShaderControlKey = Extract<keyof ResolvedFocusOrbShaderOptions, string>
type InteractionControlKey = Extract<keyof ResolvedFocusOrbInteractionOptions, string>
type RenderingNumberKey = "canvasSize" | "maxCanvasSize" | "pixelRatioCap"
type AudioControlKey = "avgMag0" | "avgMag1" | "avgMag2" | "avgMag3" | "micLevel"

interface PalettePreset {
  name: string
  colors: FocusOrbColors
}

interface SliderDefinition<Key extends string> {
  key: Key
  label: string
  max: number
  min: number
  step: number
}

interface RangeControlProps {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}

interface SliderStackProps<Key extends string> {
  definitions: readonly SliderDefinition<Key>[]
  onChange: (key: Key, value: number) => void
  values: { [Property in Key]: number }
}

interface ControlSummaryProps {
  label: string
  onReset: () => void
  resetLabel: string
}

interface RenderingControls
  extends Pick<ResolvedFocusOrbRenderingOptions, "antialias" | "canvasSize" | "maxCanvasSize" | "pixelRatioCap" | "premultipliedAlpha"> {}

const fallbackPalette: PalettePreset = {
  name: "Aqua",
  colors: {
    high: "#fffdef",
    low: "#0181fe",
    main: "#dcf7ff",
    mid: "#a4efff",
  },
}

const palettePresets: PalettePreset[] = [
  fallbackPalette,
  {
    name: "Signal",
    colors: {
      high: "#f8ffe8",
      low: "#0057ff",
      main: "#c9fff2",
      mid: "#7df7cf",
    },
  },
  {
    name: "Ember",
    colors: {
      high: "#fff5d6",
      low: "#5a2cff",
      main: "#ffe1ca",
      mid: "#ff9277",
    },
  },
]

const defaultAudioControls: Record<AudioControlKey, number> = {
  avgMag0: 0.28,
  avgMag1: 0.24,
  avgMag2: 0.2,
  avgMag3: 0.32,
  micLevel: 0.18,
}

const defaultRenderingControls: RenderingControls = {
  antialias: focusOrbDefaultRenderingOptions.antialias,
  canvasSize: focusOrbDefaultRenderingOptions.canvasSize,
  maxCanvasSize: focusOrbDefaultRenderingOptions.maxCanvasSize,
  pixelRatioCap: focusOrbDefaultRenderingOptions.pixelRatioCap,
  premultipliedAlpha: focusOrbDefaultRenderingOptions.premultipliedAlpha,
}

const essentialMotionControls = [
  { key: "intensity", label: "Intensity", max: 1.8, min: 0.2, step: 0.01 },
  { key: "timeScale", label: "Time scale", max: 2.2, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<MotionControlKey>[]

const advancedMotionControls = [
  { key: "hoverEase", label: "Hover ease", max: 0.4, min: 0.01, step: 0.01 },
  { key: "pressEase", label: "Press ease", max: 0.5, min: 0.01, step: 0.01 },
  { key: "voiceSpeedA", label: "Voice speed A", max: 5, min: 0, step: 0.01 },
  { key: "voiceSpeedB", label: "Voice speed B", max: 5, min: 0, step: 0.01 },
  { key: "voiceSpeedC", label: "Voice speed C", max: 5, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<MotionControlKey>[]

const interactionControls = [
  { key: "hoverScale", label: "Hover scale", max: 1.12, min: 1, step: 0.001 },
  { key: "pressedScale", label: "Pressed scale", max: 1, min: 0.9, step: 0.001 },
  { key: "transitionMs", label: "Transition", max: 900, min: 0, step: 10 },
] satisfies readonly SliderDefinition<InteractionControlKey>[]

const renderingControls = [
  { key: "canvasSize", label: "Canvas size", max: 768, min: 160, step: 1 },
  { key: "maxCanvasSize", label: "Max canvas size", max: 4096, min: 256, step: 1 },
  { key: "pixelRatioCap", label: "Pixel ratio cap", max: 4, min: 0.5, step: 0.1 },
] satisfies readonly SliderDefinition<RenderingNumberKey>[]

const audioControls = [
  { key: "micLevel", label: "Mic level", max: 1, min: 0, step: 0.01 },
  { key: "avgMag0", label: "Band 0", max: 1, min: 0, step: 0.01 },
  { key: "avgMag1", label: "Band 1", max: 1, min: 0, step: 0.01 },
  { key: "avgMag2", label: "Band 2", max: 1, min: 0, step: 0.01 },
  { key: "avgMag3", label: "Band 3", max: 1, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<AudioControlKey>[]

const shaderShapeControls = [
  { key: "mainRadius", label: "Main radius", max: 0.8, min: 0.1, step: 0.001 },
  { key: "listenRadius", label: "Listen radius", max: 0.8, min: 0.1, step: 0.001 },
  { key: "speakRadius", label: "Speak radius", max: 0.8, min: 0.1, step: 0.001 },
  { key: "micRadiusBoost", label: "Mic radius boost", max: 0.2, min: 0, step: 0.001 },
  { key: "originX", label: "Origin X", max: 1, min: 0, step: 0.001 },
  { key: "originY", label: "Origin Y", max: 1, min: 0, step: 0.001 },
  { key: "rotation", label: "Rotation", max: 3.14, min: -3.14, step: 0.001 },
  { key: "verticalOffset", label: "Vertical offset", max: 0.3, min: -0.3, step: 0.001 },
  { key: "waveSpread", label: "Wave spread", max: 2.4, min: 0.2, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]

const shaderFlowControls = [
  { key: "displacement", label: "Displacement", max: 0.08, min: 0, step: 0.001 },
  { key: "oscillationPeriod", label: "Oscillation period", max: 12, min: 0.5, step: 0.01 },
  { key: "warpPower", label: "Warp power", max: 0.5, min: 0, step: 0.001 },
  { key: "noiseScale", label: "Noise scale", max: 4, min: 0.1, step: 0.01 },
  { key: "windSpeed", label: "Wind speed", max: 0.5, min: 0, step: 0.001 },
  { key: "timeScale", label: "Shader time scale", max: 2, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]

const shaderMaterialControls = [
  { key: "waterColorNoiseScale", label: "Watercolor scale", max: 48, min: 1, step: 0.1 },
  { key: "waterColorNoiseStrength", label: "Watercolor strength", max: 0.08, min: 0, step: 0.001 },
  { key: "textureNoiseStrength", label: "Texture grain", max: 0.24, min: 0, step: 0.001 },
  { key: "blurRadius", label: "Blur radius", max: 4, min: 0.1, step: 0.01 },
  { key: "edgeSoftness", label: "Edge softness", max: 0.04, min: 0.001, step: 0.0005 },
  { key: "fbmPowerDamping", label: "FBM damping", max: 1.5, min: 0.1, step: 0.01 },
  { key: "colorMixAmount", label: "Color mix", max: 1, min: 0, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]

const shaderLayerControls = [
  { key: "layer1Amplitude", label: "Layer 1 amplitude", max: 3, min: 0, step: 0.01 },
  { key: "layer1Frequency", label: "Layer 1 frequency", max: 4, min: 0.1, step: 0.01 },
  { key: "layer2Amplitude", label: "Layer 2 amplitude", max: 3, min: 0, step: 0.01 },
  { key: "layer2Frequency", label: "Layer 2 frequency", max: 4, min: 0.1, step: 0.01 },
  { key: "layer3Amplitude", label: "Layer 3 amplitude", max: 3, min: 0, step: 0.01 },
  { key: "layer3Frequency", label: "Layer 3 frequency", max: 4, min: 0.1, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]

const shaderTransitionControls = [
  { key: "idleSpringDamping", label: "Idle damping", max: 1, min: 0, step: 0.001 },
  { key: "stateSpringDamping", label: "State damping", max: 1, min: 0, step: 0.001 },
  { key: "idleTransitionDuration", label: "Idle duration", max: 6, min: 0.1, step: 0.01 },
  { key: "stateTransitionDuration", label: "State duration", max: 6, min: 0.1, step: 0.01 },
] satisfies readonly SliderDefinition<ShaderControlKey>[]

function RangeControl({ label, max, min, onChange, step, value }: RangeControlProps) {
  const id = useId()
  const precision = step >= 1 ? 0 : step < 0.001 ? 4 : step < 0.01 ? 3 : 2

  return (
    <label className="control" htmlFor={id}>
      <span className="control__row">
        <span className="control__label">{label}</span>
        <span className="control__value">{value.toFixed(precision)}</span>
      </span>
      <input
        id={id}
        max={max}
        min={min}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(Number(event.currentTarget.value))
        }}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}

function SliderStack<Key extends string>({ definitions, onChange, values }: SliderStackProps<Key>) {
  return (
    <div className="range-stack">
      {definitions.map((definition) => (
        <RangeControl
          key={definition.key}
          label={definition.label}
          max={definition.max}
          min={definition.min}
          onChange={(value) => {
            onChange(definition.key, value)
          }}
          step={definition.step}
          value={values[definition.key]}
        />
      ))}
    </div>
  )
}

function ControlSummary({ label, onReset, resetLabel }: ControlSummaryProps) {
  function resetWithoutToggle(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    onReset()
  }

  return (
    <summary>
      <span>{label}</span>
      <span className="control-disclosure__actions">
        <button
          aria-label={resetLabel}
          className="summary-reset-button"
          onClick={resetWithoutToggle}
          title={resetLabel}
          type="button"
        >
          <RotateCcw aria-hidden="true" className="summary-reset-button__icon" />
        </button>
        <ChevronDown aria-hidden="true" className="control-disclosure__icon" />
      </span>
    </summary>
  )
}

function DemoApp() {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("button")
  const [fit, setFit] = useState<FocusOrbFit>("contain")
  const [isActive, setIsActive] = useState(true)
  const [state, setState] = useState<FocusOrbState>("speak")
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [textureChoice, setTextureChoice] = useState<TextureChoice>("default")
  const [buttonSize, setButtonSize] = useState(256)
  const [buttonOrbScale, setButtonOrbScale] = useState(1)
  const [backgroundOrbScale, setBackgroundOrbScale] = useState(1)
  const [isPaused, setIsPaused] = useState(false)
  const [isManualAudio, setIsManualAudio] = useState(false)
  const [audio, setAudio] = useState<Record<AudioControlKey, number>>({ ...defaultAudioControls })
  const [interaction, setInteraction] = useState<ResolvedFocusOrbInteractionOptions>({
    ...focusOrbDefaultInteractionOptions,
  })
  const [motion, setMotion] = useState<ResolvedFocusOrbMotionOptions>({ ...focusOrbDefaultMotionOptions })
  const [rendering, setRendering] = useState<RenderingControls>({ ...defaultRenderingControls })
  const [shader, setShader] = useState<ResolvedFocusOrbShaderOptions>({ ...focusOrbDefaultShaderOptions })
  const [renderStatus, setRenderStatus] = useState<FocusOrbRenderStatus | null>(null)
  const [hasCopied, setHasCopied] = useState(false)
  const colors = palettePresets[paletteIndex]?.colors ?? fallbackPalette.colors
  const selectedTexturePreset = texturePresets.find((preset) => preset.id === textureChoice)
  const textureSrc = selectedTexturePreset?.src ?? focusOrbTextureUrl
  const resolvedAudio = useMemo<FocusOrbAudioInput | undefined>(
    () =>
      isManualAudio
        ? {
            avgMag: [audio.avgMag0, audio.avgMag1, audio.avgMag2, audio.avgMag3] as const,
            micLevel: audio.micLevel,
            simulated: false,
          }
        : undefined,
    [audio, isManualAudio],
  )
  const resolvedRendering = useMemo(
    () => ({
      antialias: rendering.antialias,
      canvasSize: rendering.canvasSize,
      maxCanvasSize: rendering.maxCanvasSize,
      pixelRatioCap: rendering.pixelRatioCap,
      premultipliedAlpha: rendering.premultipliedAlpha,
    }),
    [rendering],
  )
  const codeSample = useMemo(() => {
    const componentName = previewMode === "background" ? "FocusOrbBackground" : "FocusOrbButton"
    const sharedProps = {
      audio: resolvedAudio,
      colors,
      fit,
      motion,
      paused: isPaused,
      rendering: resolvedRendering,
      shader,
      state,
      textureSrc,
    }
    const props =
      previewMode === "background"
        ? {
            ...sharedProps,
            orbScale: backgroundOrbScale,
          }
        : {
            ...sharedProps,
            height: buttonSize,
            interaction,
            orbScale: buttonOrbScale,
            width: buttonSize,
          }

    return `<${componentName}
  {...${JSON.stringify(props, null, 2).replace(/\n/g, "\n  ")}}
/>`
  }, [
    backgroundOrbScale,
    buttonSize,
    buttonOrbScale,
    colors,
    fit,
    interaction,
    isPaused,
    motion,
    previewMode,
    resolvedAudio,
    resolvedRendering,
    shader,
    state,
    textureSrc,
  ])

  function selectState(nextState: FocusOrbState) {
    setState(nextState)
    setIsActive(nextState === "speak")
  }

  function resetAllControls() {
    resetCommonControls()
    resetButtonControls()
    resetBackgroundControls()
    resetAdvancedControls()
    resetShaderControls()
  }

  function resetAppearanceControls() {
    setPaletteIndex(0)
    setTextureChoice("default")
  }

  function resetButtonControls() {
    setButtonSize(256)
    setButtonOrbScale(1)
    resetInteractionControls()
  }

  function resetBackgroundControls() {
    setBackgroundOrbScale(1)
  }

  function resetAudioControls() {
    setAudio({ ...defaultAudioControls })
    setIsManualAudio(false)
  }

  function resetInteractionControls() {
    setInteraction({ ...focusOrbDefaultInteractionOptions })
  }

  function resetCommonControls() {
    resetAppearanceControls()
    resetMotionControls(essentialMotionControls)
    setIsActive(true)
    setIsPaused(false)
    setPreviewMode("button")
    setState("speak")
  }

  function resetAdvancedControls() {
    setFit("contain")
    resetAudioControls()
    resetMotionControls(advancedMotionControls)
    resetRenderingControls()
  }

  function resetMotionControls(definitions?: readonly SliderDefinition<MotionControlKey>[]) {
    if (!definitions) {
      setMotion({ ...focusOrbDefaultMotionOptions })
      return
    }

    setMotion((current) => {
      const next = { ...current }

      for (const definition of definitions) {
        next[definition.key] = focusOrbDefaultMotionOptions[definition.key]
      }

      return next
    })
  }

  function resetRenderingControls() {
    setRendering({ ...defaultRenderingControls })
  }

  function resetShaderControls(definitions?: readonly SliderDefinition<ShaderControlKey>[]) {
    if (!definitions) {
      setShader({ ...focusOrbDefaultShaderOptions })
      return
    }

    setShader((current) => {
      const next = { ...current }

      for (const definition of definitions) {
        next[definition.key] = focusOrbDefaultShaderOptions[definition.key]
      }

      return next
    })
  }

  function copyCodeSample() {
    if (!navigator.clipboard) {
      return
    }

    void navigator.clipboard.writeText(codeSample).then(() => {
      setHasCopied(true)
      window.setTimeout(() => {
        setHasCopied(false)
      }, 1400)
    })
  }

  function updateAudio(key: AudioControlKey, value: number) {
    setAudio((current) => ({ ...current, [key]: value }))
  }

  function updateInteraction(key: InteractionControlKey, value: number) {
    setInteraction((current) => ({ ...current, [key]: value }))
  }

  function updateMotion(key: MotionControlKey, value: number) {
    setMotion((current) => ({ ...current, [key]: value }))
  }

  function updateRendering(key: RenderingNumberKey, value: number) {
    setRendering((current) => ({ ...current, [key]: value }))
  }

  function updateShader(key: ShaderControlKey, value: number) {
    setShader((current) => ({ ...current, [key]: value }))
  }

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#preview" aria-label="Focus Orb preview">
          <Orbit aria-hidden="true" className="brand__icon" />
          <span>Focus Orb</span>
        </a>
        <code className="install-command">pnpm add @igcrystal/focus-orb</code>
      </header>

      <section className="hero-section" id="preview" aria-labelledby="demo-title">
        <div className="hero-copy">
          <p className="eyebrow">React WebGL Component</p>
          <h1 id="demo-title">Focus Orb</h1>
          <p className="hero-copy__summary">Button or ambient background, tuned from the same canvas renderer.</p>
        </div>

        <div className="playground-grid">
          <section className="preview-panel" aria-label="Live component preview">
            <div className="preview-toolbar">
              <div className="segmented-control" aria-label="Preview mode">
                <button
                  aria-pressed={previewMode === "button"}
                  onClick={() => {
                    setPreviewMode("button")
                  }}
                  type="button"
                >
                  Button
                </button>
                <button
                  aria-pressed={previewMode === "background"}
                  onClick={() => {
                    setPreviewMode("background")
                  }}
                  type="button"
                >
                  Background
                </button>
              </div>
              <span className="status-pill">
                {renderStatus ? `${renderStatus.canvasWidth}x${renderStatus.canvasHeight}` : "loading"}
              </span>
            </div>

            <div className="preview-stage" data-mode={previewMode}>
              {previewMode === "button" ? (
                <FocusOrbButton
                  active={isActive}
                  ariaLabelActive="Exit focus mode"
                  ariaLabelInactive="Enter focus mode"
                  audio={resolvedAudio}
                  colors={colors}
                  fit={fit}
                  height={buttonSize}
                  interaction={interaction}
                  motion={motion}
                  onActiveChange={(nextActive) => {
                    setIsActive(nextActive)
                    setState(nextActive ? "speak" : "listen")
                  }}
                  onRenderComplete={setRenderStatus}
                  orbScale={buttonOrbScale}
                  paused={isPaused}
                  rendering={resolvedRendering}
                  shader={shader}
                  state={state}
                  textureSrc={textureSrc}
                  width={buttonSize}
                />
              ) : (
                <div className="background-preview">
                  <FocusOrbBackground
                    className="background-preview__orb"
                    audio={resolvedAudio}
                    colors={colors}
                    fit={fit}
                    motion={motion}
                    onRenderComplete={setRenderStatus}
                    orbScale={backgroundOrbScale}
                    paused={isPaused}
                    rendering={resolvedRendering}
                    shader={shader}
                    state={state}
                    textureSrc={textureSrc}
                  />
                  <div className="background-preview__content">
                    <span className="background-preview__label">Focus session</span>
                    <strong>28:40</strong>
                    <span>{state === "speak" ? "Speaking" : "Listening"}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="control-panel" aria-label="Focus Orb controls">
            <div className="control-panel__toolbar">
              <span>Controls</span>
              <button className="reset-button reset-button--strong" onClick={resetAllControls} type="button">
                <RotateCcw aria-hidden="true" className="reset-button__icon" />
                Reset all
              </button>
            </div>

            <details className="control-disclosure" open>
              <ControlSummary label="Common" onReset={resetCommonControls} resetLabel="Reset Common" />
              <div className="control-group">
                <span className="group-label">Variant</span>
                <div className="segmented-control" aria-label="Preview variant">
                  <button
                    aria-pressed={previewMode === "button"}
                    onClick={() => {
                      setPreviewMode("button")
                    }}
                    type="button"
                  >
                    Button
                  </button>
                  <button
                    aria-pressed={previewMode === "background"}
                    onClick={() => {
                      setPreviewMode("background")
                    }}
                    type="button"
                  >
                    Background
                  </button>
                </div>
              </div>

              <div className="control-group">
                <span className="group-label">State</span>
                <div className="segmented-control" aria-label="Orb state">
                  <button
                    aria-pressed={state === "speak"}
                    onClick={() => {
                      selectState("speak")
                    }}
                    type="button"
                  >
                    Speak
                  </button>
                  <button
                    aria-pressed={state === "listen"}
                    onClick={() => {
                      selectState("listen")
                    }}
                    type="button"
                  >
                    Listen
                  </button>
                </div>
              </div>

              <div className="palette-list" aria-label="Color palette">
                {palettePresets.map((palette, index) => (
                  <button
                    aria-pressed={paletteIndex === index}
                    className="palette-button"
                    key={palette.name}
                    onClick={() => {
                      setPaletteIndex(index)
                    }}
                    type="button"
                  >
                    <span className="palette-button__swatches" aria-hidden="true">
                      <span style={{ background: palette.colors.main }} />
                      <span style={{ background: palette.colors.low }} />
                      <span style={{ background: palette.colors.mid }} />
                      <span style={{ background: palette.colors.high }} />
                    </span>
                    <span>{palette.name}</span>
                  </button>
                ))}
              </div>

              <div className="control-group">
                <span className="group-label">Texture</span>
                <div className="texture-list" aria-label="Texture preset">
                  {texturePresets.map((preset) => (
                    <button
                      aria-pressed={textureChoice === preset.id}
                      className="texture-button"
                      key={preset.id}
                      onClick={() => {
                        setTextureChoice(preset.id)
                      }}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="texture-button__preview"
                        style={{ backgroundImage: `url(${preset.src})` }}
                      />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <SliderStack definitions={essentialMotionControls} onChange={updateMotion} values={motion} />
              <label className="toggle-control">
                <input
                  checked={isPaused}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setIsPaused(event.currentTarget.checked)
                  }}
                  type="checkbox"
                />
                <span>Pause animation</span>
              </label>
            </details>

            {previewMode === "button" ? (
              <details className="control-disclosure" open>
                <ControlSummary label="Button only" onReset={resetButtonControls} resetLabel="Reset Button" />
                <div className="range-stack">
                  <RangeControl label="Button size" max={340} min={160} onChange={setButtonSize} step={1} value={buttonSize} />
                  <RangeControl
                    label="Button orb scale"
                    max={1.45}
                    min={0.72}
                    onChange={setButtonOrbScale}
                    step={0.01}
                    value={buttonOrbScale}
                  />
                </div>
                <div className="control-group">
                  <span className="group-label">Interaction</span>
                  <SliderStack definitions={interactionControls} onChange={updateInteraction} values={interaction} />
                </div>
              </details>
            ) : (
              <details className="control-disclosure" open>
                <ControlSummary label="Background only" onReset={resetBackgroundControls} resetLabel="Reset Background" />
                <RangeControl
                  label="Background orb scale"
                  max={2.8}
                  min={0.6}
                  onChange={setBackgroundOrbScale}
                  step={0.01}
                  value={backgroundOrbScale}
                />
              </details>
            )}

            <details className="control-disclosure">
              <ControlSummary label="Advanced" onReset={resetAdvancedControls} resetLabel="Reset Advanced" />
              <div className="control-group">
                <span className="group-label">Fit</span>
                <div className="segmented-control" aria-label="Orb fit">
                  <button
                    aria-pressed={fit === "contain"}
                    onClick={() => {
                      setFit("contain")
                    }}
                    type="button"
                  >
                    Contain
                  </button>
                  <button
                    aria-pressed={fit === "cover"}
                    onClick={() => {
                      setFit("cover")
                    }}
                    type="button"
                  >
                    Cover
                  </button>
                </div>
              </div>

              <div className="control-group">
                <span className="group-label">Motion response</span>
                <SliderStack definitions={advancedMotionControls} onChange={updateMotion} values={motion} />
              </div>

              <div className="control-group">
                <span className="group-label">Manual audio</span>
                <label className="toggle-control">
                  <input
                    checked={isManualAudio}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setIsManualAudio(event.currentTarget.checked)
                    }}
                    type="checkbox"
                  />
                  <span>Use manual audio input</span>
                </label>
                <SliderStack definitions={audioControls} onChange={updateAudio} values={audio} />
              </div>

              <div className="control-group">
                <span className="group-label">Rendering</span>
                <SliderStack definitions={renderingControls} onChange={updateRendering} values={rendering} />
                <label className="toggle-control">
                  <input
                    checked={rendering.antialias}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setRendering((current) => ({ ...current, antialias: event.currentTarget.checked }))
                    }}
                    type="checkbox"
                  />
                  <span>Antialias</span>
                </label>
                <label className="toggle-control">
                  <input
                    checked={rendering.premultipliedAlpha}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setRendering((current) => ({ ...current, premultipliedAlpha: event.currentTarget.checked }))
                    }}
                    type="checkbox"
                  />
                  <span>Premultiplied alpha</span>
                </label>
              </div>
            </details>

            <details className="control-disclosure">
              <ControlSummary label="Shader Lab" onReset={() => resetShaderControls()} resetLabel="Reset Shader Lab" />
              <details className="control-subsection">
                <ControlSummary
                  label="Shape"
                  onReset={() => {
                    resetShaderControls(shaderShapeControls)
                  }}
                  resetLabel="Reset Shader Shape"
                />
                <SliderStack definitions={shaderShapeControls} onChange={updateShader} values={shader} />
              </details>

              <details className="control-subsection">
                <ControlSummary
                  label="Flow"
                  onReset={() => {
                    resetShaderControls(shaderFlowControls)
                  }}
                  resetLabel="Reset Shader Flow"
                />
                <SliderStack definitions={shaderFlowControls} onChange={updateShader} values={shader} />
              </details>

              <details className="control-subsection">
                <ControlSummary
                  label="Material"
                  onReset={() => {
                    resetShaderControls(shaderMaterialControls)
                  }}
                  resetLabel="Reset Shader Material"
                />
                <SliderStack definitions={shaderMaterialControls} onChange={updateShader} values={shader} />
              </details>

              <details className="control-subsection">
                <ControlSummary
                  label="Layers"
                  onReset={() => {
                    resetShaderControls(shaderLayerControls)
                  }}
                  resetLabel="Reset Shader Layers"
                />
                <SliderStack definitions={shaderLayerControls} onChange={updateShader} values={shader} />
              </details>

              <details className="control-subsection">
                <ControlSummary
                  label="Transitions"
                  onReset={() => {
                    resetShaderControls(shaderTransitionControls)
                  }}
                  resetLabel="Reset Shader Transitions"
                />
                <SliderStack definitions={shaderTransitionControls} onChange={updateShader} values={shader} />
              </details>
            </details>
          </aside>
        </div>
      </section>

      <section className="details-section" aria-label="Usage details">
        <div className="code-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Current Props</p>
              <h2>Live code</h2>
            </div>
          </div>
          <div className="code-block-shell">
            <button
              aria-label={hasCopied ? "Copied" : "Copy code"}
              className="copy-button"
              onClick={copyCodeSample}
              title={hasCopied ? "Copied" : "Copy code"}
              type="button"
            >
              {hasCopied ? (
                <Check aria-hidden="true" className="copy-button__icon" />
              ) : (
                <Copy aria-hidden="true" className="copy-button__icon" />
              )}
            </button>
            <pre>
              <code>{codeSample}</code>
            </pre>
          </div>
        </div>

        <div className="api-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Adjustable Groups</p>
              <h2>Package API</h2>
            </div>
          </div>
          <dl className="api-list">
            <div>
              <dt>Shared surface</dt>
              <dd>colors, width, height, fit, orbScale, textureSrc, className, style</dd>
            </div>
            <div>
              <dt>Shared renderer</dt>
              <dd>state, paused, audio, motion, rendering, shader, onRenderComplete, onError</dd>
            </div>
            <div>
              <dt>Button only</dt>
              <dd>active, defaultActive, interaction, ariaLabelActive, ariaLabelInactive, onActiveChange</dd>
            </div>
            <div>
              <dt>Background only</dt>
              <dd>ariaHidden, interactive, background container events</dd>
            </div>
            <div>
              <dt>Shader groups</dt>
              <dd>shape, flow, material, wave layer, and transition uniforms</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  )
}

const root = document.querySelector("#root")

if (!root) {
  throw new Error("Root element not found")
}

createRoot(root).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
)
