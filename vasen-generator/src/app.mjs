// Vasen-Generator 2: the page. Every change builds a quick preview at once (a few milliseconds, on the page
// itself); when the hand rests, the vase is built in the chosen fineness on a worker and takes its place.

import { buildVase } from './engine.mjs'
import { zip } from './export.mjs'
import { translator } from './i18n.mjs'
import { LAYER_DEFAULTS, MATERIALS, MAX_LAYERS, PATTERNS, PATTERN_PROFILES, PATTERN_STARTERS, PROFILES, SECTIONS, WAVE_STYLES, newLayer, normalizeParams } from './params.mjs'
import { PRESETS, randomVase } from './presets.mjs'
import { createRenderer } from './renderer.mjs'
import { profileCurve, profilePointsOf, radiusFunction } from './shape.mjs'
import { handle as handleHere } from './worker.mjs'
import WORKER_SOURCE from 'worker-source'

const STORE = 'vasen-generator-2'
const COLORS = ['#8fb3a5', '#f1ede4', '#d9d4c7', '#e0a83a', '#c9705e', '#3f7f73', '#5b6f95', '#2f3640', '#caa5c9', '#b98b55']
const $ = (selector, root = document) => root.querySelector(selector)

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attributes)) {
    if (value === false || value == null) continue
    if (key === 'text') node.textContent = value
    else if (key === 'class') node.className = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else if (key === 'value' || key === 'checked' || key === 'selected' || key === 'disabled' || key === 'hidden') node[key] = value
    else node.setAttribute(key, value === true ? '' : value)
  }
  for (const child of [].concat(children)) if (child) node.append(child)
  return node
}

const app = {
  params: normalizeParams({ ...PRESETS[0].params }),
  /** What a layer has beyond the core's settings: the text its relief is made from. Same order as params.layers. */
  texts: [''],
  color: PRESETS[0].color,
  language: 'de',
  showOverhang: false,
  showLayers: false,
  showCut: false,
  open: { shape: true, patterns: true },
  selectedPoint: -1,
  seed: 1,
}
let t = translator(app.language)
let renderer = null
let worker = null
let requestId = 0, shownId = 0
let frameTimer = 0, settleTimer = 0
let downloads = null
let lastFrame = ''

/* ------------------------------------------------------------------ */
/* Keeping and sharing the settings                                    */
/* ------------------------------------------------------------------ */

function settingsText() {
  const params = JSON.parse(JSON.stringify(app.params, (key, value) => (key === 'image' ? null : value)))
  return JSON.stringify({ vase: 2, params, texts: app.texts, color: app.color })
}

function applySettings(text) {
  const data = JSON.parse(text)
  if (!data || data.vase !== 2 || typeof data.params !== 'object') throw new Error('settings')
  app.params = normalizeParams(data.params)
  app.texts = app.params.layers.map((_, index) => String(data.texts?.[index] ?? '').slice(0, 60))
  if (typeof data.color === 'string' && /^#[0-9a-f]{6}$/i.test(data.color)) app.color = data.color
  app.selectedPoint = -1
}

function remember() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ settings: settingsText(), language: app.language, showOverhang: app.showOverhang, showLayers: app.showLayers }))
  } catch { /* a private window keeps nothing; the page works without */ }
}

function recall() {
  try {
    const kept = JSON.parse(localStorage.getItem(STORE) ?? 'null')
    if (!kept) return
    if (kept.language === 'en' || kept.language === 'de') app.language = kept.language
    app.showOverhang = Boolean(kept.showOverhang)
    app.showLayers = Boolean(kept.showLayers)
    applySettings(kept.settings)
  } catch { /* nothing kept, or not ours */ }
}

/* ------------------------------------------------------------------ */
/* Text as a relief                                                    */
/* ------------------------------------------------------------------ */

const textImages = new Map()

/** A text as a height map in the proportions of the place it goes to, so the letters keep their form. */
function textImage(text, aspect) {
  const key = `${text}|${aspect.toFixed(2)}`
  const known = textImages.get(key)
  if (known) return known
  const h = 160, w = Math.max(32, Math.min(1024, Math.round(h * aspect)))
  const canvas = element('canvas', { width: w, height: h })
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let size = h * 0.62
  ctx.font = `700 ${size}px "Space Grotesk", "Inter", system-ui, sans-serif`
  const measured = ctx.measureText(text).width
  if (measured > w * 0.9) size *= (w * 0.9) / measured
  ctx.font = `700 ${size}px "Space Grotesk", "Inter", system-ui, sans-serif`
  ctx.fillText(text, w / 2, h / 2)
  const image = heightMap(ctx.getImageData(0, 0, w, h), 2)
  if (textImages.size > 8) textImages.clear()
  textImages.set(key, image)
  return image
}

/** A picture's brightness as heights 0..1, smoothed a little so a letter's edge becomes a flank. */
function heightMap(pixels, blur) {
  const { width: w, height: h, data } = pixels
  let values = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) values[i] = ((0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255) * (data[i * 4 + 3] / 255)
  for (let pass = 0; pass < blur; pass++) {
    const next = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xa = x > 0 ? x - 1 : x, xb = x < w - 1 ? x + 1 : x, ya = y > 0 ? y - 1 : y, yb = y < h - 1 ? y + 1 : y
      next[y * w + x] = (values[y * w + x] * 4 + values[y * w + xa] + values[y * w + xb] + values[ya * w + x] + values[yb * w + x]) / 8
    }
    values = next
  }
  return { w, h, data: values }
}

function loadPicture(file, layerIndex) {
  const url = URL.createObjectURL(file)
  const picture = new Image()
  picture.onload = () => {
    const scale = Math.min(1, 512 / Math.max(picture.width, picture.height))
    const w = Math.max(1, Math.round(picture.width * scale)), h = Math.max(1, Math.round(picture.height * scale))
    const canvas = element('canvas', { width: w, height: h })
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(picture, 0, 0, w, h)
    URL.revokeObjectURL(url)
    const layer = app.params.layers[layerIndex]
    if (!layer) return
    layer.image = heightMap(ctx.getImageData(0, 0, w, h), 1)
    app.texts[layerIndex] = ''
    renderPanel()
    changed()
  }
  picture.onerror = () => URL.revokeObjectURL(url)
  picture.src = url
}

/** The settings as the core gets them: text layers with their height map made for where they sit. */
function buildParams() {
  const p = app.params
  const R = radiusFunction(p)
  p.layers.forEach((layer, index) => {
    const text = app.texts[index]
    if (layer.pattern !== 'image' || !text) return
    const middle = ((layer.from + layer.to) / 200) * p.height
    const cellWidth = (2 * Math.PI * R(middle)) / layer.count
    const cellHeight = layer.fit === 'once' ? ((layer.to - layer.from) / 100) * p.height : cellWidth * layer.aspect
    layer.image = textImage(text, Math.max(0.2, Math.min(6.4, cellWidth / Math.max(1, cellHeight))))
  })
  return p
}

/* ------------------------------------------------------------------ */
/* Building and showing                                                */
/* ------------------------------------------------------------------ */

function hexColor(hex) {
  const n = parseInt(hex.slice(1), 16)
  // The shader works in light, the colour field in what the eye sees.
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2))
}

function cssColor(name) {
  const probe = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const match = /^#([0-9a-f]{6})$/i.exec(probe)
  if (!match) return [0.5, 0.5, 0.5]
  const n = parseInt(match[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function show(mesh, preview) {
  if (renderer) {
    renderer.setMesh(mesh)
    const frame = `${mesh.stats.width.toFixed(0)}x${mesh.stats.height}`
    if (frame !== lastFrame) { lastFrame = frame; renderer.frame(mesh.stats.width, mesh.stats.height) }
  }
  showStats(mesh, preview)
}

function applyView() {
  if (!renderer) return
  renderer.set({
    color: hexColor(app.color),
    warn: cssColor('--critical'),
    line: cssColor('--grid'),
    overhang: app.showOverhang ? Math.sin((app.params.maxOverhang * Math.PI) / 180) : 2,
    layerHeight: app.showLayers ? app.params.layerHeight : 0,
    cut: app.showCut,
  })
}

function buildPreview() {
  frameTimer = 0
  const mesh = buildVase(buildParams(), { quality: 'draft', normalized: true })
  shownId = ++requestId
  show(mesh, app.params.quality !== 'draft')
}

function buildFinal() {
  settleTimer = 0
  if (app.params.quality === 'draft') return
  const id = ++requestId
  const message = { id, type: 'build', params: buildParams(), quality: app.params.quality }
  if (worker) worker.postMessage(message)
  else handleHere(message).then(({ result }) => received(result))
}

function received(result) {
  if (result.type === 'build') {
    // Only the newest: a vase asked for before the last change is thrown away.
    if (result.id !== requestId) return
    shownId = result.id
    show(result.mesh, false)
    return
  }
  const waiting = exportsWaiting.get(result.id)
  if (!waiting) return
  exportsWaiting.delete(result.id)
  if (result.type === 'error') waiting.reject(new Error(result.error))
  else waiting.resolve(result)
}

/** Something changed: a preview on the next frame, the finished vase when nothing has changed for a moment. */
function changed() {
  if (!frameTimer) frameTimer = requestAnimationFrame(buildPreview)
  clearTimeout(settleTimer)
  settleTimer = setTimeout(buildFinal, 240)
  clearTimeout(changed.keep)
  changed.keep = setTimeout(remember, 600)
}

function startWorker() {
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
    const next = new Worker(url)
    next.onmessage = (event) => received(event.data)
    next.onerror = () => {
      // No worker here: the page builds everything itself.
      next.terminate()
      worker = null
      for (const waiting of exportsWaiting.values()) waiting.reject(new Error('worker'))
      exportsWaiting.clear()
    }
    worker = next
  } catch {
    worker = null
  }
}

function duration(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`
  return `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, '0')}`
}

function showStats(mesh, preview) {
  const s = mesh.stats
  const pairs = [
    [t('triangles'), `${t.number(s.triangles, 0)}${preview ? ` · ${t('preview')}` : ''}`],
    [t('built'), `${t.number(mesh.ms, mesh.ms < 10 ? 1 : 0)} ms`],
    [t('weight'), `${t.number(s.grams, 0)} g`],
    [t('filament'), `${t.number(s.meters, 1)} m`],
    [t('time'), `≈ ${duration(s.minutes)}`],
  ]
  if (s.capacityMl > 1) pairs.push([t('holds'), s.capacityMl >= 1000 ? `${t.number(s.capacityMl / 1000, 2)} l` : `${t.number(s.capacityMl, 0)} ml`])
  pairs.push([t('fileSize'), `${t.number(s.stlBytes / 1048576, 1)} MB`])
  const readout = $('#readout')
  readout.replaceChildren(...pairs.map(([label, value]) => element('div', { class: 'figure' }, [element('span', { class: 'figure-label', text: label }), element('span', { class: 'figure-value', text: value })])))
  const notes = $('#notes')
  notes.replaceChildren(...mesh.notes.map((note) => element('li', { class: `note note-${note.level}` }, [element('span', { class: 'note-mark', 'aria-hidden': 'true', text: note.level === 'warn' ? '!' : 'i' }), element('span', { text: t.note(note) })])))
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

const exportsWaiting = new Map()

function exportFiles(formats) {
  const id = ++exportFiles.count + 1e6
  const message = { id, type: 'export', params: buildParams(), quality: app.params.quality, formats, name: 'Vase' }
  if (!worker) return handleHere(message).then(({ result }) => result)
  return new Promise((resolve, reject) => {
    exportsWaiting.set(id, { resolve, reject })
    worker.postMessage(message)
  })
}
exportFiles.count = 0

async function save(format) {
  const status = $('#save-status')
  const buttons = document.querySelectorAll('.save-button')
  buttons.forEach((button) => { button.disabled = true })
  status.textContent = t('saving')
  try {
    const { files } = await exportFiles([format])
    const bytes = files[0].bytes
    const name = `vase-${app.params.height}x${app.params.diameter}`
    if (window.claude?.use) {
      // Inside Claude only a few kinds of file may be handed out: the vase goes into a ZIP.
      downloads = downloads ?? (await window.claude.use('downloads'))
      if (!downloads) { status.textContent = t('noSave'); return }
      const packed = await zip([{ name: `${name}.${format}`, bytes }, { name: `${name}.json`, bytes: new TextEncoder().encode(settingsText()) }])
      await downloads.save({ filename: `${name}-${format}.zip`, data: new Blob([packed]) })
    } else {
      const url = URL.createObjectURL(new Blob([bytes], { type: format === '3mf' ? 'model/3mf' : 'model/stl' }))
      const link = element('a', { href: url, download: `${name}.${format}` })
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    }
    status.textContent = `${t('saved')} · ${t.number(bytes.length / 1048576, 1)} MB`
  } catch (error) {
    status.textContent = error?.code === 'declined' ? t('declined') : error?.code ? t('noSave') : String(error?.message ?? error)
  } finally {
    buttons.forEach((button) => { button.disabled = false })
  }
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

let controlCount = 0

/** A slider with its number beside it; both set the same value. */
function slider(label, object, key, { min, max, step = 1, unit = '', hint = '', onchange } = {}) {
  const id = `c-${key}-${controlCount++}`
  const range = element('input', { type: 'range', id, min, max, step, value: object[key] })
  const number = element('input', { type: 'number', id: `${id}-n`, class: 'number', min, max, step, value: object[key], 'aria-label': label })
  const set = (raw, from) => {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    object[key] = Math.min(max, Math.max(min, value))
    if (from !== range) range.value = object[key]
    if (from !== number) number.value = object[key]
    onchange?.()
    changed()
  }
  range.addEventListener('input', () => set(range.value, range))
  number.addEventListener('change', () => set(number.value, null))
  return element('div', { class: 'row' }, [
    element('label', { for: id, text: label, title: hint || null }),
    range,
    element('span', { class: 'number-box' }, [number, unit ? element('span', { class: 'unit', text: unit }) : null]),
  ])
}

function select(label, object, key, options, { structural = true, onchange } = {}) {
  const id = `c-${key}-${controlCount++}`
  const field = element('select', { id }, options.map(([value, text]) => element('option', { value, text, selected: object[key] === value })))
  field.addEventListener('change', () => {
    object[key] = field.value
    onchange?.()
    if (structural) renderPanel()
    changed()
  })
  return element('div', { class: 'row row-select' }, [element('label', { for: id, text: label }), field])
}

function toggle(label, object, key, { onchange } = {}) {
  const id = `c-${key}-${controlCount++}`
  const box = element('input', { type: 'checkbox', id, checked: Boolean(object[key]) })
  box.addEventListener('change', () => {
    object[key] = box.checked
    onchange?.()
    changed()
  })
  return element('div', { class: 'row row-toggle' }, [box, element('label', { for: id, text: label })])
}

function group(id, title, children, count = '') {
  const details = element('details', { class: 'group', open: Boolean(app.open[id]) }, [
    element('summary', {}, [element('span', { text: title }), count ? element('span', { class: 'count', text: count }) : null]),
    element('div', { class: 'group-body' }, children),
  ])
  details.addEventListener('toggle', () => { app.open[id] = details.open })
  return details
}

function sectionControls(section, withNone) {
  const names = t.table.sections
  const options = (withNone ? [['none', t('none')]] : []).concat(SECTIONS.map((name) => [name, names[name]]))
  const rows = [select(withNone ? t('section2') : t('sectionType'), section, 'type', options)]
  if (section.type === 'polygon') rows.push(slider(t('sides'), section, 'sides', { min: 3, max: 16 }), slider(t('round'), section, 'round', { min: 0, max: 1, step: 0.01 }))
  if (section.type === 'star') rows.push(slider(t('sides'), section, 'sides', { min: 3, max: 24 }), slider(t('inner'), section, 'inner', { min: 0.3, max: 0.98, step: 0.01 }))
  if (section.type === 'wave') rows.push(
    slider(t('waves'), section, 'waves', { min: 2, max: 64 }),
    slider(t('amp'), section, 'amp', { min: 0, max: 0.3, step: 0.005 }),
    select(t('waveStyle'), section, 'style', WAVE_STYLES.map((name) => [name, t.table.waveStyles[name]]), { structural: false }),
  )
  if (section.type === 'super') rows.push(slider(t('m'), section, 'm', { min: 1, max: 16 }), slider(t('n1'), section, 'n1', { min: 0.3, max: 10, step: 0.05 }), slider(t('n2'), section, 'n2', { min: 0.3, max: 10, step: 0.05 }), slider(t('n3'), section, 'n3', { min: 0.3, max: 10, step: 0.05 }))
  if (section.type === 'ellipse') rows.push(slider(t('ratio'), section, 'ratio', { min: 0.4, max: 1, step: 0.01 }))
  return rows
}

function layerControls(layer, index) {
  const p = app.params
  const rows = [
    element('div', { class: 'layer-head' }, [
      select(`${t('pattern')} ${index + 1}`, layer, 'pattern', PATTERNS.map((name) => [name, t.table.patternNames[name]]), {
        // A new pattern starts with the values that suit it; where it sits on the vase stays.
        onchange: () => {
          Object.assign(layer, { ...LAYER_DEFAULTS, ...PATTERN_STARTERS[layer.pattern], pattern: layer.pattern, from: layer.from, to: layer.to, fade: layer.fade, seed: layer.seed, image: null })
          // A picture or a text sits in a band of its own, once, unless it was given one already.
          if (layer.pattern === 'image' && layer.from === 0 && layer.to === 100) Object.assign(layer, { from: 35, to: 65 })
          app.texts[index] = ''
        },
      }),
      element('button', { type: 'button', class: 'ghost', text: t('remove'), onclick: () => { p.layers.splice(index, 1); app.texts.splice(index, 1); renderPanel(); changed() } }),
    ]),
    slider(layer.pattern === 'rings' ? t('countRings') : t('count'), layer, 'count', { min: 1, max: layer.pattern === 'ribs' ? 200 : layer.pattern === 'image' ? 24 : 90 }),
    slider(t('depth'), layer, 'depth', { min: -4, max: 4, step: 0.05, unit: 'mm', hint: t('depthHint') }),
  ]
  const has = (...names) => names.includes(layer.pattern)
  if (!has('hammered', 'noise', 'image')) rows.push(slider(t('width'), layer, 'width', { min: 0.05, max: 1, step: 0.01 }))
  if (!has('ribs', 'rings')) rows.push(slider(t('aspect'), layer, 'aspect', { min: 0.3, max: 4, step: 0.05 }))
  if (has('ribs', 'rings', 'honeycomb', 'bumps', 'voronoi', 'bricks', 'weave', 'knit')) rows.push(select(t('patternProfile'), layer, 'profile', PATTERN_PROFILES.map((name) => [name, t.table.patternProfiles[name]]), { structural: false }))
  if (!has('rings')) rows.push(slider(t('turn'), layer, 'turn', { min: -720, max: 720, step: 5, unit: '°' }))
  if (has('ribs')) rows.push(toggle(t('cross'), layer, 'cross'))
  if (has('ribs', 'rings')) rows.push(slider(t('wave'), layer, 'wave', { min: 0, max: 2, step: 0.02 }), slider(t('waveCount'), layer, 'waveCount', { min: 1, max: 16, step: 0.5 }))
  if (has('bricks')) rows.push(slider(t('stagger'), layer, 'stagger', { min: 0, max: 0.5, step: 0.05 }))
  if (has('scales')) rows.push(toggle(t('flip'), layer, 'flip'))
  if (has('voronoi', 'hammered', 'noise')) rows.push(slider(t('seed'), layer, 'seed', { min: 1, max: 999 }))
  if (has('noise')) rows.push(slider(t('octaves'), layer, 'octaves', { min: 1, max: 5 }))
  if (has('image')) {
    const fileId = `c-file-${controlCount++}`, textId = `c-text-${controlCount++}`
    const file = element('input', { type: 'file', id: fileId, accept: 'image/*', class: 'file' })
    file.addEventListener('change', () => { if (file.files?.[0]) loadPicture(file.files[0], index) })
    const text = element('input', { type: 'text', id: textId, maxlength: 60, value: app.texts[index] ?? '', placeholder: t('textPlaceholder') })
    const missing = element('p', { class: 'hint', text: t('noImage'), hidden: Boolean(layer.image || app.texts[index]) })
    text.addEventListener('input', () => { app.texts[index] = text.value; if (!text.value) layer.image = null; missing.hidden = Boolean(text.value); changed() })
    rows.push(
      element('div', { class: 'row row-select' }, [element('label', { for: fileId, text: t('chooseImage') }), file]),
      element('div', { class: 'row row-select' }, [element('label', { for: textId, text: t('text') }), text]),
      select(t('fit'), layer, 'fit', [['tile', t('fitTile')], ['once', t('fitOnce')]], { structural: false }),
      toggle(t('invert'), layer, 'invert'),
    )
    rows.push(missing)
  }
  rows.push(
    slider(`${t('band')} ↓`, layer, 'from', { min: 0, max: 100, unit: '%' }),
    slider(`${t('band')} ↑`, layer, 'to', { min: 0, max: 100, unit: '%' }),
    slider(t('fade'), layer, 'fade', { min: 0, max: 40, step: 0.5, unit: 'mm' }),
  )
  return element('div', { class: 'layer' }, rows)
}

/* ------------------------------------------------------------------ */
/* Drawing the body form                                               */
/* ------------------------------------------------------------------ */

function profileEditor() {
  const p = app.params
  const canvas = element('canvas', { class: 'profile', width: 600, height: 520, role: 'img', 'aria-label': t('profile') })
  const points = () => (p.profile === 'custom' && p.profilePoints ? p.profilePoints : profilePointsOf(p).map((pt) => [...pt]))
  const pad = 28
  const toX = (r, w) => w / 2 + r * (w / 2 - pad)
  const toY = (h, height) => height - pad - h * (height - 2 * pad)
  const draw = () => {
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    const style = getComputedStyle(document.documentElement)
    const ink = style.getPropertyValue('--fg').trim(), accent = style.getPropertyValue('--accent').trim(), faint = style.getPropertyValue('--line').trim()
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = faint
    ctx.lineWidth = 2
    ctx.setLineDash([6, 8])
    ctx.beginPath(); ctx.moveTo(w / 2, pad / 2); ctx.lineTo(w / 2, h - pad / 2); ctx.stroke()
    ctx.setLineDash([])
    const list = points()
    const at = profileCurve(list)
    const max = Math.max(...Array.from({ length: 65 }, (_, k) => at(k / 64)))
    ctx.fillStyle = app.color
    ctx.globalAlpha = 0.22
    ctx.beginPath()
    for (let k = 0; k <= 96; k++) ctx.lineTo(toX(at(k / 96) / max, w), toY(k / 96, h))
    for (let k = 96; k >= 0; k--) ctx.lineTo(toX(-at(k / 96) / max, w), toY(k / 96, h))
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = ink
    ctx.lineWidth = 3
    for (const side of [1, -1]) {
      ctx.beginPath()
      for (let k = 0; k <= 96; k++) ctx.lineTo(toX((side * at(k / 96)) / max, w), toY(k / 96, h))
      ctx.stroke()
    }
    list.forEach((pt, index) => {
      ctx.beginPath()
      if (pt[2] === 1) ctx.rect(toX(pt[1] / max, w) - 9, toY(pt[0], h) - 9, 18, 18)
      else ctx.arc(toX(pt[1] / max, w), toY(pt[0], h), 10, 0, 2 * Math.PI)
      ctx.fillStyle = index === app.selectedPoint ? accent : style.getPropertyValue('--surface').trim()
      ctx.fill()
      ctx.strokeStyle = accent
      ctx.lineWidth = 3
      ctx.stroke()
    })
  }
  const place = (event) => {
    const box = canvas.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width) * canvas.width, y = ((event.clientY - box.top) / box.height) * canvas.height
    return { r: Math.abs(x - canvas.width / 2) / (canvas.width / 2 - pad), h: (canvas.height - pad - y) / (canvas.height - 2 * pad), x, y }
  }
  const nearest = (spot) => {
    const list = points()
    const max = Math.max(...list.map((pt) => pt[1]))
    let best = -1, distance = 26
    list.forEach((pt, index) => {
      const d = Math.hypot(Math.abs(toX(pt[1] / max, canvas.width) - canvas.width / 2) - Math.abs(spot.x - canvas.width / 2), toY(pt[0], canvas.height) - spot.y)
      if (d < distance) { distance = d; best = index }
    })
    return best
  }
  /** The drawn form takes over from the preset: its points become the vase's own. */
  const own = () => {
    if (p.profile !== 'custom') {
      p.profilePoints = profilePointsOf(p).map((pt) => [pt[0], pt[1], pt[2] ?? 0])
      p.profile = 'custom'
      const field = $('#profile-select')
      if (field) field.value = 'custom'
    }
    return p.profilePoints
  }
  let dragging = -1
  canvas.addEventListener('pointerdown', (event) => {
    const spot = place(event)
    let index = nearest(spot)
    if (index < 0 && spot.h > 0.02 && spot.h < 0.98) {
      const list = own()
      if (list.length < 24) {
        const max = Math.max(...list.map((pt) => pt[1]))
        list.push([spot.h, Math.min(1, Math.max(0.05, spot.r * max)), 0])
        list.sort((a, b) => a[0] - b[0])
        index = list.findIndex((pt) => pt[0] === spot.h)
      }
    }
    if (index < 0) return
    own()
    dragging = index
    app.selectedPoint = index
    canvas.setPointerCapture(event.pointerId)
    draw()
    updatePointButtons()
    changed()
  })
  canvas.addEventListener('pointermove', (event) => {
    if (dragging < 0) return
    const list = p.profilePoints
    const spot = place(event)
    const max = Math.max(...list.map((pt) => pt[1]))
    const lower = dragging > 0 ? list[dragging - 1][0] + 0.02 : 0, upper = dragging < list.length - 1 ? list[dragging + 1][0] - 0.02 : 1
    list[dragging][1] = Math.min(1, Math.max(0.05, spot.r * max))
    if (dragging > 0 && dragging < list.length - 1) list[dragging][0] = Math.min(upper, Math.max(lower, spot.h))
    draw()
    changed()
  })
  const end = () => { dragging = -1 }
  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', end)
  const removeSelected = () => {
    const list = p.profilePoints
    const index = app.selectedPoint
    if (p.profile !== 'custom' || !list || list.length <= 2 || index <= 0 || index >= list.length - 1) return
    list.splice(index, 1)
    app.selectedPoint = -1
    draw()
    updatePointButtons()
    changed()
  }
  canvas.addEventListener('dblclick', (event) => {
    const index = nearest(place(event))
    if (index < 0) return
    app.selectedPoint = index
    removeSelected()
  })
  const cornerButton = element('button', { type: 'button', class: 'ghost', text: t('corner'), onclick: () => {
    const list = own()
    const pt = list[app.selectedPoint]
    if (!pt) return
    pt[2] = pt[2] === 1 ? 0 : 1
    draw()
    changed()
  } })
  const removeButton = element('button', { type: 'button', class: 'ghost', text: t('removePoint'), onclick: removeSelected })
  const updatePointButtons = () => {
    const count = p.profile === 'custom' && p.profilePoints ? p.profilePoints.length : 0
    cornerButton.disabled = app.selectedPoint < 0
    removeButton.disabled = app.selectedPoint <= 0 || app.selectedPoint >= count - 1 || count <= 2
  }
  updatePointButtons()
  requestAnimationFrame(draw)
  return element('div', { class: 'profile-box' }, [canvas, element('div', { class: 'button-row' }, [cornerButton, removeButton]), element('p', { class: 'hint', text: t('profileHint') })])
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

function usePreset(preset) {
  app.params = normalizeParams(JSON.parse(JSON.stringify(preset.params)))
  app.texts = app.params.layers.map(() => '')
  app.color = preset.color
  app.selectedPoint = -1
  renderPanel()
  applyView()
  changed()
}

function renderPanel() {
  controlCount = 0
  const p = app.params
  const panel = $('#panel')
  const scroll = panel.scrollTop
  const profileOptions = [...Object.keys(PROFILES), 'custom'].map((name) => [name, t.table.profiles[name]])
  const profileSelect = select(t('profile'), p, 'profile', profileOptions, {
    onchange: () => {
      if (p.profile === 'custom') p.profilePoints = p.profilePoints ?? PROFILES.bottle.map((pt) => [...pt, 0])
      else p.profilePoints = null
      app.selectedPoint = -1
    },
  })
  $('select', profileSelect).id = 'profile-select'
  $('label', profileSelect).setAttribute('for', 'profile-select')

  const pasteBox = element('textarea', { id: 'paste-box', rows: 3, placeholder: t('pasteHint'), 'aria-label': t('pasteHint') })
  const pasteStatus = element('span', { class: 'hint', id: 'paste-status', role: 'status' })
  const settings = element('div', { class: 'settings-box', hidden: !app.open.paste }, [
    pasteBox,
    element('div', { class: 'button-row' }, [
      element('button', { type: 'button', text: t('apply'), onclick: () => {
        try {
          applySettings(pasteBox.value)
          app.open.paste = false
          renderPanel(); applyView(); changed()
        } catch { pasteStatus.textContent = t('badSettings') }
      } }),
      pasteStatus,
    ]),
  ])

  panel.replaceChildren(
    element('div', { class: 'presets' }, [
      element('h2', { text: t('presets') }),
      element('div', { class: 'chips' }, PRESETS.map((preset) => element('button', { type: 'button', class: 'chip', onclick: () => usePreset(preset) }, [
        element('span', { class: 'chip-dot', style: `background:${preset.color}` }), element('span', { text: preset.name[app.language] ?? preset.name.de }),
      ]))),
      element('div', { class: 'button-row' }, [
        element('button', { type: 'button', class: 'primary', text: t('random'), onclick: () => {
          app.seed = (Math.random() * 1e9) | 0
          usePreset({ params: randomVase(app.seed), color: COLORS[app.seed % COLORS.length] })
        } }),
        element('button', { type: 'button', class: 'ghost', id: 'copy-button', text: t('copy'), onclick: async (event) => {
          const text = settingsText()
          try {
            await navigator.clipboard.writeText(text)
            event.target.textContent = t('copied')
            setTimeout(() => { event.target.textContent = t('copy') }, 1500)
          } catch {
            // No clipboard here: the text goes into the field, marked, to be copied by hand.
            app.open.paste = true
            settings.hidden = false
            pasteBox.value = text
            pasteBox.select()
          }
        } }),
        element('button', { type: 'button', class: 'ghost', text: t('paste'), onclick: () => { app.open.paste = !app.open.paste; settings.hidden = !app.open.paste; if (app.open.paste) pasteBox.focus() } }),
      ]),
      settings,
    ]),
    group('shape', t('shape'), [
      profileSelect,
      profileEditor(),
      slider(t('height'), p, 'height', { min: 30, max: 400, unit: 'mm' }),
      slider(t('diameter'), p, 'diameter', { min: 20, max: 300, unit: 'mm' }),
    ]),
    group('section', t('section'), [
      ...sectionControls(p.section, false),
      ...sectionControls(p.section2, true),
      p.section2.type !== 'none' ? slider(`${t('morph')} ↓`, p, 'morphFrom', { min: 0, max: 100, unit: '%' }) : null,
      p.section2.type !== 'none' ? slider(`${t('morph')} ↑`, p, 'morphTo', { min: 0, max: 100, unit: '%' }) : null,
    ]),
    group('twist', t('twist'), [
      slider(t('twistAngle'), p, 'twist', { min: -720, max: 720, step: 5, unit: '°' }),
      slider(t('sway'), p, 'sway', { min: 0, max: 90, unit: '°' }),
      slider(t('swayCount'), p, 'swayCount', { min: 0.5, max: 8, step: 0.5 }),
    ]),
    group('patterns', t('patterns'), [
      ...p.layers.map(layerControls),
      p.layers.length < MAX_LAYERS ? element('button', { type: 'button', class: 'add', text: `+ ${t('addPattern')}`, disabled: p.style === 'lowpoly', onclick: () => {
        p.layers.push(newLayer(p.layers.length ? 'rings' : 'ribs'))
        app.texts.push('')
        renderPanel(); changed()
      } }) : null,
    ], p.layers.length ? String(p.layers.length) : ''),
    group('body', t('body'), [
      select(t('bodyKind'), p, 'body', [['solid', t('solid')], ['hollow', t('hollow')]]),
      p.body === 'hollow' ? slider(t('wall'), p, 'wall', { min: 0.4, max: 6, step: 0.05, unit: 'mm' }) : null,
      slider(t('bottom'), p, 'bottom', { min: p.body === 'hollow' ? 0 : 0.2, max: 8, step: 0.1, unit: 'mm', hint: p.body === 'hollow' ? t('bottomHint') : '' }),
      p.body === 'hollow' && p.bottom > 0 ? slider(t('hole'), p, 'hole', { min: 0, max: 60, step: 0.5, unit: 'mm' }) : null,
      select(t('style'), p, 'style', [['smooth', t('smooth')], ['lowpoly', t('lowpoly')]]),
      ...(p.style === 'lowpoly' ? [
        slider(t('lowAround'), p, 'lowAround', { min: 3, max: 64 }),
        slider(t('lowRows'), p, 'lowRows', { min: 1, max: 48 }),
        slider(t('lowJitter'), p, 'lowJitter', { min: 0, max: 0.9, step: 0.01 }),
        slider(t('lowSeed'), p, 'lowSeed', { min: 1, max: 999 }),
      ] : []),
    ]),
    group('print', t('print'), [
      slider(t('lineWidth'), p, 'lineWidth', { min: 0.3, max: 1.2, step: 0.01, unit: 'mm' }),
      slider(t('layerHeight'), p, 'layerHeight', { min: 0.08, max: 0.6, step: 0.01, unit: 'mm', onchange: applyView }),
      slider(t('speed'), p, 'speed', { min: 10, max: 300, step: 5, unit: 'mm/s' }),
      slider(t('maxOverhang'), p, 'maxOverhang', { min: 30, max: 70, unit: '°', onchange: applyView }),
      select(t('material'), p, 'material', Object.keys(MATERIALS).map((name) => [name, name.toUpperCase()]), { structural: false }),
      toggle(t('showOverhang'), app, 'showOverhang', { onchange: applyView }),
      toggle(t('showLayers'), app, 'showLayers', { onchange: applyView }),
      toggle(t('showCut'), app, 'showCut', { onchange: applyView }),
      element('div', { class: 'row row-select' }, [
        element('span', { class: 'label', text: t('color') }),
        element('div', { class: 'swatches' }, COLORS.map((color) => element('button', { type: 'button', class: `swatch${color === app.color ? ' is-on' : ''}`, style: `background:${color}`, 'aria-label': color, 'aria-pressed': String(color === app.color), onclick: () => { app.color = color; applyView(); renderPanel(); remember() } }))),
      ]),
    ]),
    group('export', t('export'), [
      select(t('quality'), p, 'quality', [['draft', t('draft')], ['standard', t('standard')], ['fine', t('fine')]], { structural: false }),
      element('div', { class: 'button-row' }, [
        element('button', { type: 'button', class: 'primary save-button', text: t('saveStl'), onclick: () => save('stl') }),
        element('button', { type: 'button', class: 'save-button', text: t('save3mf'), onclick: () => save('3mf') }),
      ]),
      element('p', { class: 'hint', id: 'save-status', role: 'status', text: window.claude?.use ? t('zipNote') : '' }),
    ]),
  )
  app.open.export = app.open.export ?? true
  panel.scrollTop = scroll
  document.title = t('title')
  $('#app-title').textContent = t('title')
  $('#language').textContent = app.language === 'de' ? 'EN' : 'DE'
  $('#reset-view').textContent = t('reset')
}

function start() {
  recall()
  t = translator(app.language)
  app.open.export = true
  const canvas = $('#view')
  try { renderer = createRenderer(canvas) } catch { renderer = null }
  if (!renderer) $('#no-webgl').hidden = false
  $('#no-webgl').textContent = t('noWebgl')
  $('#language').addEventListener('click', () => {
    app.language = app.language === 'de' ? 'en' : 'de'
    t = translator(app.language)
    $('#no-webgl').textContent = t('noWebgl')
    renderPanel()
    changed()
  })
  $('#reset-view').addEventListener('click', () => {
    renderer?.set({ yaw: -0.6, pitch: 0.22 })
    lastFrame = ''
    changed()
  })
  // The colours of the view follow the theme.
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyView)
  new MutationObserver(applyView).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  startWorker()
  renderPanel()
  applyView()
  changed()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
else start()
