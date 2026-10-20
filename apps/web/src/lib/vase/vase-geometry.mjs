/**
 * Vasen-Generator: Vase aus Querschnitt (Kreis, Vieleck, Welle oder selbst
 * gezeichnet) und Koerperform (Vorlage oder selbst gezeichnet), auf Wunsch
 * verdreht, mit einer Oberflaeche: Rillen, Streifen, Voronoi oder Low Poly -
 * auch nur in einem Hoehenbereich. Reines ES-Modul ohne Abhaengigkeiten: Die
 * Vorschau im Browser, der STL-Export und das Einfuegen in Layerling rechnen
 * mit genau diesem Code.
 *
 * Aufbau: Radius(Winkel, Hoehe) = groesster Radius x Koerperform(Hoehe) x
 * Querschnitt(Winkel - Drehung(Hoehe)), minus der Tiefe des Oberflaecheneffekts.
 * Das Netz ist ein regelmaessiges Raster aus Winkel und Hoehe: Jede Hoehe
 * trifft Rillen und Kanten an denselben Stellen.
 *
 * Koordinaten: Millimeter, Z nach oben (wie STL und jeder Slicer), die Vase
 * steht mit dem Boden auf z = 0, ihre Achse ist die Z-Achse.
 */
import { capWithHoles, holeCeiling, holeWall, zipRings } from './mesh-tools.mjs'
import { CUTOUTS, CUTOUT_EDGES, cutoutPattern, wallZone } from './vase-cutout.mjs'
import { REINFORCE, slitBody } from './vase-slits.mjs'

export { CUTOUTS, CUTOUT_EDGES, REINFORCE }

/** Silhouetten als Stuetzpunkte [Hoehe 0..1, Radius 0..1 vom Maximaldurchmesser]. */
export const PROFILES = {
  flasche: { label: 'Flasche', points: [[0, 0.93], [0.06, 1], [0.5, 1], [0.6, 0.95], [0.7, 0.7], [0.78, 0.46], [0.86, 0.37], [1, 0.4]] },
  bauchig: { label: 'Bauchig', points: [[0, 0.66], [0.1, 0.86], [0.32, 1], [0.55, 0.94], [0.75, 0.66], [0.9, 0.46], [1, 0.5]] },
  schale: { label: 'Schale mit Hals', points: [[0, 0.62], [0.08, 0.86], [0.2, 1], [0.3, 0.9], [0.4, 0.5], [0.55, 0.3], [0.85, 0.27], [1, 0.36]] },
  fass: { label: 'Fass', points: [[0, 0.88], [0.45, 1], [0.72, 0.97], [0.86, 0.8], [0.95, 0.66], [1, 0.64]] },
  zylinder: { label: 'Zylinder', points: [[0, 1], [1, 1]] },
  trichter: { label: 'Trichter', points: [[0, 0.62], [1, 1]] },
}

export const RIB_SHAPES = { rund: 'Rund', v: 'Spitz (V)', flach: 'Flach' }
export const SECTIONS = { kreis: 'Kreis', vieleck: 'Vieleck', welle: 'Welle', gezeichnet: 'Gezeichnet' }
/** Querschnitt-Uebergang: oben ein zweiter Querschnitt, in den der erste ueber die Hoehe uebergeht. */
export const SECTIONS2 = { keiner: 'Keiner', ...SECTIONS }
/** Wellenformen des Querschnitts. Boegen: runde Bogen, scharfe Kerben (Kuerbis, Bluete). Lamellen: schmale Rippen mit runder Kante, dazwischen ein Spalt bis zum Kern. */
export const WAVE_STYLES = { weich: 'Weich', spitz: 'Spitz', bogen: 'Bögen', lamellen: 'Lamellen' }
export const INNER_SHAPES = { folgt: 'Folgt der Form', rund: 'Rund' }
/** Ausserhalb des Hoehenbereichs wird der Querschnitt rund: auf mittlerem Radius, an den Spitzen oder am Grund. */
export const SECTION_OUTSIDE = { mitte: 'Mitte', spitzen: 'Außen an den Spitzen', grund: 'Innen am Grund' }
export const LEG_MODES = { keine: 'Keine', stecken: 'Zum Einstecken', angeformt: 'Angeformt', staender: 'Ständer' }
export const LEG_SHAPES = { kegel: 'Kegel', zylinder: 'Zylinder', kantig: 'Kantig' }
export const SAUCER_MODES = { keine: 'Keiner', schale: 'Schale', versteckt: 'Versteckt im Fuß' }
export const INSERT_MODES = { keine: 'Keiner', pflanze: 'Pflanzeinsatz', bewaesserung: 'Selbstbewässerung', stecker: 'Steckeinsatz', roehrchen: 'Wasserröhrchen' }
export const YES_NO = { ja: 'Ja', nein: 'Nein' }
/** Lampenschirm: haengend (Loch fuer die Fassung im Boden, zum Aufhaengen umdrehen), stehend mit Fassung im Boden, ueber einem LED-Puck (ohne Boden). */
export const LAMPS = { keine: 'Keiner', haengend: 'Hängend', stehend: 'Stehend mit Fassung', puck: 'Über LED-Puck' }
/** Loch fuer die Fassung: ungefaehre Werte fuer den Schirmring - an der eigenen Fassung nachmessen. */
export const LAMP_SOCKETS = { e27: 'E27 (≈ 41 mm)', e14: 'E14 (≈ 29 mm)', eigen: 'Eigenes Maß' }
const SOCKET_HOLES = { e27: 41, e14: 29 }
/** Einstellungen des Zubehoers: Form-Vorlagen lassen sie stehen. */
export const PART_KEYS = ['legMode', 'legCount', 'legHeight', 'legDiameter', 'legShape', 'legSplay', 'legInset', 'fitClearance',
  'saucerMode', 'saucerRibs', 'saucerSpout', 'saucerGrip', 'saucerGap', 'saucerHeight', 'saucerWall',
  'insertMode', 'insertWall', 'insertStandoff', 'reservoirHeight', 'tubeDiameter', 'frogHole',
  'lidMode', 'lidClearance', 'lidThickness', 'lidDepth', 'threadPitch', 'lidGrip']
/**
 * Deckel: Stuelpdeckel (Platte mit Lippe, die in der Oeffnung sitzt), Schnappdeckel (Lippe mit Wulst, Nut
 * in der Innenwand), Schraubdeckel (Innengewinde im Hals, Gewindezapfen am Deckel).
 */
export const LID_MODES = { keiner: 'Keiner', stuelp: 'Stülpdeckel', schnapp: 'Schnappdeckel', schraube: 'Schraubdeckel' }
export const SYMMETRIES = { halb: 'Hälfte', viertel: 'Viertel', windmuehle: 'Windmühle', frei: 'Frei' }
export const EFFECTS = { keine: 'Keine', rillen: 'Rillen', streifen: 'Streifen', voronoi: 'Voronoi', lowpoly: 'Low Poly' }
/** Drehung des Querschnitts ueber die Hoehe: gleichmaessig (Verdrehung + Pendeln) oder als gezeichnete Kurve. */
export const TWIST_MODES = { gleichmaessig: 'Gleichmäßig', kurve: 'Als Kurve' }
/** Material fuer Gewicht und Filament: Dichte in g/cm^3 (Herstellerangaben, gerundet). */
export const MATERIALS = { pla: { label: 'PLA', density: 1.24 }, petg: { label: 'PETG', density: 1.27 }, abs: { label: 'ABS', density: 1.04 }, asa: { label: 'ASA', density: 1.07 }, tpu: { label: 'TPU', density: 1.21 } }
/** Filament fuer die Laengenangabe (mm Durchmesser). */
export const FILAMENT_DIAMETER = 1.75
/** Boden im Slicer-Vasenmodus (mm): ueblich sind 3 bis 5 Schichten. */
export const VASE_MODE_BOTTOM = 1
/** Wonach sich die Drehung verteilt: nach der Hoehe oder nach der Bogenlaenge der Koerperform (Kontur). */
export const TWIST_ALONG = { hoehe: 'Nach der Höhe', kontur: 'Nach der Kontur' }

/** Vorgaben fuer gezeichnete Querschnitte je Symmetrie (Einheitskreis, Punkte des Grundstuecks). */
export const DRAW_PRESETS = Object.freeze({
  // Haelfte: von oben (x = 0) rechts herum nach unten (x = 0); wird gespiegelt.
  halb: [{ x: 0, y: 0.95 }, { x: 0.7, y: 0.75 }, { x: 0.95, y: 0 }, { x: 0.7, y: -0.75 }, { x: 0, y: -0.95 }],
  // Viertel: von oben (x = 0) zur Seite (y = 0); wird zweimal gespiegelt - ein Kleeblatt.
  viertel: [{ x: 0, y: 0.6 }, { x: 0.5, y: 0.95 }, { x: 0.95, y: 0.5 }, { x: 0.6, y: 0 }],
  // Windmuehle: ein Fluegel ab oben, wird gedreht wiederholt (keine Spiegelung).
  windmuehle: [{ x: 0, y: 0.7 }, { x: 0.55, y: 0.85 }, { x: 0.7, y: 0.35 }],
  // Frei: der ganze Umriss.
  frei: [{ x: 0, y: 0.9 }, { x: 0.8, y: 0.6 }, { x: 0.7, y: -0.6 }, { x: -0.5, y: -0.85 }, { x: -0.9, y: 0.2 }],
})

/** Vorgabe fuer eine gezeichnete Koerperform: [Hoehe 0..1, Radius 0..1]. */
export const DRAW_PROFILE = Object.freeze([[0, 0.7], [0.3, 1], [0.7, 0.75], [1, 0.55]])

// tol/maxStep: Zeilen nach Kruemmung bei glatten runden Koerpern (hoechstens tol mm Sehnenabweichung, hoechstens maxStep mm je Zeile).
const QUALITY = {
  entwurf: { perRib: 6, mmPerRow: 2, smoothSegments: 96, tol: 0.05, maxStep: 10 },
  standard: { perRib: 10, mmPerRow: 1, smoothSegments: 160, tol: 0.02, maxStep: 6 },
  fein: { perRib: 16, mmPerRow: 0.5, smoothSegments: 256, tol: 0.01, maxStep: 4 },
}
export const QUALITY_LABELS = { entwurf: 'Entwurf', standard: 'Standard', fein: 'Fein' }

/** Voreinstellung: Minimal-Vase (Flasche, 48 runde Rillen, voll fuer den Slicer-Vasenmodus). */
export const DEFAULTS = Object.freeze({
  profile: 'flasche',
  height: 180,
  diameter: 90,
  ribCount: 48,
  ribDepth: 1.6,
  grooveWidth: 0.55,
  ribShape: 'rund',
  twist: 0,
  twistMode: 'gleichmaessig',
  /** Drehkurve (twistMode = 'kurve'): [[Hoehe 0..1, Winkel in Grad, Art?, Steigung?], ...]; null = aus Verdrehung und Pendeln. */
  twistPoints: null,
  /** Pendeln: Querschnitt und Muster schwingen ueber die Hoehe hin und her (Ausschlag in Grad, Anzahl der Schwuenge). */
  swayAngle: 0,
  swayCount: 3,
  /**
   * Drehung (Verdrehung, Pendeln, Drehkurve) nach der Hoehe oder nach der Kontur verteilt: bei `kontur`
   * zaehlt die Bogenlaenge der Koerperform - an einem flachen Bauch dreht sich die Wand dann je mm Wand
   * gleich viel, statt sich dort zusammenzudraengen.
   */
  twistAlong: 'hoehe',
  /** Material fuer Gewicht und Filament (aendert die Form nicht). */
  material: 'pla',
  /** Querschnitt nur in diesem Hoehenbereich (Prozent der Hoehe), weicher Uebergang in mm; ausserhalb rund. */
  sectionZoneFrom: 0,
  sectionZoneTo: 100,
  sectionZoneFade: 10,
  sectionOutside: 'mitte',
  /**
   * Querschnitt-Uebergang: oben ein zweiter Querschnitt (keiner = aus) mit eigenen Ecken bzw. Wellen;
   * zwischen `section2From` und `section2To` (% der Hoehe) geht der Querschnitt weich in ihn ueber.
   * Gezeichnet nimmt den gezeichneten Umriss (drawPoints).
   */
  section2: 'keiner',
  section2Sides: 5,
  section2Round: 0.2,
  section2Waves: 12,
  section2WaveAmp: 0.1,
  section2WaveStyle: 'bogen',
  section2From: 0,
  section2To: 100,
  waveAmplitude: 0,
  waveCount: 3,
  zoneFrom: 0,
  zoneTo: 100,
  zoneFade: 6,
  body: 'voll',
  wall: 2,
  bottom: 2,
  /** Hohle Vase: Innenwand folgt dem Querschnitt oder ist rund (z. B. fuer ein Teelicht). */
  innerShape: 'folgt',
  // Boden (hohle Vase): Ablaufloecher, Gefaelle des Innenbodens zu ihnen hin, hohler Fuss fuer
  // eine versteckte Auffangschale. Mulden fuer Gummifuesse gehen auch beim vollen Koerper.
  drainHoles: 0,
  drainDiameter: 6,
  floorSlope: 0,
  footHeight: 0,
  rubberFeet: 0,
  rubberFootDiameter: 10,
  rubberFootDepth: 1.5,
  // Beine: keine, zum Einstecken (Buchsen im Boden), angeformt (ein Objekt) oder Staender (Gestell).
  legMode: 'keine',
  legCount: 3,
  legHeight: 35,
  legDiameter: 14,
  legShape: 'kegel',
  legSplay: 8,
  legInset: 0.2,
  /** Spiel fuer alle Passungen (Zapfen, Einsaetze, Untersetzer) in mm. */
  fitClearance: 0.2,
  // Untersetzer: Schale nach dem Querschnitt oder versteckte Schale im hohlen Fuss.
  saucerMode: 'keine',
  saucerRibs: 'ja',
  saucerSpout: 'ja',
  saucerGrip: 'ja',
  saucerGap: 4,
  saucerHeight: 16,
  saucerWall: 2,
  // Einsatz: Pflanzeinsatz, Selbstbewaesserung, Steckeinsatz fuer Schnittblumen, Wasserroehrchen.
  insertMode: 'keine',
  insertWall: 1.6,
  insertStandoff: 5,
  reservoirHeight: 30,
  tubeDiameter: 24,
  frogHole: 7,
  // Deckel (Zubehoer): Art, Spiel (FDM: 0,3-0,4 mm), Plattenstaerke, Laenge der Lippe bzw. des Gewindes,
  // Steigung des Gewindes, geriffelter Rand zum Greifen.
  lidMode: 'keiner',
  lidClearance: 0.35,
  lidThickness: 2.4,
  lidDepth: 12,
  threadPitch: 4,
  lidGrip: 'ja',
  quality: 'standard',
  // Durchbrochene Wand (hohle Vase): Muster, Zellgroesse, Stegbreite, Hoehenbereich (%), Streckung, Anordnung,
  // am Rand des Bereichs Loecher anschneiden oder nur ganze Loecher.
  cutout: 'keine',
  cutoutSize: 14,
  cutoutWeb: 3,
  cutoutFrom: 15,
  cutoutTo: 85,
  cutoutAspect: 1,
  cutoutSeed: 1,
  cutoutEdge: 'anschneiden',
  /** Muss Wasser halten: Mindestwand und -boden, Widersprueche (Loecher) und Slicer-Hinweise (vaseChecks). */
  watertight: 'nein',
  // Lampenschirm (hohle Vase): Art, Fassung bzw. Lochmass, LED-Puck, Kabelschlitz unten (Breite 0 = keiner).
  lamp: 'keine',
  lampSocket: 'e27',
  lampHole: 41,
  puckDiameter: 70,
  lampNotch: 10,
  lampNotchHeight: 8,
  // Vasenmodus stabiler (voller Koerper): Rippen innen oder Doppelwand ueber feine Schlitze.
  reinforce: 'keine',
  reinforceCount: 12,
  /** Rippen: wie tief sie nach innen reichen; Doppelwand: Abstand der beiden Waende (mm). */
  reinforceDepth: 6,
  /** Breite der Schlitze und Linienbreite im Slicer (mm) - davon haengt ab, ob die Linien verschmelzen. */
  slitWidth: 0.1,
  lineWidth: 0.45,
  // Querschnitt
  section: 'kreis',
  polySides: 6,
  polyRound: 0.2,
  sectionWaves: 20,
  sectionWaveAmp: 0.06,
  sectionWaveStyle: 'weich',
  /** Lamellen: Anteil der Teilung, den eine Lamelle einnimmt. */
  sectionFinWidth: 0.45,
  drawSymmetry: 'viertel',
  drawRepeat: 5,
  /**
   * Punkte des Grundstuecks: { x, y, corner, tx?, ty? } im Einheitskreis; null = Vorgabe der
   * Symmetrie. `tx`/`ty`: Anfasser (Tangente der Kurve im Punkt, wie beim Hermite-Spline); ohne
   * Anfasser rechnet die Kurve die Tangente selbst aus den Nachbarn.
   */
  drawPoints: null,
  /** Gezeichnete Koerperform (profile = 'gezeichnet'): [[Hoehe 0..1, Radius 0..1], ...]. */
  profilePoints: null,
  // Oberflaeche
  effect: 'rillen',
  stripeStyle: 'einfach',
  stripeTurn: 180,
  stripeCount: 60,
  stripeWidth: 0.5,
  stripeDepth: 1,
  voronoiCell: 12,
  voronoiGap: 1.6,
  voronoiDepth: 1,
  voronoiSeed: 1,
  lowpolyAround: 24,
  lowpolyRows: 10,
  lowpolyJitter: 0.35,
  lowpolySeed: 1,
})

/** Grenzen fuer jeden Zahlenwert; dieselben nutzt die Seite fuer ihre Regler. */
export const LIMITS = {
  height: [20, 400],
  diameter: [10, 300],
  ribCount: [0, 240],
  ribDepth: [0, 10],
  grooveWidth: [0.1, 1],
  twist: [-720, 720],
  swayAngle: [0, 90],
  swayCount: [0, 20],
  sectionZoneFrom: [0, 100],
  sectionZoneTo: [0, 100],
  sectionZoneFade: [0, 80],
  section2Sides: [3, 24],
  section2Round: [0, 1],
  section2Waves: [2, 80],
  section2WaveAmp: [0, 0.4],
  section2From: [0, 100],
  section2To: [0, 100],
  waveAmplitude: [0, 30],
  waveCount: [0, 20],
  zoneFrom: [0, 100],
  zoneTo: [0, 100],
  zoneFade: [0, 50],
  wall: [0.4, 10],
  bottom: [0.4, 20],
  polySides: [3, 24],
  polyRound: [0, 1],
  sectionWaves: [2, 80],
  sectionWaveAmp: [0, 0.4],
  sectionFinWidth: [0.15, 0.85],
  drainHoles: [0, 13],
  drainDiameter: [3, 14],
  floorSlope: [0, 8],
  footHeight: [0, 80],
  rubberFeet: [0, 8],
  rubberFootDiameter: [5, 20],
  rubberFootDepth: [0.4, 4],
  legCount: [3, 8],
  legHeight: [4, 200],
  legDiameter: [6, 40],
  legSplay: [0, 25],
  legInset: [0.05, 0.45],
  fitClearance: [0, 0.8],
  saucerGap: [1.5, 15],
  saucerHeight: [6, 40],
  saucerWall: [1.2, 4],
  insertWall: [1, 3],
  insertStandoff: [2, 20],
  reservoirHeight: [10, 120],
  tubeDiameter: [8, 60],
  frogHole: [3, 14],
  lidClearance: [0.1, 1],
  lidThickness: [1.2, 6],
  lidDepth: [5, 40],
  threadPitch: [2, 8],
  cutoutSize: [4, 60],
  cutoutWeb: [1, 20],
  cutoutFrom: [0, 100],
  cutoutTo: [0, 100],
  cutoutAspect: [0.5, 3],
  cutoutSeed: [1, 9999],
  reinforceCount: [3, 48],
  lampHole: [10, 80],
  puckDiameter: [20, 200],
  lampNotch: [0, 40],
  lampNotchHeight: [2, 30],
  reinforceDepth: [1, 40],
  slitWidth: [0.01, 0.5],
  lineWidth: [0.2, 1.2],
  drawRepeat: [2, 12],
  stripeTurn: [-720, 720],
  stripeCount: [2, 240],
  stripeWidth: [0.1, 1],
  stripeDepth: [0, 10],
  voronoiCell: [3, 60],
  voronoiGap: [0.3, 10],
  voronoiDepth: [0, 10],
  voronoiSeed: [1, 9999],
  lowpolyAround: [3, 96],
  lowpolyRows: [1, 80],
  lowpolyJitter: [0, 0.9],
  lowpolySeed: [1, 9999],
}

const MAX_SEGMENTS = 2400
/** Mindestwand und -boden (mm) fuer eine hohle Vase, die Wasser halten soll. */
export const WATERTIGHT_MIN = 1.6
/** Duese, von der die Pruefungen ausgehen (mm): zwei Linien = duennste sinnvolle Wand. */
const NOZZLE = 0.4
const MAX_ROWS = 1200

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** Vervollstaendigt und begrenzt Einstellungen; unbekannte Felder fallen weg. */
export function normalizeParams(input = {}) {
  const p = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'drawPoints' || key === 'profilePoints' || key === 'twistPoints') continue
    // Nur einfache Werte; ein Objekt (auch ohne Prototyp) oder eine Liste gilt als nicht angegeben.
    const value = input?.[key]
    if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') continue
    if (typeof DEFAULTS[key] === 'number') {
      const n = typeof value === 'string' && !value.trim() ? NaN : Number(value)
      if (Number.isFinite(n)) p[key] = n
    } else {
      p[key] = String(value)
    }
  }
  p.drawPoints = normalizeDrawPoints(input.drawPoints)
  p.profilePoints = normalizeProfilePoints(input.profilePoints)
  p.twistPoints = normalizeTwistPoints(input.twistPoints)
  for (const [key, [min, max]] of Object.entries(LIMITS)) p[key] = clamp(p[key], min, max)
  p.ribCount = Math.round(p.ribCount)
  for (const key of ['polySides', 'section2Sides', 'section2Waves', 'sectionWaves', 'drawRepeat', 'stripeCount', 'lowpolyAround', 'lowpolyRows', 'voronoiSeed', 'lowpolySeed', 'drainHoles', 'rubberFeet', 'legCount', 'cutoutSeed', 'reinforceCount']) p[key] = Math.round(p[key])
  if (p.rubberFeet > 0 && p.rubberFeet < 3) p.rubberFeet = 3
  if (!LEG_MODES[p.legMode]) p.legMode = DEFAULTS.legMode
  if (!LEG_SHAPES[p.legShape]) p.legShape = DEFAULTS.legShape
  if (!SAUCER_MODES[p.saucerMode]) p.saucerMode = DEFAULTS.saucerMode
  if (!INSERT_MODES[p.insertMode]) p.insertMode = DEFAULTS.insertMode
  if (!LID_MODES[p.lidMode]) p.lidMode = DEFAULTS.lidMode
  if (!YES_NO[p.lidGrip]) p.lidGrip = DEFAULTS.lidGrip
  for (const key of ['saucerRibs', 'saucerSpout', 'saucerGrip']) if (!YES_NO[p[key]]) p[key] = DEFAULTS[key]
  if (!PROFILES[p.profile] && p.profile !== 'gezeichnet') p.profile = DEFAULTS.profile
  if (!SECTIONS[p.section]) p.section = DEFAULTS.section
  if (!SECTIONS2[p.section2]) p.section2 = DEFAULTS.section2
  if (!WAVE_STYLES[p.section2WaveStyle]) p.section2WaveStyle = DEFAULTS.section2WaveStyle
  if (p.section2To < p.section2From) [p.section2From, p.section2To] = [p.section2To, p.section2From]
  if (!SYMMETRIES[p.drawSymmetry]) p.drawSymmetry = DEFAULTS.drawSymmetry
  if (!EFFECTS[p.effect]) p.effect = DEFAULTS.effect
  if (!WAVE_STYLES[p.sectionWaveStyle]) p.sectionWaveStyle = DEFAULTS.sectionWaveStyle
  if (!INNER_SHAPES[p.innerShape]) p.innerShape = DEFAULTS.innerShape
  if (p.stripeStyle !== 'einfach' && p.stripeStyle !== 'doppelt') p.stripeStyle = DEFAULTS.stripeStyle
  if (!RIB_SHAPES[p.ribShape]) p.ribShape = DEFAULTS.ribShape
  if (!QUALITY[p.quality]) p.quality = DEFAULTS.quality
  if (!TWIST_MODES[p.twistMode]) p.twistMode = DEFAULTS.twistMode
  if (!TWIST_ALONG[p.twistAlong]) p.twistAlong = DEFAULTS.twistAlong
  if (!MATERIALS[p.material]) p.material = DEFAULTS.material
  if (p.body !== 'voll' && p.body !== 'hohl') p.body = DEFAULTS.body
  if (p.zoneTo < p.zoneFrom) [p.zoneFrom, p.zoneTo] = [p.zoneTo, p.zoneFrom]
  if (p.sectionZoneTo < p.sectionZoneFrom) [p.sectionZoneFrom, p.sectionZoneTo] = [p.sectionZoneTo, p.sectionZoneFrom]
  if (!CUTOUTS[p.cutout]) p.cutout = DEFAULTS.cutout
  if (!CUTOUT_EDGES[p.cutoutEdge]) p.cutoutEdge = DEFAULTS.cutoutEdge
  if (!REINFORCE[p.reinforce]) p.reinforce = DEFAULTS.reinforce
  if (!LAMPS[p.lamp]) p.lamp = DEFAULTS.lamp
  if (!YES_NO[p.watertight]) p.watertight = DEFAULTS.watertight
  // Wasserdicht: Wand und Boden einer hohlen Vase mindestens WATERTIGHT_MIN (vier Linien bzw. acht Schichten).
  if (p.watertight === 'ja' && p.body === 'hohl') {
    p.wall = Math.max(p.wall, WATERTIGHT_MIN)
    p.bottom = Math.max(p.bottom, WATERTIGHT_MIN)
  }
  if (!LAMP_SOCKETS[p.lampSocket]) p.lampSocket = DEFAULTS.lampSocket
  if (SOCKET_HOLES[p.lampSocket]) p.lampHole = SOCKET_HOLES[p.lampSocket]
  if (p.cutoutTo < p.cutoutFrom) [p.cutoutFrom, p.cutoutTo] = [p.cutoutTo, p.cutoutFrom]
  if (!SECTION_OUTSIDE[p.sectionOutside]) p.sectionOutside = DEFAULTS.sectionOutside
  p.bottom = Math.min(p.bottom, p.height * 0.5)
  return p
}

/**
 * Monotone kubische Interpolation (Fritsch-Carlson): rund wie ein Spline, aber
 * ohne Ueberschwingen - eine Taille bleibt eine Taille, der Hals wird nicht
 * duenner als seine Stuetzpunkte.
 */
export function profileFunction(points) {
  return profileSpline(points).at
}

/**
 * Die Kurve der Koerperform als Hermite-Stuecke: Stuetzstellen `xs` (Hoehe 0..1), Werte `ys`,
 * Steigung je Punkt fuer das Stueck davor (`mL`) und danach (`mR`), dazu `at(x)`. Jedes Stueck
 * ist eine kubische Kurve - genau so wird es zur Bezier-Kurve (Layerling-Skizze).
 */
export function profileSpline(points) {
  const xs = points.map((pt) => pt[0])
  const ys = points.map((pt) => pt[1])
  const n = xs.length
  if (n === 1) return { xs, ys, mL: [0], mR: [0], at: () => ys[0] }
  const h = []
  const delta = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i])
    delta.push((ys[i + 1] - ys[i]) / h[i])
  }
  // Steigung je Punkt, getrennt fuer das Stueck davor (mL) und danach (mR): rund automatisch
  // (Fritsch-Carlson), Ecke (je Seite die Gerade zum Nachbarn) oder Anfasser (fester Winkel).
  const mL = new Array(n), mR = new Array(n)
  for (let i = 0; i < n; i++) {
    const kind = points[i][2] ?? PROFILE_ROUND
    let m
    if (i === 0) m = delta[0]
    else if (i === n - 1) m = delta[n - 2]
    else if (delta[i - 1] * delta[i] <= 0) m = 0
    else {
      const w1 = 2 * h[i] + h[i - 1]
      const w2 = h[i] + 2 * h[i - 1]
      m = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
    }
    mL[i] = mR[i] = m
    if (kind === PROFILE_CORNER) {
      mL[i] = i > 0 ? delta[i - 1] : delta[0]
      mR[i] = i < n - 1 ? delta[i] : delta[n - 2]
    } else if (kind === PROFILE_HANDLE && Number.isFinite(points[i][3])) mL[i] = mR[i] = points[i][3]
  }
  const at = (x) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    const t = (x - xs[i]) / h[i]
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * mR[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * mL[i + 1]
    )
  }
  return { xs, ys, mL, mR, at }
}

/**
 * Rillenform ueber eine Periode: u in [0, 1), 1 = volle Tiefe in der
 * Rillenmitte (u = 0.5), 0 = Grat. `width` ist der Anteil der Periode, den
 * die Rille einnimmt; der Rest bleibt als Grat stehen.
 */
export function grooveShape(u, width, shape) {
  const x = (u - 0.5) / (width / 2)
  const ax = Math.abs(x)
  if (ax >= 1) return 0
  if (shape === 'v') return 1 - ax
  if (shape === 'flach') return clamp((1 - ax) / 0.25, 0, 1)
  return 0.5 * (1 + Math.cos(Math.PI * x))
}

function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** 1 im Rillenbereich, 0 ausserhalb, weicher Uebergang ueber `zoneFade` mm. */
function zoneMask(z, p) {
  const a = (p.zoneFrom / 100) * p.height
  const b = (p.zoneTo / 100) * p.height
  if (b - a < 1e-6) return 0
  const fade = Math.min(p.zoneFade, (b - a) / 2)
  const lower = a <= 1e-6 ? 1 : smoothstep(a, a + fade, z)
  const upper = b >= p.height - 1e-6 ? 1 : 1 - smoothstep(b - fade, b, z)
  return lower * upper
}

/* ------------------------------------------------------------------ */
/* Gezeichnete Formen pruefen                                          */
/* ------------------------------------------------------------------ */

const MAX_POINTS = 40
/** Querschnitt: mehr Punkte, damit eingelesene SVG-Umrisse genau bleiben (jede Bezier-Ecke ein Punkt). */
export const MAX_DRAW_POINTS = 120
/** Arten eines Punkts der Koerperform (dritter Wert): rund automatisch, Ecke, Anfasser mit fester Steigung. */
export const PROFILE_ROUND = 0
export const PROFILE_CORNER = 1
export const PROFILE_HANDLE = 2
/** Steigung (Radius je Hoehe, beides 0..1) hoechstens so steil - fast waagerecht, aber nie ueberhaengend gespeichert. */
const MAX_PROFILE_SLOPE = 40

/**
 * Punkte eines gezeichneten Querschnitts: { x, y, corner, tx?, ty?, ix?, iy? } im Bereich -1..1.
 * `tx`/`ty`: Tangente nach dem Punkt; `ix`/`iy` (optional): eigene Tangente davor - so wird eine
 * Bezier-Ecke mit ungleichen Griffen genau (SVG-Import). Ohne `ix` gilt `tx` auf beiden Seiten.
 */
export function normalizeDrawPoints(list) {
  if (!Array.isArray(list)) return null
  const out = []
  for (const pt of list.slice(0, MAX_DRAW_POINTS)) {
    const x = Number(pt?.x), y = Number(pt?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const q = { x: clamp(x, -1.2, 1.2), y: clamp(y, -1.2, 1.2), corner: pt.corner === true }
    const tx = Number(pt.tx), ty = Number(pt.ty)
    // Anfasser nur an runden Punkten; eine Ecke hat keine Tangente.
    if (!q.corner && pt.tx !== undefined && pt.tx !== null && Number.isFinite(tx) && Number.isFinite(ty)) {
      q.tx = clamp(tx, -4, 4)
      q.ty = clamp(ty, -4, 4)
      const ix = Number(pt.ix), iy = Number(pt.iy)
      if (pt.ix !== undefined && pt.ix !== null && Number.isFinite(ix) && Number.isFinite(iy)) {
        q.ix = clamp(ix, -4, 4)
        q.iy = clamp(iy, -4, 4)
      }
    }
    out.push(q)
  }
  return out.length >= 2 ? out : null
}

/** Punkte einer gezeichneten Koerperform: [Hoehe 0..1, Radius 0.03..1], nach Hoehe sortiert. */
export function normalizeProfilePoints(list) {
  if (!Array.isArray(list)) return null
  const out = list
    .slice(0, MAX_POINTS)
    .map((pt) => (Array.isArray(pt) ? [Number(pt[0]), Number(pt[1]), Number(pt[2]), Number(pt[3])] : [Number(pt?.t), Number(pt?.r), Number(pt?.kind), Number(pt?.slope)]))
    .filter(([t, r]) => Number.isFinite(t) && Number.isFinite(r))
    .map(([t, r, kind, slope]) => {
      const q = [clamp(t, 0, 1), clamp(r, 0.03, 1)]
      // Rund bleibt kurz [Hoehe, Radius] (wie bisher); Ecke [.., 1]; Anfasser [.., 2, Steigung].
      if (kind === PROFILE_CORNER) q.push(PROFILE_CORNER)
      else if (kind === PROFILE_HANDLE && Number.isFinite(slope)) q.push(PROFILE_HANDLE, clamp(slope, -MAX_PROFILE_SLOPE, MAX_PROFILE_SLOPE))
      return q
    })
    .sort((a, b) => a[0] - b[0])
  if (out.length < 2) return null
  // Unten und oben muss je ein Punkt sitzen, sonst haette die Form keinen Boden bzw. Rand.
  out[0][0] = 0
  out[out.length - 1][0] = 1
  for (let i = 1; i < out.length; i++) if (out[i][0] - out[i - 1][0] < 1e-3) out[i][0] = Math.min(1, out[i - 1][0] + 1e-3)
  return out
}

/** Groesster Winkel einer Drehkurve (Grad) und groesste Steigung (Grad je ganzer Hoehe). */
export const MAX_TWIST_ANGLE = 1080
const MAX_TWIST_SLOPE = 40000

/** Punkte einer Drehkurve: [Hoehe 0..1, Winkel in Grad, Art?, Steigung?], nach Hoehe sortiert, unten und oben je einer. */
export function normalizeTwistPoints(list) {
  if (!Array.isArray(list)) return null
  const out = list
    .slice(0, MAX_POINTS)
    .map((pt) => (Array.isArray(pt) ? [Number(pt[0]), Number(pt[1]), Number(pt[2]), Number(pt[3])] : [Number(pt?.t), Number(pt?.angle), Number(pt?.kind), Number(pt?.slope)]))
    .filter(([t, a]) => Number.isFinite(t) && Number.isFinite(a))
    .map(([t, a, kind, slope]) => {
      const q = [clamp(t, 0, 1), clamp(a, -MAX_TWIST_ANGLE, MAX_TWIST_ANGLE)]
      if (kind === PROFILE_CORNER) q.push(PROFILE_CORNER)
      else if (kind === PROFILE_HANDLE && Number.isFinite(slope)) q.push(PROFILE_HANDLE, clamp(slope, -MAX_TWIST_SLOPE, MAX_TWIST_SLOPE))
      return q
    })
    .sort((a, b) => a[0] - b[0])
  if (out.length < 2) return null
  out[0][0] = 0
  out[out.length - 1][0] = 1
  for (let i = 1; i < out.length; i++) if (out[i][0] - out[i - 1][0] < 1e-3) out[i][0] = Math.min(1, out[i - 1][0] + 1e-3)
  return out
}

/**
 * Drehkurve aus gleichmaessiger Verdrehung und Pendeln: Anfang, jeder Wendepunkt des Pendelns und
 * Ende, je mit der Steigung an dieser Stelle - so sieht die Kurve beim Umschalten aus wie vorher.
 */
export function twistPointsFrom(input) {
  const p = input.twistMode === undefined ? normalizeParams(input) : input
  const sway = p.swayAngle > 0 && p.swayCount > 0
  const at = (t) => p.twist * t + (sway ? p.swayAngle * Math.sin(2 * Math.PI * p.swayCount * t) : 0)
  const slope = (t) => p.twist + (sway ? p.swayAngle * 2 * Math.PI * p.swayCount * Math.cos(2 * Math.PI * p.swayCount * t) : 0)
  const ts = [0]
  if (sway) for (let k = 1; k < 4 * p.swayCount && ts.length < MAX_POINTS - 1; k++) ts.push(k / (4 * p.swayCount))
  ts.push(1)
  return ts.map((t) => [t, Math.round(at(t) * 100) / 100, PROFILE_HANDLE, slope(t)])
}

/** Drehung (Bogenmass) des Querschnitts in der Hoehe t (0..1): gleichmaessig oder nach der Drehkurve. */
export function rotationFunction(p) {
  if (p.twistMode === 'kurve') {
    const spline = profileSpline(p.twistPoints ?? twistPointsFrom(p))
    return (t) => (spline.at(t) * Math.PI) / 180
  }
  const twistRad = (p.twist * Math.PI) / 180
  const swayRad = (p.swayAngle * Math.PI) / 180
  return (t) => twistRad * t + (p.swayCount > 0 ? swayRad * Math.sin(2 * Math.PI * p.swayCount * t) : 0)
}

/* ------------------------------------------------------------------ */
/* Querschnitt                                                          */
/* ------------------------------------------------------------------ */

const TABLE_SIZE = 4096

/** Umriss eines gerundeten Vielecks (erste Ecke bei 0°, faellt auf eine Gitterspalte), groesster Radius 1. */
function polygonOutline(n, round) {
  const half = Math.PI / n
  const d = round * Math.cos(half) // Rundungsradius
  const ri = 1 - d // Eckradius des inneren Vielecks; Ecke + Rundung = 1
  const pts = []
  const arc = d > 1e-6 ? 24 : 0
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n
    const cx = ri * Math.cos(a), cy = ri * Math.sin(a)
    if (arc === 0) pts.push([cx, cy])
    else for (let s = 0; s <= arc; s++) {
      const b = a - half + (2 * half * s) / arc
      pts.push([cx + d * Math.cos(b), cy + d * Math.sin(b)])
    }
  }
  return pts
}

/**
 * Catmull-Rom durch geschlossene Punktfolge; Eckpunkte bekommen keine Tangente (Knick). Ein Punkt
 * mit eigener Tangente davor (`ix`, `iy`) nimmt sie fuer den Abschnitt, der in ihn hineinlaeuft.
 */
function smoothClosed(points, steps = null) {
  const n = points.length
  const out = []
  const tangent = (i, incoming) => {
    const p = points[(i + n) % n]
    if (p.corner) return [0, 0]
    if (incoming && p.ix !== undefined) return [p.ix, p.iy]
    if (p.tx !== undefined) return [p.tx, p.ty]
    const a = points[(i - 1 + n) % n], b = points[(i + 1) % n]
    return [(b.x - a.x) / 2, (b.y - a.y) / 2]
  }
  for (let i = 0; i < n; i++) {
    const p0 = points[i], p1 = points[(i + 1) % n]
    const m0 = tangent(i, false), m1 = tangent(i + 1, true)
    // Ohne feste Zahl: Stuetzstellen nach der Laenge des Stuecks (Kontrollpolygon), damit auch wenige,
    // grosse Boegen (ein Kreis aus vier Stuecken) rund bleiben - hoechstens ~0,001 % daneben.
    let count = steps
    if (!count) {
      const ax = p0.x + m0[0] / 3, ay = p0.y + m0[1] / 3, bx = p1.x - m1[0] / 3, by = p1.y - m1[1] / 3
      const len = Math.hypot(m0[0], m0[1]) / 3 + Math.hypot(bx - ax, by - ay) + Math.hypot(m1[0], m1[1]) / 3
      count = Math.min(400, Math.max(16, Math.ceil(len * 160)))
    }
    for (let s = 0; s < count; s++) {
      const t = s / count, t2 = t * t, t3 = t2 * t
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2
      out.push([h00 * p0.x + h10 * m0[0] + h01 * p1.x + h11 * m1[0], h00 * p0.y + h10 * m0[1] + h01 * p1.y + h11 * m1[1]])
    }
  }
  return out
}

/**
 * Aus dem gezeichneten Grundstueck den ganzen Umriss machen.
 * Haelfte: rechte Seite von oben nach unten, links gespiegelt. Viertel: von oben
 * zur rechten Seite, zweimal gespiegelt. Windmuehle: ein Fluegel, gedreht
 * wiederholt. Frei: der Umriss selbst.
 */
export function drawnSectionPoints(p) {
  const base = (p.drawPoints ?? DRAW_PRESETS[p.drawSymmetry]).map((pt) => {
    const q = { x: pt.x, y: pt.y, corner: pt.corner === true }
    if (!q.corner && pt.tx !== undefined) Object.assign(q, { tx: pt.tx, ty: pt.ty })
    if (!q.corner && pt.tx !== undefined && pt.ix !== undefined) Object.assign(q, { ix: pt.ix, iy: pt.iy })
    return q
  })
  // Gespiegelt und in umgekehrter Reihenfolge: Die Tangente wird mitgespiegelt und kehrt um; eine
  // eigene Tangente davor wird dabei zur Tangente danach und umgekehrt.
  const mirrored = (pt, f) => {
    const q = { ...pt, x: f[0] * pt.x, y: f[1] * pt.y }
    if (pt.tx === undefined) return q
    const out = pt.ix !== undefined ? [pt.ix, pt.iy] : [pt.tx, pt.ty]
    Object.assign(q, { tx: -f[0] * out[0], ty: -f[1] * out[1] })
    if (pt.ix !== undefined) Object.assign(q, { ix: -f[0] * pt.tx, iy: -f[1] * pt.ty })
    return q
  }
  const mirrorX = (pt) => mirrored(pt, [-1, 1])
  const mirrorY = (pt) => mirrored(pt, [1, -1])
  // Auf einer Spiegelachse muss die Tangente senkrecht zur Achse stehen, sonst gaebe es dort einen Knick.
  const symmetric = ({ ix, iy, ...pt }) => pt
  const onYAxis = (pt) => (pt.tx === undefined ? { ...pt, x: 0 } : { ...symmetric(pt), x: 0, ty: 0 })
  const onXAxis = (pt) => (pt.tx === undefined ? { ...pt, y: 0 } : { ...symmetric(pt), y: 0, tx: 0 })
  if (p.drawSymmetry === 'frei') return base
  if (p.drawSymmetry === 'halb') {
    const right = base.map((pt, i) => (i === 0 || i === base.length - 1 ? onYAxis(pt) : pt))
    const left = right.slice(1, -1).reverse().map(mirrorX)
    return [...right, ...left]
  }
  if (p.drawSymmetry === 'viertel') {
    const q1 = base.map((pt, i) => (i === 0 ? onYAxis(pt) : i === base.length - 1 ? onXAxis(pt) : pt))
    const q4 = q1.slice(0, -1).reverse().map(mirrorY)
    const lowerHalf = [...q1, ...q4] // oben -> rechts -> unten
    const left = lowerHalf.slice(1, -1).reverse().map(mirrorX)
    return [...lowerHalf, ...left]
  }
  // Windmuehle: Fluegel k um k * 360/N gedreht (im Uhrzeigersinn), Tangenten mitgedreht.
  const n = p.drawRepeat
  const out = []
  for (let k = 0; k < n; k++) {
    const a = (-2 * Math.PI * k) / n
    const c = Math.cos(a), s = Math.sin(a)
    for (const pt of base) {
      const q = { x: pt.x * c - pt.y * s, y: pt.x * s + pt.y * c, corner: pt.corner }
      if (pt.tx !== undefined) Object.assign(q, { tx: pt.tx * c - pt.ty * s, ty: pt.tx * s + pt.ty * c })
      if (pt.ix !== undefined) Object.assign(q, { ix: pt.ix * c - pt.iy * s, iy: pt.ix * s + pt.iy * c })
      out.push(q)
    }
  }
  return out
}

/**
 * Geschlossene Umrisslinie des Querschnitts (ohne Wellen - die rechnet die Tabelle direkt).
 * `steps`: Stuetzstellen je Abschnitt eines gezeichneten Umrisses (fest, z. B. 16 fuer die
 * Zeichenflaeche); ohne Angabe nach Laenge, so genau wie noetig.
 */
export function sectionOutline(p, steps = null) {
  if (p.section === 'vieleck') return polygonOutline(p.polySides, p.polyRound)
  if (p.section === 'gezeichnet') return smoothClosed(drawnSectionPoints(p), steps)
  return null
}

/** Strahl vom Mittelpunkt in Richtung `th`: aeusserster Schnitt mit den Kanten und Anzahl der Schnitte. */
function castRay(outline, edges, th) {
  const dx = Math.cos(th), dy = Math.sin(th)
  const m = outline.length
  let best = 0
  const found = []
  for (const i of edges) {
    const [x1, y1] = outline[i], [x2, y2] = outline[(i + 1) % m]
    const ex = x2 - x1, ey = y2 - y1
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-14) continue
    const r = (x1 * ey - y1 * ex) / den
    const s = (x1 * dy - y1 * dx) / den
    // Mit kleiner Toleranz: Ein Strahl genau durch eine Ecke darf nicht an beiden Kanten vorbeigehen
    // (sonst faellt der Radius dort auf den Notwert). Dieselbe Ecke zaehlt nur einmal.
    if (s >= -1e-9 && s <= 1 + 1e-9 && r > 0) {
      if (!found.some((f) => Math.abs(f - r) < 1e-9)) found.push(r)
      if (r > best) best = r
    }
  }
  return [best, found.length]
}

const BUCKETS = 512

/** Kanten nach Winkelbereich einsortieren, damit ein Strahl nur wenige Kanten pruefen muss. */
function bucketEdges(outline) {
  const m = outline.length
  const buckets = Array.from({ length: BUCKETS }, () => [])
  const bucketOf = (a) => Math.floor(((a / (2 * Math.PI)) % 1 + 1) % 1 * BUCKETS) % BUCKETS
  for (let i = 0; i < m; i++) {
    const [x1, y1] = outline[i], [x2, y2] = outline[(i + 1) % m]
    const a1 = Math.atan2(y1, x1)
    let span = Math.atan2(y2, x2) - a1
    if (span > Math.PI) span -= 2 * Math.PI
    if (span < -Math.PI) span += 2 * Math.PI
    // Kante durch den Mittelpunkt (oder fast): ueberall pruefen.
    if (Math.abs(Math.abs(span) - Math.PI) < 1e-9) {
      for (const b of buckets) b.push(i)
      continue
    }
    const from = span >= 0 ? a1 : a1 + span
    const first = bucketOf(from)
    const count = Math.floor((Math.abs(span) / (2 * Math.PI)) * BUCKETS) + 2
    for (let k = 0; k <= count; k++) buckets[(first + k) % BUCKETS].push(i)
  }
  return { buckets, bucketOf }
}

/**
 * Radius des Querschnitts je Winkel (groesster Wert 1) als Funktion `at(winkel)`,
 * exakt gerechnet: Wellen direkt aus der Formel, Umrisslinien per Strahl vom
 * Mittelpunkt (aeusserster Schnittpunkt) - so liegen Vieleck-Ecken genau auf
 * den Gitterspalten und Seiten bleiben gerade. Eine Tabelle mit 4096 Winkeln
 * prueft nur die Form: Ein Umriss, den ein Strahl mehrfach schneidet (nicht
 * sternfoermig), wird an diesen Stellen ueberdeckt - das meldet
 * `starShaped: false`. Liegt der Mittelpunkt nicht innen, meldet es `valid: false`.
 */
export function sectionTable(p) {
  let raw, max = 1
  let starShaped = true
  if (p.section === 'welle') {
    const n = p.sectionWaves, a = p.sectionWaveAmp
    const style = p.sectionWaveStyle
    // Lamellen: halbe Breite als Winkel (rund um den Wellenberg) und Rundung der Kante,
    // beides im Mass des Querschnitts (1 = Radius); die Kante ist hoechstens halbrund.
    const half = p.sectionFinWidth / 2
    const halfLen = (half * 2 * Math.PI) / n
    const tip = Math.min(halfLen, 2 * a)
    raw = (th) => {
      const phase = (n * th) / (2 * Math.PI)
      const f = phase - Math.floor(phase)
      if (style === 'lamellen') {
        // Abstand zur Lamellenmitte (Wellenberg bei f = 0) als Anteil der Teilung.
        const d = Math.min(f, 1 - f)
        if (d >= half) return 1 - a
        const e = d / half
        return 1 + a - tip + tip * Math.sqrt(1 - e * e)
      }
      const wave = style === 'spitz' ? 1 - 4 * Math.abs(f - 0.5) : style === 'bogen' ? 2 * Math.abs(Math.cos(Math.PI * f)) - 1 : Math.cos(2 * Math.PI * f)
      return 1 + a * wave
    }
    max = 1 + a
  } else if (p.section === 'vieleck' || p.section === 'gezeichnet') {
    const outline = sectionOutline(p)
    const { buckets, bucketOf } = bucketEdges(outline)
    raw = (th) => castRay(outline, buckets[bucketOf(th)], th)[0]
    max = Math.max(...outline.map(([x, y]) => Math.hypot(x, y)))
    const all = outline.map((_, i) => i)
    for (let k = 0; k < TABLE_SIZE && starShaped; k++) if (castRay(outline, all, (2 * Math.PI * k) / TABLE_SIZE)[1] > 1) starShaped = false
  } else raw = () => 1
  const table = new Float64Array(TABLE_SIZE)
  let min = Infinity, sum = 0
  for (let k = 0; k < TABLE_SIZE; k++) {
    table[k] = max > 0 ? raw((2 * Math.PI * k) / TABLE_SIZE) / max : 1
    min = Math.min(min, table[k])
    sum += table[k]
  }
  const mean = sum / TABLE_SIZE
  // Der Mittelpunkt muss innen liegen; sonst waere der Boden nicht geschlossen.
  const valid = min > 0.02
  const at = (th) => Math.max(max > 0 ? raw(th) / max : 1, 0.02)
  return { table, at, starShaped, valid, min, mean }
}

/** Einstellungen des zweiten Querschnitts (Uebergang) in der Form des ersten - fuer sectionTable und die Zeichenflaeche. */
export function secondSectionParams(p) {
  return { ...p, section: p.section2, polySides: p.section2Sides, polyRound: p.section2Round, sectionWaves: p.section2Waves, sectionWaveAmp: p.section2WaveAmp, sectionWaveStyle: p.section2WaveStyle }
}

/** Anteil des zweiten Querschnitts in der Hoehe z: 0 unten, 1 oben, dazwischen Smoothstep (ohne Knick). */
export function sectionBlend(z, p) {
  if (p.section2 === 'keiner') return 0
  const a = (p.section2From / 100) * p.height, b = (p.section2To / 100) * p.height
  if (b - a < 1e-6) return z < a ? 0 : 1
  const t = clamp((z - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Gewicht des Querschnitts in der Hoehe z: 1 im Bereich `sectionZoneFrom`..`sectionZoneTo`, 0
 * ausserhalb, dazwischen ein glatter Uebergang (Smoothstep, ohne Knick) ueber `sectionZoneFade` mm.
 * Beginnt der Bereich unten bzw. endet er oben, gibt es dort keinen Uebergang.
 */
export function sectionZoneWeight(z, p) {
  const H = p.height
  const a = (p.sectionZoneFrom / 100) * H, b = (p.sectionZoneTo / 100) * H
  if (p.sectionZoneFrom <= 0 && p.sectionZoneTo >= 100) return 1
  const fade = Math.max(1e-6, Math.min(p.sectionZoneFade, (b - a) / 2))
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
  const up = p.sectionZoneFrom <= 0 ? 1 : smooth((z - a) / fade)
  const down = p.sectionZoneTo >= 100 ? 1 : smooth((b - z) / fade)
  return Math.min(up, down)
}

/* ------------------------------------------------------------------ */
/* Oberflaecheneffekte                                                  */
/* ------------------------------------------------------------------ */

function hash2(i, j, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

/** Der Zellpunkt einer Voronoi-Zelle (Schluessel aus Spalte rundum und Zeile), in der Abwicklung nahe bei `uRef`. */
function voronoiSeed(key, uRef, cellsAround, cellW, cellH, seed) {
  const wrapped = Math.floor(key / 100003), j = (key % 100003) - 50
  const i = wrapped + cellsAround * Math.round((Math.round(uRef / cellW) - wrapped) / cellsAround)
  return [(i + 0.1 + 0.8 * hash2(wrapped, j, seed)) * cellW, (j + 0.1 + 0.8 * hash2(wrapped, j, seed + 7919)) * cellH]
}

/**
 * Voronoi-Zellen rundum nahtlos: ein Zufallspunkt je Rasterzelle, die Zellen rundum ganzzahlig. Ergebnis: die
 * Zelle, in der (u, v) liegt (ihr Schluessel), und der Abstand zu ihrer Grenze in mm - genau: der kleinste Abstand
 * zu den Mittelsenkrechten zwischen ihrem Punkt und allen anderen. (Nur der zweitnaechste Punkt, wie frueher,
 * liess den Wert springen, wo drei Zellen zusammenstossen, und die Fugen dort ungleich breit werden.) Gibt den
 * Abstand zurueck; den Schluessel der Zelle legt sie in `voronoiCellKey` (kein Objekt je Aufruf - sie laeuft
 * fuer jeden Punkt der Wand).
 */
let voronoiCellKey = 0

const cellXs = new Float64Array(25)
const cellYs = new Float64Array(25)
const cellKeys = new Float64Array(25)

function voronoiCell(u, v, cellsAround, cellW, cellH, seed) {
  const ci = Math.floor(u / cellW), cj = Math.floor(v / cellH)
  let n = 0, near = 0, best = Infinity
  for (let di = -2; di <= 2; di++) {
    const i = ci + di
    const wrapped = ((i % cellsAround) + cellsAround) % cellsAround
    for (let dj = -2; dj <= 2; dj++) {
      const j = cj + dj
      const px = (i + 0.1 + 0.8 * hash2(wrapped, j, seed)) * cellW
      const py = (j + 0.1 + 0.8 * hash2(wrapped, j, seed + 7919)) * cellH
      const d = (px - u) * (px - u) + (py - v) * (py - v)
      if (d < best) { best = d; near = n }
      cellXs[n] = px
      cellYs[n] = py
      cellKeys[n] = wrapped * 100003 + j + 50
      n++
    }
  }
  const nx = cellXs[near], ny = cellYs[near]
  let edge = Infinity
  for (let k = 0; k < n; k++) {
    if (k === near) continue
    const dx = cellXs[k] - nx, dy = cellYs[k] - ny
    // Nur Punkte, deren Mittelsenkrechte naeher sein kann als die bisher naechste: (d - best) / (2 len) < edge.
    const d = (cellXs[k] - u) * (cellXs[k] - u) + (cellYs[k] - v) * (cellYs[k] - v) - best
    if (d >= 2 * edge * Math.sqrt(dx * dx + dy * dy)) continue
    edge = d / (2 * (Math.sqrt(dx * dx + dy * dy) || 1))
  }
  voronoiCellKey = cellKeys[near]
  return edge
}

/**
 * Schneidet die Aussenwand entlang der Hoehenlinien ihrer Voronoi-Fugen: Jede Linie `levels` (Abstaende zur
 * Zellgrenze in mm, aufsteigend, mit Vorzeichen) wird eine Kante des Netzes. Die Fugen laufen schraeg zum Raster;
 * ohne Schnitt kamen sie als Stufen heraus. Jede Kante des Rasters entscheidet fuer sich: Liegen ihre Enden in einer
 * Zelle, zaehlt der Abstand zu deren Grenze; liegen sie in zwei Zellen, der Abstand mit Vorzeichen zur Grenze
 * genau zwischen diesen beiden - eine Gerade, so sitzt auch der Grund der Fuge genau. Ein Dreieck mit zwei Zellen
 * misst mit Vorzeichen (positiv in der mit dem kleineren Schluessel); eines, an dem drei Zellen oder eine weitere
 * Grenze zusammenkommen, nimmt nur die Punkte seiner Nachbarn auf (ein Punkt in der Mitte, aufgefaechert), ebenso
 * eines, das nicht geschnitten werden darf (`fixed`: an Zeilen, an die andere Teile stossen). Gemeinsame Kanten
 * bekommen dieselben Punkte, das Netz bleibt geschlossen. Neue Punkte liegen auf der Flaeche selbst
 * (`point(theta, z)` gibt ihre Nummer). Liegt ein Schnitt naeher als `eps` an einer Ecke, entfaellt er: Die Ecke
 * gilt als auf der Linie.
 *   wall: { count, v (3 Punkte), e (3 Kanten: a-b, b-c, c-a), p (je Ecke theta, z; abgewickelt), fixed } je Dreieck;
 *   site: { key, edge, u, z } je Punktnummer (Zelle, Abstand zu ihrer Grenze, Lage in der Abwicklung);
 *   seedAt(key, uRef): Zellpunkt nahe uRef; around: Umfang der Abwicklung; edgeCount: Zahl der Kanten.
 */
function sliceVoronoiJoints(wall, site, seedAt, around, edgeCount, levels, eps, point, tris) {
  const lists = new Array(edgeCount)
  const NONE = { lo: -1, signed: false, ids: [], fs: [] }
  const near = (u, uRef) => (u - uRef > around / 2 ? u - around : uRef - u > around / 2 ? u + around : u)
  /** Abstand mit Vorzeichen zur Grenze zwischen den Zellen lo und hi (positiv bei lo) an (u, z), gemessen nahe uRef. */
  const across = (lo, hi, uRef, u, z) => {
    const [ax, ay] = seedAt(lo, uRef), [bx, by] = seedAt(hi, uRef)
    const len = Math.hypot(bx - ax, by - ay) || 1
    return ((u - bx) ** 2 + (z - by) ** 2 - (u - ax) ** 2 - (z - ay) ** 2) / (2 * len)
  }
  const { key: K, edge: E, u: U, z: Z } = site
  const outside = levels[levels.length - 1] + eps
  /** Die Schnitte auf Kante `e` zwischen a und b (von lo nach hi gespeichert); `create`: noch nicht bekannte anlegen. */
  const pointsOn = (e, a, b, ta, za, tb, zb, create) => {
    let list = lists[e]
    if (list || !create) return list ?? NONE
    const lo = a < b ? a : b, hi = a < b ? b : a
    let f0, f1
    const signed = K[lo] !== K[hi]
    if (!signed) {
      f0 = E[lo]
      f1 = E[hi]
    } else {
      const kLo = Math.min(K[lo], K[hi]), kHi = Math.max(K[lo], K[hi])
      f0 = across(kLo, kHi, U[lo], U[lo], Z[lo])
      f1 = across(kLo, kHi, U[lo], near(U[hi], U[lo]), Z[hi])
    }
    const [tlo, zlo, thi, zhi] = a < b ? [ta, za, tb, zb] : [tb, zb, ta, za]
    const min = Math.min(f0, f1), max = Math.max(f0, f1)
    list = NONE
    for (let l = 0; l < levels.length; l++) {
      // Nach dem Weg von lo nach hi geordnet: Die Linien steigen oder fallen mit ihm.
      const L = f1 >= f0 ? levels[l] : levels[levels.length - 1 - l]
      if (!signed && L <= 0) continue
      if (L <= min + eps || L >= max - eps) continue
      if (list === NONE) list = { lo, signed, ids: [], fs: [] }
      const t = (L - f0) / (f1 - f0)
      list.ids.push(point(tlo + t * (thi - tlo), zlo + t * (zhi - zlo)))
      list.fs.push(L)
    }
    lists[e] = list
    return list
  }
  const bounds = [-Infinity, ...levels, Infinity]
  const ringId = [], ringF = [], poly = []
  const deferred = []
  const { v: W, e: WE, p: WP, fixed: WF } = wall
  for (let t = 0; t < wall.count; t++) {
    const a0 = W[t * 3], a1 = W[t * 3 + 1], a2 = W[t * 3 + 2]
    if (WF[t]) {
      deferred.push(t)
      continue
    }
    // Ganz in einer Zelle und weiter als die Fuge von ihrer Grenze: kein Schnitt (die meisten Dreiecke).
    const oneCell = K[a0] === K[a1] && K[a1] === K[a2]
    if (oneCell && E[a0] >= outside && E[a1] >= outside && E[a2] >= outside) {
      tris.push(a0, a1, a2)
      continue
    }
    const lo = Math.min(K[a0], K[a1], K[a2]), hi = Math.max(K[a0], K[a1], K[a2])
    // Drei Zellen nimmt nur Punkte auf; ebenso zwei, wenn der Abstand einer Ecke nicht der zu ihrer gemeinsamen
    // Grenze ist (eine weitere Grenze ist naeher, das Dreieck misst nicht linear).
    if (!oneCell) {
      let skip = false
      for (const c of [a0, a1, a2]) {
        if ((K[c] !== lo && K[c] !== hi) || Math.abs(Math.abs(across(lo, hi, U[a0], near(U[c], U[a0]), Z[c])) - E[c]) > 1e-6) skip = true
      }
      if (skip) {
        deferred.push(t)
        continue
      }
    }
    let n = 0
    for (let k = 0; k < 3; k++) {
      const a = W[t * 3 + k], b = W[t * 3 + ((k + 1) % 3)]
      const sa = oneCell || K[a] === lo ? 1 : -1
      ringId[n] = a
      ringF[n++] = sa * E[a]
      const k2 = (k + 1) % 3
      const list = pointsOn(WE[t * 3 + k], a, b, WP[t * 6 + k * 2], WP[t * 6 + k * 2 + 1], WP[t * 6 + k2 * 2], WP[t * 6 + k2 * 2 + 1], true)
      const m = list.ids.length
      if (!m) continue
      const sg = list.signed ? 1 : sa
      const forward = list.lo === a
      for (let i = 0; i < m; i++) {
        const q = forward ? i : m - 1 - i
        ringId[n] = list.ids[q]
        ringF[n++] = sg * list.fs[q]
      }
    }
    if (n === 3) {
      tris.push(a0, a1, a2)
      continue
    }
    // Je Streifen zwischen zwei Linien: die Punkte des Randes darin, in ihrer Reihenfolge - ein konvexes Vieleck.
    let fMin = Infinity, fMax = -Infinity
    for (let i = 0; i < n; i++) {
      if (ringF[i] < fMin) fMin = ringF[i]
      if (ringF[i] > fMax) fMax = ringF[i]
    }
    for (let sl = 0; sl + 1 < bounds.length; sl++) {
      const min = bounds[sl] - eps, max = bounds[sl + 1] + eps
      if (max < fMin || min > fMax) continue
      let m = 0
      for (let i = 0; i < n; i++) if (ringF[i] >= min && ringF[i] <= max) poly[m++] = ringId[i]
      for (let k = 1; k + 1 < m; k++) tris.push(poly[0], poly[k], poly[k + 1])
    }
  }
  for (const t of deferred) {
    const v = [W[t * 3], W[t * 3 + 1], W[t * 3 + 2]]
    const on = [0, 1, 2].map((k) => {
      const list = lists[WE[t * 3 + k]] ?? NONE
      return list.lo === v[k] ? list.ids : [...list.ids].reverse()
    })
    const used = on.filter((ids) => ids.length).length
    if (!used) {
      tris.push(v[0], v[1], v[2])
      continue
    }
    const ring = []
    for (let k = 0; k < 3; k++) ring.push(v[k], ...on[k])
    if (used === 1) {
      // Ein Faecher von der Ecke gegenueber der Kante mit Punkten: kein Dreieck liegt auf einer Linie.
      const edge = on.findIndex((ids) => ids.length)
      const apex = ring.indexOf(v[(edge + 2) % 3])
      for (let k = 1; k + 1 < ring.length; k++) tris.push(ring[apex], ring[(apex + k) % ring.length], ring[(apex + k + 1) % ring.length])
    } else {
      // Mehrere Kanten mit Punkten: ein Punkt in der Mitte, ringsum aufgefaechert.
      const mid = point((WP[t * 6] + WP[t * 6 + 2] + WP[t * 6 + 4]) / 3, (WP[t * 6 + 1] + WP[t * 6 + 3] + WP[t * 6 + 5]) / 3)
      for (let k = 0; k < ring.length; k++) tris.push(mid, ring[k], ring[(k + 1) % ring.length])
    }
  }
}

/** Tiefe, die der Effekt hoechstens erreicht (fuer die Innenwand). */
function effectDepth(p, ribsActive) {
  if (p.effect === 'rillen') return ribsActive ? p.ribDepth : 0
  if (p.effect === 'streifen') return p.stripeDepth
  if (p.effect === 'voronoi') return p.voronoiDepth
  return 0
}

/** Steigung und Tiefe des Gewindes (mm): Flanken unter 45 Grad (druckt ohne Stuetzen), hoechstens 1,5 mm tief. */
export function threadSize(p) {
  return { pitch: p.threadPitch, depth: Math.min(1.5, 0.3 * p.threadPitch) }
}

/**
 * Gewindeprofil ueber eine Steigung (u 0..1): 0 = Gewindespitze (Material), 1 = Gang (Rille). Trapez mit
 * Flanken unter 45 Grad: je Flanke so viel der Steigung, wie das Gewinde tief ist.
 */
export function threadProfile(u, p) {
  const { pitch, depth } = threadSize(p)
  const f = depth / pitch
  const flat = (1 - 2 * f) / 2
  const x = u - Math.floor(u)
  if (x < flat) return 0
  if (x < flat + f) return (x - flat) / f
  if (x < 2 * flat + f) return 1
  return 1 - (x - 2 * flat - f) / f
}

/**
 * Deckel-Bereich in der Innenwand (nur hohle Vase, nur Schnapp- und Schraubdeckel): wo Nut bzw. Gewinde
 * sitzen. Rechtsgewinde: im Uhrzeigersinn (von oben) gedreht, geht der Deckel nach unten - Phase
 * u = z / Steigung - Winkel / 2 pi. Ein- und Auslauf je eine halbe Steigung (Tiefe von 0 auf voll).
 */
export function lidZone(p) {
  if (p.body !== 'hohl' || p.lamp !== 'keine' || p.insertMode === 'stecker' || p.insertMode === 'roehrchen') return null
  const H = p.height
  if (p.lidMode === 'schnapp') {
    // Nut 3 mm ueber dem unteren Ende der Lippe, 0,5 mm tief, 2,8 mm hoch (Flanken flach, druckt ohne Stuetzen).
    const zc = H - p.lidDepth + 3
    return { kind: 'schnapp', z0: zc - 1.4, z1: zc + 1.4, zc, half: 1.4, depth: 0.5, snap: 0.3 }
  }
  if (p.lidMode === 'schraube') {
    const { pitch, depth } = threadSize(p)
    return { kind: 'schraube', z0: H - p.lidDepth, z1: H, pitch, depth }
  }
  return null
}

/** Tiefe der Gewinderille (0..1) an Winkel und Hoehe, mit Ein- und Auslauf an den Enden des Bereichs. */
export function threadDepthAt(theta, z, zone, p) {
  if (z < zone.z0 || z > zone.z1) return 0
  const ramp = zone.pitch / 2
  const fade = Math.min(1, (z - zone.z0) / ramp, (zone.z1 - z) / ramp)
  return fade * threadProfile(z / zone.pitch - theta / (2 * Math.PI), p)
}

/**
 * Wo die Drehung in der Hoehe z steht (0 unten, 1 oben): nach der Hoehe z / H, oder nach der Bogenlaenge
 * der Koerperform (Kontur, wie ein Sweep in SolidCraft) - Tabelle mit 1024 Schritten, linear dazwischen.
 */
export function twistParameter(p, R, H) {
  if (p.twistAlong !== 'kontur') return (z) => z / H
  const N = 1024
  const s = new Float64Array(N + 1)
  let prev = R(0)
  for (let k = 1; k <= N; k++) {
    const r = R((k / N) * H)
    s[k] = s[k - 1] + Math.hypot(H / N, r - prev)
    prev = r
  }
  const total = s[N] || 1
  return (z) => {
    const x = clamp(z / H, 0, 1) * N
    const k = Math.min(N - 1, Math.floor(x))
    return (s[k] + (s[k + 1] - s[k]) * (x - k)) / total
  }
}

/**
 * Form der Vase ohne Oberflaechen-Effekt, fuer Boden, Zubehoer und Einsaetze: Radius je
 * Winkel und Hoehe (mm), Drehung, Querschnitt. `outerAt(theta, z)` ist die Aussenwand.
 */
export function vaseShape(input) {
  const p = normalizeParams(input)
  const profilePts = p.profile === 'gezeichnet' ? (p.profilePoints ?? DRAW_PROFILE.map((pt) => [...pt])) : PROFILES[p.profile].points
  const profileMax = Math.max(...profilePts.map((pt) => pt[1]))
  const radiusAt = profileFunction(profilePts)
  const maxR = p.diameter / 2
  const H = p.height
  // Drehung des Querschnitts in der Hoehe t (0..1): Verdrehung plus Pendeln oder die Drehkurve. Muster drehen gleich mit.
  const rotation = rotationFunction(p)
  const first = sectionTable(p)
  // Querschnitt-Uebergang: Radius je Winkel aus beiden Querschnitten gemischt. Beide sind sternfoermig
  // (ein Strahl je Winkel), also gibt es keine Zuordnung von Punkten und kein Verdrillen.
  const second = p.section2 !== 'keiner' ? sectionTable(secondSectionParams(p)) : null
  const section = second
    ? { table: first.table, at: first.at, starShaped: first.starShaped && second.starShaped, valid: first.valid && second.valid, min: Math.min(first.min, second.min), mean: Math.max(first.mean, second.mean) }
    : first
  const R = (z) => (maxR * Math.max(0.02, radiusAt(clamp(z / H, 0, 1)))) / profileMax
  const twistT = twistParameter(p, R, H)
  // Ausserhalb des Hoehenbereichs geht der Querschnitt in einen Kreis ueber (mittlerer Radius,
  // an den Spitzen = 1 oder am Grund = kleinster Wert der Tabelle) - beim Uebergang gemischt wie der Querschnitt.
  const roundOf = (s) => ({ mitte: s.mean, spitzen: 1, grund: s.min })[p.sectionOutside]
  const sectionAt = (theta, z) => {
    const th = theta - rotation(twistT(z))
    const b = second ? sectionBlend(z, p) : 0
    const v = b <= 0 ? first.at(th) : b >= 1 ? second.at(th) : first.at(th) + (second.at(th) - first.at(th)) * b
    const w = sectionZoneWeight(z, p)
    if (w >= 1) return v
    const roundTo = b <= 0 ? roundOf(first) : roundOf(first) + (roundOf(second) - roundOf(first)) * b
    return roundTo + (v - roundTo) * w
  }
  const outerAt = (theta, z) => R(z) * sectionAt(theta, z)
  /** Ecke (Zeile i, Spalte j) der Facetten, genau wie buildVase sie setzt. */
  const lowpolyVertex = (i, j) => {
    const seg = p.lowpolyAround, rows = p.lowpolyRows
    const jj = ((j % seg) + seg) % seg
    let theta = (2 * Math.PI * jj) / seg
    let z = (H * i) / rows
    if (p.lowpolyJitter > 0) {
      theta += (hash2(jj, i, p.lowpolySeed) - 0.5) * p.lowpolyJitter * ((2 * Math.PI) / seg)
      if (i > 0 && i < rows) z += (hash2(jj, i, p.lowpolySeed + 31) - 0.5) * p.lowpolyJitter * (H / rows)
    }
    return { theta, z, r: R(z) * sectionAt(theta, z) }
  }
  /** Kleinster Radius der Aussenwand in Hoehe z (ueber alle Winkel). */
  const minOuterAt = (z) => R(z) * section.min
  // Innenwand (hohle Vase): Abstand `wall` senkrecht zur Flaeche hinter dem tiefsten Punkt des
  // Effekts; rund = Kreis durch die engste Stelle des Querschnitts.
  const ribsActive = p.effect === 'rillen' && p.ribCount > 0 && p.ribDepth > 0
  const lowpoly = p.effect === 'lowpoly'
  const maxDepth = effectDepth(p, ribsActive)
  // Facetten: Jeder Punkt einer Facette liegt hoechstens um den halben Winkel einer (verschobenen)
  // Spalte innen von der kleinsten Ecke in der Naehe - die Innenwand bleibt darunter.
  const lowpolyFloorAt = (theta, z) => {
    const seg = p.lowpolyAround, rows = p.lowpolyRows
    const jc = Math.floor((((theta / (2 * Math.PI)) % 1) + 1) % 1 * seg)
    const ic = Math.floor((Math.min(H, Math.max(0, z)) / H) * rows)
    let m = Infinity
    for (let j = jc - 1; j <= jc + 2; j++) for (let i = Math.max(0, ic - 1); i <= Math.min(rows, ic + 2); i++) m = Math.min(m, lowpolyVertex(i, j).r)
    return m * Math.cos(Math.min(1.4, ((1 + p.lowpolyJitter) * Math.PI) / seg))
  }
  // Rand unten bei Facetten: das Vieleck der untersten Ecken, genau.
  const lowpolyRim = lowpoly ? Array.from({ length: p.lowpolyAround }, (_, j) => { const v = lowpolyVertex(0, j); return [v.r * Math.cos(v.theta), v.r * Math.sin(v.theta)] }) : null
  const lowpolyRimEdges = lowpoly ? lowpolyRim.map((_, i) => i) : null
  const slopeZ = (z) => (R(Math.min(H, z + 0.5)) - R(Math.max(0, z - 0.5))) / (Math.min(H, z + 0.5) - Math.max(0, z - 0.5))
  const dAngle = (2 * Math.PI) / TABLE_SIZE
  const roundInner = p.innerShape === 'rund' && !lowpoly
  const innerSection = Math.max(0.02, section.min * 0.999)
  const baseInnerAt = (theta, z) => {
    const tiltZ = Math.sqrt(1 + slopeZ(z) ** 2)
    const zoneDepth = maxDepth * (lowpoly ? 0 : zoneMask(z, p))
    const sec = roundInner ? innerSection : sectionAt(theta, z)
    // Neigung des Querschnitts: Wand senkrecht zur Kontur messen, nicht nur radial.
    const ds = roundInner ? 0 : (sectionAt(theta + dAngle, z) - sectionAt(theta - dAngle, z)) / (2 * dAngle)
    const tiltTheta = Math.sqrt(1 + (ds / Math.max(sec, 1e-6)) ** 2)
    const base = lowpoly ? lowpolyFloorAt(theta, z) : R(z) * sec
    return Math.max(0.5, base - Math.min(zoneDepth, base / 3) - p.wall * Math.min(3, tiltZ * tiltTheta))
  }
  // Deckel: Nut fuer den Schnappdeckel bzw. Innengewinde fuer den Schraubdeckel unter dem Rand. Das
  // Gewinde braucht einen runden Hals: dort die engste Stelle der Innenwand, darunter ein Uebergang
  // unter 45 Grad (kein Ueberhang innen).
  const lid = lidZone(p)
  let neck = 0
  if (lid?.kind === 'schraube') {
    neck = Infinity
    for (let i = 0; i <= 16; i++) for (let k = 0; k < 720; k++) neck = Math.min(neck, baseInnerAt((2 * Math.PI * k) / 720, lid.z0 + ((H - lid.z0) * i) / 16))
  }
  const innerAt = !lid ? baseInnerAt : lid.kind === 'schnapp'
    ? (theta, z) => {
      const d = Math.abs(z - lid.zc) / lid.half
      return baseInnerAt(theta, z) + (d >= 1 ? 0 : lid.depth * (1 - d))
    }
    : (theta, z) => {
      if (z < lid.z0) return Math.min(baseInnerAt(theta, z), neck + (lid.z0 - z))
      return neck + lid.depth * threadDepthAt(theta, z, lid, p)
    }
  /** Rand des Bodens aussen (bei Facetten das Vieleck der untersten Ecken). */
  const rimAt = (theta) => (lowpoly ? castRay(lowpolyRim, lowpolyRimEdges, theta)[0] || outerAt(theta, 0) * 0.5 : outerAt(theta, 0))
  return { p, H, maxR, R, rotation, twistT, section, sectionAt, outerAt, minOuterAt, innerAt, baseInnerAt, rimAt, lowpolyVertex, lid, neck }
}

/** Liegt ein Kreis (cx, cy, r) mit Abstand `margin` ganz innerhalb des Rands `radiusAt(winkel)`? */
function circleFits(h, radiusAt, margin) {
  for (let k = 0; k < 96; k++) {
    const a = (2 * Math.PI * k) / 96
    const x = h.cx + (h.r + margin) * Math.cos(a), y = h.cy + (h.r + margin) * Math.sin(a)
    if (Math.hypot(x, y) > radiusAt(Math.atan2(y, x)) * 0.97) return false
  }
  // Spitze Kerben im Rand (Boegen, Ecken) koennen zwischen zwei Messstellen in den Kreis ragen:
  // den Rand selbst dicht abtasten, im Winkelbereich des Kreises.
  const d = Math.hypot(h.cx, h.cy)
  const need = h.r + margin
  const span = d > need ? Math.asin(Math.min(1, need / d)) + 0.05 : Math.PI
  const a0 = Math.atan2(h.cy, h.cx)
  for (let k = 0; k <= 720; k++) {
    const a = a0 - span + (2 * span * k) / 720
    const r = radiusAt(a)
    if (Math.hypot(r * Math.cos(a) - h.cx, r * Math.sin(a) - h.cy) < need) return false
  }
  return true
}
const apart = (a, b, gap) => Math.hypot(a.cx - b.cx, a.cy - b.cy) >= a.r + b.r + gap
const fmtMm = (v) => (Math.round(v * 10) / 10).toLocaleString('de-DE')

/** Zapfen eines Steckbeins: Radius und Laenge (mm) aus der Dicke des Beins. */
export function legPeg(p) {
  const r = clamp(p.legDiameter * 0.25, 2.5, 6)
  return { r, length: clamp(r * 2.4, 5, 12) }
}

/**
 * Wo im Boden etwas sitzt (mm, Mitte der Vase = 0): Ablaufloecher (durch den Boden),
 * Buchsen fuer Steckbeine und Mulden fuer Gummifuesse (von unten, blind), dazu die noetige
 * Bodenstaerke und Hinweise fuer die Seite. Alles passt in den Boden; was nicht passt, wird
 * weniger oder rutscht nach innen - und steht in `notes`.
 */
export function floorLayout(input) {
  const shape = vaseShape(input)
  const p = shape.p
  const notes = []
  const hollow = p.body === 'hohl'
  // Lampe ueber einem LED-Puck: ohne Boden und ohne Fuss.
  const lamp = hollow ? p.lamp : 'keine'
  if (!hollow && p.lamp !== 'keine') notes.push('Ein Lampenschirm braucht eine hohle Vase (Bauart „Hohl mit Wand“).')
  const foot = hollow && lamp !== 'puck' ? Math.min(p.footHeight, p.height * 0.4) : 0
  const blind = []
  // Steckbeine: Buchsen nur in einem hohlen Boden ohne Fuss (im Slicer-Vasenmodus ist der Boden duenn).
  const legs = []
  if (p.legMode !== 'keine') {
    for (let k = 0; k < p.legCount; k++) {
      const a = (2 * Math.PI * k) / p.legCount + Math.PI / p.legCount
      const legR = p.legDiameter / 2
      // Rand ueber die ganze Auflage des Beins messen (bei Lamellen der Kern, nicht die Rippe).
      const reach = (legR + 2) / Math.max(5, shape.outerAt(a, 0))
      let rim = Infinity
      for (let s = -4; s <= 4; s++) rim = Math.min(rim, shape.outerAt(a + (reach * s) / 4, 0))
      // Die Mitte des Beins sitzt um `legInset` vom Rand nach innen, das Bein ragt nicht ueber den Rand.
      const r = Math.max(legR * 0.6, Math.min(rim * (1 - p.legInset), rim - legR * 0.85))
      legs.push({ angle: a, x: r * Math.cos(a), y: r * Math.sin(a), rim })
    }
  }
  const peg = legPeg(p)
  if (p.legMode === 'stecken') {
    if (!hollow) notes.push('Steckbeine brauchen eine hohle Vase: Im Slicer-Vasenmodus ist der Boden zu dünn für Buchsen. Ohne Buchsen gebaut.')
    else if (foot > 0) notes.push('Mit hohlem Fuß gibt es keine Buchsen für Steckbeine – dort besser einen Ständer nehmen.')
    else {
      let dropped = 0
      for (const leg of legs) {
        // Passt die Buchse nicht in den Boden oder stoesst an die naechste, rutscht sie nach innen.
        let h = null
        for (let f = 1; f >= 0.3 && !h; f -= 0.1) {
          const c = { kind: 'buchse', cx: leg.x * f, cy: leg.y * f, r: peg.r + p.fitClearance, depth: peg.length + 0.6 }
          if (circleFits(c, shape.rimAt, 1.5) && blind.every((b) => apart(b, c, 2))) h = c
        }
        if (h) { blind.push(h); leg.x = h.cx; leg.y = h.cy; leg.socket = true } else { leg.socket = false; dropped++ }
      }
      if (dropped) notes.push(`${dropped === 1 ? 'Eine Buchse passt' : `${dropped} Buchsen passen`} nicht in den Boden – ${dropped === 1 ? 'dieses Bein entfällt' : 'diese Beine entfallen'}. Weniger oder dünnere Beine wählen.`)
    }
  }
  if (p.rubberFeet > 0 && p.legMode === 'keine' && foot === 0) {
    for (let k = 0; k < p.rubberFeet; k++) {
      const a = (2 * Math.PI * k) / p.rubberFeet + Math.PI / p.rubberFeet
      const fr = p.rubberFootDiameter / 2 + p.fitClearance
      const reach = (fr + 2) / Math.max(5, shape.outerAt(a, 0))
      let rim = Infinity
      for (let s = -4; s <= 4; s++) rim = Math.min(rim, shape.rimAt(a + (reach * s) / 4))
      const r = Math.max(0, rim - fr - Math.max(3, rim * 0.08))
      const c = { kind: 'mulde', cx: r * Math.cos(a), cy: r * Math.sin(a), r: fr, depth: p.rubberFootDepth }
      if (circleFits(c, shape.rimAt, 1.5) && blind.every((b) => apart(b, c, 2))) blind.push(c)
    }
    if (blind.length < p.rubberFeet) notes.push(`Nur ${blind.length} Mulden für Gummifüße passen in den Boden.`)
    if (!hollow) notes.push('Mulden für Gummifüße: die Vase normal drucken, nicht im Slicer-Vasenmodus (dort ist der Boden nur wenige Schichten dick).')
  }
  if (lamp === 'puck' && (blind.length || legs.some((l) => l.socket))) {
    blind.length = 0
    for (const leg of legs) leg.socket = false
    notes.push('Ohne Boden (über einem LED-Puck) gibt es keine Buchsen und Mulden.')
  }
  const deepest = Math.max(0, ...blind.map((b) => b.depth))
  let floor = p.bottom
  if (hollow && deepest + 1.2 > floor) {
    floor = deepest + 1.2
    notes.push(`Boden auf ${floor.toFixed(1).replace('.', ',')} mm verstärkt, damit die Buchsen bzw. Mulden nicht durchgehen.`)
  }
  // Lampenschirm mit Fassung: Boden mindestens 2,5 mm, in der Mitte das Loch fuer die Fassung.
  if (lamp === 'haengend' || lamp === 'stehend') {
    if (floor < 2.5) { floor = 2.5; notes.push('Boden auf 2,5 mm verstärkt – er trägt den Schirm an der Fassung.') }
  }
  if (lamp === 'puck') floor = 0
  // Ablaufloecher in der Mitte und auf einem Ring; der Innenboden faellt zu ihnen hin ab.
  const drains = []
  let slope = 0
  if (lamp === 'haengend' || lamp === 'stehend') {
    const hole = { cx: 0, cy: 0, r: p.lampHole / 2 }
    const floorAt = (a) => Math.min(shape.innerAt(a, foot + floor), foot > 0 ? shape.innerAt(a, foot) : shape.rimAt(a))
    if (circleFits(hole, floorAt, 1.5)) drains.push(hole)
    else notes.push(`Das Loch für die Fassung (Ø ${fmtMm(p.lampHole)} mm) passt nicht in den Boden – die Vase unten breiter machen.`)
    if (p.drainHoles > 0) notes.push('Beim Lampenschirm gibt es statt Ablauflöchern das Loch für die Fassung.')
    if (lamp === 'haengend') notes.push(`Hängend: Zum Aufhängen umdrehen – die Platte mit dem Loch (Ø ${fmtMm(p.lampHole)} mm) kommt oben auf die Fassung und wird vom Schirmring gehalten. Lochmaß an der eigenen Fassung nachmessen.`)
    else notes.push(`Stehend: Fassung im Bodenloch (Ø ${fmtMm(p.lampHole)} mm) mit dem Schirmring befestigen, das Kabel läuft durch den hohlen Fuß${p.lampNotch > 0 ? ' und den Schlitz' : ''}. Fuß so hoch wählen, dass der Fassungskörper darunter Platz hat – nachmessen.`)
  } else if (lamp === 'puck') {
    // Innen unten muss der Puck hineinpassen.
    let inner = Infinity
    for (let k = 0; k < 72; k++) inner = Math.min(inner, shape.innerAt((2 * Math.PI * k) / 72, 0))
    if (2 * inner < p.puckDiameter + 2) notes.push(`Der LED-Puck (Ø ${fmtMm(p.puckDiameter)} mm) passt nicht hinein – unten innen sind es nur Ø ${fmtMm(2 * inner)} mm.`)
    if (p.drainHoles > 0) notes.push('Ohne Boden (über einem LED-Puck) gibt es keine Ablauflöcher.')
  }
  if (lamp !== 'keine') notes.push('Nur LED-Leuchtmittel verwenden: PLA wird ab etwa 55 °C weich, PETG ab etwa 80 °C.')
  if (lamp === 'keine' && hollow && p.drainHoles > 0) {
    const r = p.drainDiameter / 2
    // Ein Ablaufloch geht durch beide Seiten des Bodens: es muss in den Innenboden oben und in die
    // Unterseite (Rand aussen bzw. Wand des hohlen Fusses) passen.
    const top = (a) => shape.innerAt(a, foot + floor)
    const under = foot > 0 ? (a) => shape.innerAt(a, foot) : shape.rimAt
    const floorAt = (a) => Math.min(top(a), under(a))
    const innerMin = Math.max(5, Math.min(...Array.from({ length: 36 }, (_, k) => floorAt((2 * Math.PI * k) / 36))))
    const candidates = [{ cx: 0, cy: 0, r }]
    const ring = p.drainHoles - 1
    const rr = Math.max(r * 2 + 2, innerMin * 0.45)
    for (let k = 0; k < ring; k++) {
      const a = (2 * Math.PI * k) / ring + 0.4
      candidates.push({ cx: rr * Math.cos(a), cy: rr * Math.sin(a), r })
    }
    for (const c of candidates) if (circleFits(c, floorAt, 1.2) && [...drains, ...blind].every((b) => apart(b, c, 2))) drains.push(c)
    if (drains.length < p.drainHoles) notes.push(drains.length ? `Nur ${drains.length} Ablauflöcher passen in den Boden.` : 'Kein Ablaufloch passt in den Boden – kleiner wählen.')
    slope = Math.min(p.floorSlope, Math.max(0, floor - 1.2))
    if (p.floorSlope > slope + 1e-9) notes.push(`Gefälle auf ${slope.toFixed(1).replace('.', ',')} mm begrenzt (Boden ${floor.toFixed(1).replace('.', ',')} mm).`)
  } else if (!hollow && p.drainHoles > 0) notes.push('Ablauflöcher gibt es nur bei einer hohlen Vase.')
  // Kabelschlitz unten (stehend im Fuss, ueber dem Puck in der Wand): ein Bereich mit offenem Rand.
  let notchZone = null
  if ((lamp === 'stehend' || lamp === 'puck') && p.lampNotch > 0) {
    const top = p.lampNotchHeight + 2
    if (lamp === 'stehend' && foot < top + 1) notes.push(`Für den Kabelschlitz (${fmtMm(p.lampNotchHeight)} mm hoch) braucht es einen hohlen Fuß von mindestens ${fmtMm(top + 1)} mm.`)
    else notchZone = { z0: 0, z1: top, open: true, kind: 'notch' }
  }
  // Durchbrochene Wand: Hoehenbereich ueber dem Boden und unter dem Rand, je mit vollem Streifen.
  let cutoutZone = null
  if (p.cutout !== 'keine') {
    if (!hollow) notes.push('Eine durchbrochene Wand gibt es nur bei einer hohlen Vase (Bauart „Hohl mit Wand“).')
    else if (p.effect === 'lowpoly') notes.push('Eine durchbrochene Wand geht nicht zusammen mit Facetten.')
    else {
      const band = Math.max(1.5, p.cutoutWeb)
      const z0 = Math.max((p.cutoutFrom / 100) * p.height, foot + floor + band, notchZone ? notchZone.z1 + band : 0)
      const z1 = Math.min((p.cutoutTo / 100) * p.height, p.height - band)
      if (z1 - z0 < 2 * p.cutoutWeb + 2) notes.push('Der Bereich für die Durchbrüche ist zu klein – „ab“ und „bis Höhe“ weiter auseinanderstellen.')
      else {
        cutoutZone = { z0, z1 }
        if (p.cutoutEdge === 'ganz' && p.cutout !== 'voronoi' && cutoutFieldFor(p, shape, cutoutZone).rows === 0) notes.push('Bei „Nur ganze Löcher“ passt keine Lochreihe in den Bereich – den Bereich höher oder die Zellen kleiner stellen.')
      }
    }
  }
  // Vasenmodus stabiler: nur beim vollen Koerper; Doppelwand braucht Platz fuer zwei Waende und Stege.
  let reinforce = null
  if (p.reinforce !== 'keine') {
    if (hollow) notes.push('Rippen und Doppelwand sind für den Slicer-Vasenmodus (Bauart „Voll“) – bei einer hohlen Vase ohne Wirkung.')
    else if (p.effect === 'lowpoly') notes.push('Rippen und Doppelwand gehen nicht zusammen mit Facetten.')
    else if (p.reinforce === 'doppelwand' && p.reinforceDepth < 4 * p.lineWidth + p.slitWidth) notes.push(`Die Wände stehen zu dicht für Stege – Abstand mindestens ${(4 * p.lineWidth + p.slitWidth).toFixed(1).replace('.', ',')} mm (vier Linienbreiten).`)
    else {
      reinforce = { floor: Math.max(0.6, p.bottom) }
      // Nachgemessen mit PrusaSlicer 2.7 (Spiral-Vasenmodus): Spalten unter 2 x „Slice gap closing radius“
      // (Vorgabe 0,049 mm) schliesst der Slicer - dann druckt er eine einfache Wand ohne Rippen.
      const mm = (v, d = 2) => v.toFixed(d).replace('.', ',')
      const lw = `Slicer: Spiral-Vasenmodus an, Linienbreite außen ${mm(p.lineWidth)} mm (wie hier eingestellt).`
      if (p.slitWidth / 2 > 0.049) notes.push(`${lw} Die Schlitze (${mm(p.slitWidth)} mm) bleiben mit den Standardwerten erhalten; die beiden Linien einer Rippe liegen ${mm(p.slitWidth)} mm auseinander. Fest verschmolzen: Schlitzbreite 0,03 mm und im Slicer „Slice gap closing radius“ 0,01 mm (PrusaSlicer, OrcaSlicer, Bambu Studio).`)
      else notes.push(`${lw} Wichtig: „Slice gap closing radius“ (PrusaSlicer, OrcaSlicer, Bambu Studio) auf höchstens ${mm(Math.max(0.001, p.slitWidth / 2 - 0.005), 3)} mm stellen – sonst schließt der Slicer die ${mm(p.slitWidth)}-mm-Schlitze und druckt eine einfache Wand.`)
    }
  }
  return { shape, foot, floor, slope, drains, blind, legs, peg, notes, cutoutZone, notchZone, reinforce, lamp }
}

/**
 * Druckbarkeit und Wasserdichtheit pruefen, als Hinweise fuer Seite und Kommandozeile:
 * Ueberhang ueber 45 Grad (mit Hoehe), Wand und Boden unter zwei Duesenbreiten, Widersprueche zu
 * „Muss Wasser halten“ und Slicer-Hinweise dafuer.
 */
export function vaseChecks(input) {
  const p = normalizeParams(input)
  const notes = []
  const shape = vaseShape(p)
  const H = p.height
  // Ueberhang der Aussenwand: Neigung der Flaeche aus Ableitungen nach Winkel und Hoehe (samt Drehung).
  const N = 180, dz = 0.5
  const limit = Math.sin(Math.PI / 4)
  let worst = 0
  const ranges = []
  for (let z = dz; z < H - dz; z += 1) {
    let rowWorst = 0
    for (let k = 0; k < N; k++) {
      const th = (2 * Math.PI * k) / N
      const r = shape.outerAt(th, z)
      const rTheta = (shape.outerAt(th + 1e-3, z) - shape.outerAt(th - 1e-3, z)) / 2e-3
      const rZ = (shape.outerAt(th, z + dz) - shape.outerAt(th, z - dz)) / (2 * dz)
      // Normale (r, -r_theta, -r r_z) im mitdrehenden Rahmen; nach unten, wenn r_z > 0.
      const nz = (-r * rZ) / Math.hypot(r, rTheta, r * rZ)
      if (-nz > rowWorst) rowWorst = -nz
    }
    if (rowWorst > limit) {
      const last = ranges.at(-1)
      if (last && z - last.to <= 1.01) { last.to = z; last.max = Math.max(last.max, rowWorst) } else ranges.push({ from: z, to: z, max: rowWorst })
    }
    worst = Math.max(worst, rowWorst)
  }
  for (const r of ranges.slice(0, 3)) {
    const deg = Math.round((Math.asin(Math.min(1, r.max)) * 180) / Math.PI)
    notes.push(`Überhang bis ${deg}° zwischen ${fmtMm(r.from)} und ${fmtMm(r.to)} mm Höhe (mehr als 45°) – dort braucht es Stützen, oder die Form steiler machen.`)
  }
  if (p.body === 'hohl') {
    if (p.wall < 2 * NOZZLE) notes.push(`Wand nur ${fmtMm(p.wall)} mm – unter zwei Linien einer 0,4-mm-Düse druckt sie sich unsicher.`)
    if (p.bottom < 2 * NOZZLE && p.lamp !== 'puck') notes.push(`Boden nur ${fmtMm(p.bottom)} mm – unter 0,8 mm wird er leicht undicht oder reißt.`)
  }
  if (p.lidMode !== 'keiner') {
    if (p.lidMode !== 'stuelp' && p.body !== 'hohl') notes.push(`Ein ${LID_MODES[p.lidMode]} braucht eine hohle Vase (Nut bzw. Gewinde in der Wand).`)
    else if (p.lamp !== 'keine') notes.push('Ein Lampenschirm bekommt keinen Deckel.')
    else if (p.insertMode === 'stecker' || p.insertMode === 'roehrchen') notes.push('Deckel und Steckeinsatz bzw. Wasserröhrchen liegen beide auf dem Rand – nur eins von beiden.')
    else if (shape.lid) {
      // Wand neben Nut bzw. Gewinde: mindestens 1 mm Material.
      let thin = Infinity
      for (let i = 0; i <= 8; i++) for (let k = 0; k < 360; k++) {
        const th = (2 * Math.PI * k) / 360, z = shape.lid.z0 + ((shape.lid.z1 - shape.lid.z0) * i) / 8
        thin = Math.min(thin, shape.outerAt(th, z) - (shape.lid.kind === 'schraube' ? shape.neck + shape.lid.depth : shape.innerAt(th, z)))
      }
      if (thin < 1) notes.push(`Neben ${shape.lid.kind === 'schraube' ? 'dem Gewinde' : 'der Nut'} bleiben nur ${fmtMm(Math.max(0, thin))} mm Wand – dickere Wand oder ${shape.lid.kind === 'schraube' ? 'kleinere Steigung' : 'Schnapp gegen Stülpdeckel tauschen'}.`)
    }
  }
  if (p.cutout !== 'keine' && p.body === 'hohl' && p.cutout !== 'rauten') notes.push('Durchbrüche: Die Oberkante jedes Lochs überbrückt der Drucker frei; Rauten mit steilen Kanten drucken sich am saubersten.')
  if (p.watertight === 'ja') {
    const conflicts = []
    if (p.body === 'hohl' && p.drainHoles > 0 && p.lamp === 'keine') conflicts.push('Ablauflöcher')
    if (p.body === 'hohl' && p.cutout !== 'keine') conflicts.push('die durchbrochene Wand')
    if (p.body === 'hohl' && p.lamp !== 'keine') conflicts.push('der Lampenschirm')
    if (conflicts.length) notes.push(`„Muss Wasser halten“ und ${conflicts.join(', ')} widersprechen sich.`)
    if (p.body === 'hohl') notes.push(`Wasserdicht: Wand und Boden mindestens ${fmtMm(WATERTIGHT_MIN)} mm; im Slicer mindestens drei Wandlinien und fünf Bodenschichten, eher etwas mehr Fluss bzw. Temperatur. Erst mit Wasser über dem Spülbecken prüfen.`)
    else notes.push('Wasserdicht im Vasenmodus: eine breitere Linie (etwa 0,6–0,8 mm bei einer 0,4-mm-Düse) und etwas mehr Temperatur machen die eine Wand dicht; Rippen innen bzw. Doppelwand machen sie fester. Erst mit Wasser über dem Spülbecken prüfen.')
  }
  return notes
}

/**
 * Baut die Vase. Liefert ein dreiecksweises Netz (je 9 Zahlen pro Dreieck,
 * aussen gegen den Uhrzeigersinn = Normale nach aussen) und Kennzahlen.
 * Der Koerper ist geschlossen (wasserdicht): Jede Kante gehoert genau zwei
 * Dreiecken - so verlangen es Slicer und Layerling.
 */
export function buildVase(input) {
  const layout = floorLayout(input)
  const { shape } = layout
  const { p, H, maxR, rotation, twistT, section, R, sectionAt } = shape
  const q = QUALITY[p.quality]

  const ribsActive = p.effect === 'rillen' && p.ribCount > 0 && p.ribDepth > 0
  const lowpoly = p.effect === 'lowpoly'

  // Spalten rundum: so viele, wie Querschnitt und Effekt brauchen. Ecken von
  // Vieleck und spitzer Welle fallen genau auf Spalten.
  const scale = { entwurf: 0.6, standard: 1, fein: 1.6 }[p.quality]
  let segments
  if (lowpoly) segments = p.lowpolyAround
  else {
    const needs = [q.smoothSegments]
    for (const s of p.section2 !== 'keiner' ? [p, secondSectionParams(p)] : [p]) {
      if (s.section === 'vieleck') needs.push(s.polySides * Math.ceil(24 * scale))
      if (s.section === 'welle') needs.push(s.sectionWaves * Math.ceil((s.sectionWaveStyle === 'lamellen' ? 32 : 16) * scale))
      if (s.section === 'gezeichnet') needs.push(Math.ceil(720 * scale))
    }
    if (ribsActive) needs.push(p.ribCount * q.perRib)
    if (p.effect === 'streifen') needs.push(p.stripeCount * q.perRib)
    // Voronoi: die Fugen werden entlang ihrer Hoehenlinien geschnitten (sliceVoronoiJoints) - das Raster muss sie
    // nicht mehr selbst nachbilden, anderthalb Punkte je Fugenbreite reichen.
    if (p.effect === 'voronoi') needs.push(Math.ceil((2 * Math.PI * maxR) / (p.voronoiGap / (1.5 * scale))))
    if (layout.cutoutZone) needs.push(Math.ceil((2 * Math.PI * maxR) / cutoutStep(p)))
    segments = Math.min(MAX_SEGMENTS, Math.max(...needs))
    // Scharfe Stellen (Ecken, Kerben, Lamellenkanten) fallen so auf Spalten - beim Uebergang die beider
    // Querschnitte (kleinstes gemeinsames Vielfaches, solange es in die Hoechstzahl passt).
    const alignOf = (s) => {
      const sharp = { spitz: 2, bogen: 2, lamellen: 4 }[s.sectionWaveStyle]
      return s.section === 'vieleck' ? s.polySides : s.section === 'welle' && sharp ? sharp * s.sectionWaves : 1
    }
    let align = alignOf(p)
    if (p.section2 !== 'keiner') {
      const b = alignOf(secondSectionParams(p))
      const gcd = (x, y) => (y ? gcd(y, x % y) : x)
      const both = (align * b) / gcd(align, b)
      align = both <= MAX_SEGMENTS ? both : Math.max(align, b)
    }
    if (align > 1) segments = Math.ceil(segments / align) * align
  }
  // Zeilen: Hoehe in mm-Schritten; Streifen mit Spirale und Voronoi brauchen mehr.
  let rows
  if (lowpoly) rows = p.lowpolyRows
  else {
    let mmPerRow = q.mmPerRow
    if (p.effect === 'voronoi') mmPerRow = Math.min(mmPerRow, p.voronoiGap / (1.5 * scale))
    rows = Math.ceil(H / mmPerRow)
    // Pendeln: je Schwung mindestens 24 Zeilen, damit die Falten rund schwingen; Drehkurve: je Punkt 12.
    if (p.twistMode === 'kurve') rows = Math.max(rows, (p.twistPoints?.length ?? 2) * 12)
    else if (p.swayAngle > 0 && p.swayCount > 0) rows = Math.max(rows, Math.ceil(p.swayCount * 24))
    if (p.effect === 'streifen' && p.stripeTurn !== 0) rows = Math.max(rows, Math.ceil((p.stripeCount * Math.abs(p.stripeTurn) * q.perRib) / 360))
    rows = Math.min(MAX_ROWS, Math.max(24, rows))
  }

  const zone = (z) => zoneMask(z, p)

  // Effekt: Tiefe (mm, nach innen) an Winkel/Hoehe; dreht mit der Verdrehung mit.
  const cellsAround = Math.max(3, Math.round((2 * Math.PI * maxR) / p.voronoiCell))
  const cellW = (2 * Math.PI * maxR) / cellsAround
  const effectAt = (theta, z, base) => {
    const t = z / H
    const turn = theta - rotation(twistT(z))
    if (ribsActive) {
      const depth = Math.min(p.ribDepth, base / 3) * zone(z)
      if (depth <= 0) return 0
      const shift = p.waveCount > 0 ? (p.waveAmplitude / base) * Math.sin(2 * Math.PI * p.waveCount * t) : 0
      const phase = (p.ribCount * (turn + shift)) / (2 * Math.PI)
      return depth * grooveShape(phase - Math.floor(phase), p.grooveWidth, p.ribShape)
    }
    if (p.effect === 'streifen') {
      const depth = Math.min(p.stripeDepth, base / 3) * zone(z)
      if (depth <= 0) return 0
      const spin = ((p.stripeTurn * Math.PI) / 180) * t
      const a = (p.stripeCount * (turn + spin)) / (2 * Math.PI)
      let g = grooveShape(a - Math.floor(a), p.stripeWidth, 'rund')
      if (p.stripeStyle === 'doppelt') {
        const b = (p.stripeCount * (turn - spin)) / (2 * Math.PI)
        g = Math.max(g, grooveShape(b - Math.floor(b), p.stripeWidth, 'rund'))
      }
      return depth * g
    }
    if (p.effect === 'voronoi') {
      const depth = Math.min(p.voronoiDepth, base / 3) * zone(z)
      if (depth <= 0) return 0
      const u = ((((turn / (2 * Math.PI)) % 1) + 1) % 1) * 2 * Math.PI * maxR
      const edge = voronoiCell(u, z, cellsAround, cellW, p.voronoiCell, p.voronoiSeed)
      const half = p.voronoiGap / 2
      return edge >= half ? 0 : depth * 0.5 * (1 + Math.cos((Math.PI * edge) / half))
    }
    return 0
  }

  const verts = []
  const tris = []
  const addVertex = (x, y, z) => {
    verts.push(x, y, z)
    return verts.length / 3 - 1
  }

  // Aussenwand: Zeile i (Hoehe), Spalte j (Winkel). Low Poly: Punkte zufaellig
  // versetzt (Rand und Boden bleiben eben), die Facetten bleiben flach.
  // Bereiche der Wand, die ein eigener Baustein netzt (Durchbrueche): ihre Raender liegen genau auf
  // Zeilen, dazwischen gibt es keine Rasterzeilen.
  const zones = []
  const locked = []
  if (layout.cutoutZone) zones.push({ ...layout.cutoutZone, kind: 'cutout' })
  if (layout.notchZone) zones.push(layout.notchZone)
  const outerRadius = (theta, z) => {
    const base = R(z) * sectionAt(theta, z)
    return base - effectAt(theta, z, base)
  }
  const slitted = Boolean(layout.reinforce) && !lowpoly
  // Glatter runder Koerper (Muster kommen aus den Ebenen des Oberflaechen-Werkzeugs): Zeilen nach der
  // Kruemmung der Koerperform statt alle mm - eine bauchige Vase braucht so 30 statt 170 Zeilen, und
  // das Muster darauf ein Viertel der Dreiecke. Querschnitte mit Ecken, Verdrehung oder Hoehenbereich
  // und die eigenen Effekte der Vase brauchen die festen Zeilen weiter.
  const adaptive = !lowpoly && !slitted && p.effect === 'keine' && p.section === 'kreis' && p.section2 === 'keiner' && !shape.lid
  // Mit Schlitzen baut vase-slits.mjs den ganzen vollen Koerper; hier nur den untersten Ring fuer den Boden.
  const zsOuter = slitted ? [] : adaptive ? adaptiveRows((z) => R(z), 0, H, q.tol, q.maxStep, zones) : rowHeights(0, H, H / rows, zones)
  if (adaptive) rows = zsOuter.length - 1
  const outer = []
  const outerAtZ = new Map()
  for (let i = 0; i < zsOuter.length; i++) {
    const row = new Array(segments)
    for (let j = 0; j < segments; j++) {
      let theta = (2 * Math.PI * j) / segments
      let z = zsOuter[i]
      let r
      if (lowpoly) ({ theta, z, r } = shape.lowpolyVertex(i, j))
      else r = outerRadius(theta, z)
      row[j] = addVertex(r * Math.cos(theta), r * Math.sin(theta), z)
    }
    outer.push(row)
    outerAtZ.set(zsOuter[i], row)
  }
  // Voronoi: die Aussenwand wird entlang der Hoehenlinien ihrer Fugen geschnitten (sliceVoronoiJoints).
  // Kanten auf Zeilen, an die andere Teile stossen (Rand oben, Boden, Bereiche), bleiben ganz.
  const voronoiCut = p.effect === 'voronoi' && !lowpoly && !slitted && p.voronoiDepth > 0
  const fixedRow = new Set(voronoiCut ? [0, zsOuter.length - 1, ...zsOuter.flatMap((z, i) => (zones.some((zn) => zn.z0 === z || zn.z1 === z) ? [i] : []))] : [])
  // Die Dreiecke der Wand mit ihren Kanten im Raster: waagrecht H(i, j) zwischen (i, j) und (i, j+1), senkrecht
  // V(i, j) zwischen (i, j) und (i+1, j), schraeg D(i, j) zwischen (i, j) und (i+1, j+1).
  const quads = zsOuter.length - 1
  const edgeH = (i, j) => i * segments + j
  const edgeV = (i, j) => (quads + 1) * segments + i * segments + j
  const edgeD = (i, j) => (2 * quads + 1) * segments + i * segments + j
  const wall = voronoiCut ? { count: 0, v: new Uint32Array(6 * quads * segments), e: new Uint32Array(6 * quads * segments), p: new Float64Array(12 * quads * segments), fixed: new Uint8Array(2 * quads * segments) } : null
  const addWall = (v, e, p, fixed) => {
    const t = wall.count++
    wall.v.set(v, t * 3)
    wall.e.set(e, t * 3)
    wall.p.set(p, t * 6)
    wall.fixed[t] = fixed ? 1 : 0
  }
  for (let i = 0; i < zsOuter.length - 1; i++) {
    if (zones.some((zn) => zn.z0 === zsOuter[i] && zn.z1 === zsOuter[i + 1])) continue
    for (let j = 0; j < segments; j++) {
      const k = (j + 1) % segments
      if (wall) {
        const t0 = (2 * Math.PI * j) / segments, t1 = (2 * Math.PI * (j + 1)) / segments
        const z0 = zsOuter[i], z1 = zsOuter[i + 1]
        const flat = zone(z0) === 0 && zone(z1) === 0
        addWall([outer[i][j], outer[i][k], outer[i + 1][k]], [edgeH(i, j), edgeV(i, k), edgeD(i, j)], [t0, z0, t1, z0, t1, z1], flat || fixedRow.has(i))
        addWall([outer[i][j], outer[i + 1][k], outer[i + 1][j]], [edgeD(i, j), edgeH(i + 1, j), edgeV(i, j)], [t0, z0, t1, z1, t0, z1], flat || fixedRow.has(i + 1))
        continue
      }
      tris.push(outer[i][j], outer[i][k], outer[i + 1][k])
      tris.push(outer[i][j], outer[i + 1][k], outer[i + 1][j])
    }
  }
  if (wall) {
    const around = 2 * Math.PI * maxR
    const size = verts.length / 3
    const site = { key: new Float64Array(size), edge: new Float64Array(size), u: new Float64Array(size), z: new Float64Array(size) }
    for (let i = 0; i < zsOuter.length; i++) {
      for (let j = 0; j < segments; j++) {
        const z = zsOuter[i]
        const turn = (2 * Math.PI * j) / segments - rotation(twistT(z))
        const u = ((((turn / (2 * Math.PI)) % 1) + 1) % 1) * around
        const id = outer[i][j]
        site.edge[id] = voronoiCell(u, z, cellsAround, cellW, p.voronoiCell, p.voronoiSeed)
        site.key[id] = voronoiCellKey
        site.u[id] = u
        site.z[id] = z
      }
    }
    const seedAt = (key, uRef) => voronoiSeed(key, uRef, cellsAround, cellW, p.voronoiCell, p.voronoiSeed)
    const half = p.voronoiGap / 2
    // Rand, Flanke (zweimal) und Grund, auf beiden Seiten der Grenze.
    const levels = [-1, -0.6, -0.25, 0, 0.25, 0.6, 1].map((share) => share * half)
    const point = (theta, z) => {
      const r = outerRadius(theta, z)
      return addVertex(r * Math.cos(theta), r * Math.sin(theta), z)
    }
    sliceVoronoiJoints(wall, site, seedAt, around, (3 * quads + 1) * segments, levels, 0.02, point, tris)
  }

  const { foot, floor, slope, drains, blind } = layout
  const top = outer[outer.length - 1]
  const bottomRing = outer[0]
  const xyOf = (i) => [verts[i * 3], verts[i * 3 + 1]]
  /** Blinde Loecher (Buchsen, Mulden): Wand nach oben bis zur Tiefe und Decke. */
  const blindHoles = (loops) => blind.forEach((h, k) => {
    const ceil = loops[k].map((i) => addVertex(verts[i * 3], verts[i * 3 + 1], h.depth))
    holeWall(loops[k], ceil, tris)
    holeCeiling(ceil, h, h.depth, tris, addVertex)
  })

  if (slitted) {
    // Voller Koerper mit Schlitzen (vase-slits.mjs), darunter der Boden mit Mulden wie sonst.
    const zS = Math.min(layout.reinforce.floor, H / 3)
    const innerWall = p.reinforce === 'doppelwand' ? vaseShape({ ...p, body: 'hohl', wall: p.reinforceDepth, innerShape: 'folgt' }).innerAt : null
    const ring0 = slitBody({
      p, segments, rows: rowHeights(zS, H, H / rows, []), bottom: [0],
      outer: outerRadius, inner: innerWall, tris, addVertex, coords: (v) => verts.slice(v * 3, v * 3 + 3), locked,
    })
    blindHoles(capWithHoles(ring0, 0, blind, true, verts, tris, addVertex))
  } else if (p.body === 'voll') {
    // Boden aussen (Normale nach unten), mit Mulden fuer Gummifuesse.
    blindHoles(capWithHoles(bottomRing, 0, blind, true, verts, tris, addVertex))
    const topCenter = addVertex(0, 0, H)
    for (let j = 0; j < segments; j++) tris.push(topCenter, top[j], top[(j + 1) % segments])
  } else {
    // Innenwand: glatt, folgt Querschnitt und Koerperform (shape.innerAt).
    const innerRow = (z) => {
      const row = new Array(segments)
      for (let j = 0; j < segments; j++) {
        const theta = (2 * Math.PI * j) / segments
        const r = shape.innerAt(theta, z)
        row[j] = addVertex(r * Math.cos(theta), r * Math.sin(theta), z)
      }
      return row
    }
    const wallBetween = (rowsList) => {
      for (let i = 0; i < rowsList.length - 1; i++) {
        for (let j = 0; j < segments; j++) {
          const k = (j + 1) % segments
          tris.push(rowsList[i][j], rowsList[i + 1][k], rowsList[i][k])
          tris.push(rowsList[i][j], rowsList[i + 1][j], rowsList[i + 1][k])
        }
      }
    }
    const inZone = (a, b) => zones.some((zn) => zn.z0 === a && zn.z1 === b)
    /** Innenwand von a bis b: Rasterzeilen, Bereiche (Durchbruch, Kabelschlitz) nur mit ihren Raendern. */
    const innerAtZ = new Map()
    const innerWall = (a, b, step) => {
      let zs = adaptive ? adaptiveRows((z) => shape.innerAt(0, z), a, b, q.tol, q.maxStep, zones) : rowHeights(a, b, step, zones)
      // Deckel: Nut bzw. Gewinde (samt Uebergang darunter) mit feinen Zeilen - 16 je Steigung bzw. 0,2 mm.
      if (shape.lid) {
        const fine = shape.lid.kind === 'schraube' ? shape.lid.pitch / 16 : 0.2
        const z0 = Math.max(a, shape.lid.z0 - (shape.lid.kind === 'schraube' ? 12 : 0)), z1 = Math.min(b, shape.lid.z1)
        if (z1 > z0) {
          const keep = zs.filter((z) => z < z0 - 1e-6 || z > z1 + 1e-6)
          const n = Math.ceil((z1 - z0) / fine)
          zs = [...keep, ...Array.from({ length: n + 1 }, (_, i) => z0 + ((z1 - z0) * i) / n)].sort((x, y) => x - y)
        }
      }
      const list = zs.map((z) => innerRow(z))
      zs.forEach((z, i) => innerAtZ.set(z, list[i]))
      for (let i = 0; i < list.length - 1; i++) if (!inZone(zs[i], zs[i + 1])) wallBetween([list[i], list[i + 1]])
      return list
    }
    // Innenboden auf Fuss + Bodenstaerke; darunter bei hohlem Fuss ein Hohlraum fuer die Auffangschale.
    // Ohne Boden (Lampe ueber einem LED-Puck): Innenwand bis ganz unten.
    const floorTop = foot + floor
    const innerRows = lowpoly ? rows : Math.max(8, Math.ceil(rows / 4))
    const inner = innerWall(floorTop, H, (H - floorTop) / innerRows)
    const skirt = foot > 0 ? innerWall(0, foot, 4) : null
    // Bereiche: Aussen- und Innenwand mit Loechern dazwischen; unten offen beim Kabelschlitz.
    for (const zn of zones) {
      const thetas = Array.from({ length: segments }, (_, j) => (2 * Math.PI * j) / segments)
      const step = zn.kind === 'cutout' ? cutoutStep(p) : 0.5
      const n = Math.max(2, Math.ceil((zn.z1 - zn.z0) / step))
      const zs = Array.from({ length: n + 1 }, (_, i) => (i === n ? zn.z1 : zn.z0 + ((zn.z1 - zn.z0) * i) / n))
      const field = zn.kind === 'cutout' ? cutoutFieldFor(p, shape, zn) : notchFieldFor(p, shape, zn)
      const F = zs.map((z) => thetas.map((th) => field(th, z)))
      const at = (rad) => (th, z) => { const r = rad(th, z); return [r * Math.cos(th), r * Math.sin(th), z] }
      wallZone({
        thetas, zs, F, outer: at(outerRadius), inner: at(shape.innerAt),
        bottom: { outer: outerAtZ.get(zn.z0), inner: innerAtZ.get(zn.z0), open: Boolean(zn.open) },
        top: { outer: outerAtZ.get(zn.z1), inner: innerAtZ.get(zn.z1) },
        tris, addVertex, locked,
      })
    }
    const innerTop = inner[inner.length - 1]
    for (let j = 0; j < segments; j++) {
      const k = (j + 1) % segments
      tris.push(top[j], top[k], innerTop[k])
      tris.push(top[j], innerTop[k], innerTop[j])
    }
    const openBottom = zones.some((zn) => zn.open && zn.z0 === 0)
    if (floorTop === 0) {
      // Kein Boden: unten nur der Rand zwischen Aussen- und Innenwand (beim Kabelschlitz macht ihn der Bereich).
      if (!openBottom) {
        for (let j = 0; j < segments; j++) {
          const k = (j + 1) % segments
          tris.push(bottomRing[j], inner[0][k], bottomRing[k])
          tris.push(bottomRing[j], inner[0][j], inner[0][k])
        }
      }
    } else {
      let under
      if (foot > 0) {
        // Fuss: Wand innen von 0 bis `foot`, unten ein Ring zwischen Aussenwand und Fusswand.
        if (!openBottom) {
          const coords = []
          for (const i of [...skirt[0], ...bottomRing]) coords[i] = xyOf(i)
          for (const [a, b, c] of zipRings(skirt[0], bottomRing, coords)) tris.push(a, c, b)
        }
        under = capWithHoles(skirt[skirt.length - 1], foot, drains, true, verts, tris, addVertex)
      } else {
        // Boden aussen: Ablaufloecher durch, Buchsen und Mulden blind von unten.
        const loops = capWithHoles(bottomRing, 0, [...drains, ...blind], true, verts, tris, addVertex)
        under = loops.slice(0, drains.length)
        blindHoles(loops.slice(drains.length))
      }
      // Innenboden oben; die Ablaufloecher liegen um das Gefaelle tiefer, das Wasser laeuft hin.
      const upper = capWithHoles(inner[0], floorTop, drains.map((h) => ({ ...h, z: floorTop - slope })), false, verts, tris, addVertex)
      drains.forEach((_, k) => holeWall(under[k], upper[k], tris))
    }
  }

  const positions = new Float32Array(tris.length * 3)
  for (let t = 0; t < tris.length; t++) {
    const v = tris[t] * 3
    positions[t * 3] = verts[v]
    positions[t * 3 + 1] = verts[v + 1]
    positions[t * 3 + 2] = verts[v + 2]
  }
  return {
    params: p,
    positions,
    triangleCount: tris.length / 3,
    indices: Uint32Array.from(tris),
    vertices: Float64Array.from(verts),
    size: { width: p.diameter, depth: p.diameter, height: H },
    flat: lowpoly,
    section: { starShaped: section.starShaped, valid: section.valid },
    grid: { segments, rows },
    // Boden: wo Loecher, Buchsen, Mulden sitzen und was angepasst wurde (Hinweise fuer die Seite).
    floor: { foot: layout.foot, thickness: layout.floor, slope: layout.slope, drains: layout.drains, blind: layout.blind, legs: layout.legs },
    notes: layout.notes,
    // Dreiecke, die Form sind und kein Oberflaechen-Muster bekommen sollen (Lochwaende), je 1.
    locked: lockedMask(tris.length / 3, locked),
  }
}

function lockedMask(count, list) {
  const out = new Uint8Array(count)
  for (const t of list) out[t] = 1
  return out
}

/**
 * Zeilenhoehen von a bis b, hoechstens `step` auseinander; Bereiche in `zones` ({ z0, z1 }) bekommen
 * nur ihre Raender (dazwischen netzt der Baustein). Ohne Bereiche genau gleichmaessig.
 */
function rowHeights(a, b, step, zones) {
  const cuts = [a, b]
  for (const zn of zones) for (const z of [zn.z0, zn.z1]) if (z > a + 1e-9 && z < b - 1e-9) cuts.push(z)
  const sorted = [...new Set(cuts)].sort((x, y) => x - y)
  const out = []
  for (let k = 0; k < sorted.length - 1; k++) {
    const p = sorted[k], q = sorted[k + 1]
    if (zones.some((zn) => zn.z0 === p && zn.z1 === q)) { out.push(p); continue }
    // Ohne Bereiche genau die bisherige Teilung; mit Bereichen hoechstens `step` je Zeile.
    const count = Math.max(1, zones.length ? Math.ceil((q - p) / step - 1e-9) : Math.round((q - p) / step))
    for (let i = 0; i < count; i++) out.push(p + ((q - p) * i) / count)
  }
  out.push(b)
  return out
}

/**
 * Zeilenhoehen nach Kruemmung (Douglas-Peucker in der r-z-Ebene): von a bis b so wenige Zeilen wie
 * moeglich, dabei weicht die Sehne zwischen zwei Zeilen hoechstens `tol` mm vom Profil `radiusAt(z)`
 * ab und keine Zeile ist hoeher als `maxStep`. Bereiche (Durchbruch, Kabelschlitz) nur mit ihren
 * Raendern, wie bei rowHeights.
 */
export function adaptiveRows(radiusAt, a, b, tol, maxStep, zones = []) {
  const cuts = [a, b]
  for (const zn of zones) for (const z of [zn.z0, zn.z1]) if (z > a + 1e-9 && z < b - 1e-9) cuts.push(z)
  const sorted = [...new Set(cuts)].sort((x, y) => x - y)
  const out = []
  for (let k = 0; k < sorted.length - 1; k++) {
    const p0 = sorted[k], p1 = sorted[k + 1]
    out.push(p0)
    if (zones.some((zn) => zn.z0 === p0 && zn.z1 === p1)) continue
    // Fein abtasten (alle 0,25 mm), dann Zeilen dort einfuegen, wo die Sehne am weitesten abweicht.
    const n = Math.max(2, Math.ceil((p1 - p0) / 0.25))
    const zs = Array.from({ length: n + 1 }, (_, i) => (i === n ? p1 : p0 + ((p1 - p0) * i) / n))
    const rs = zs.map((z) => radiusAt(z))
    const picked = new Set([0, n])
    const stack = [[0, n]]
    while (stack.length) {
      const [i0, i1] = stack.pop()
      if (i1 - i0 < 2) continue
      const dz = zs[i1] - zs[i0], dr = rs[i1] - rs[i0]
      const len = Math.hypot(dz, dr) || 1
      let worst = 0, at = (i0 + i1) >> 1
      for (let i = i0 + 1; i < i1; i++) {
        // Abstand des Profilpunkts von der Sehne in der r-z-Ebene.
        const d = Math.abs(dr * (zs[i0] - zs[i]) - (rs[i0] - rs[i]) * dz) / len
        if (d > worst) { worst = d; at = i }
      }
      if (worst > tol || dz > maxStep) {
        picked.add(at)
        stack.push([i0, at], [at, i1])
      }
    }
    for (const i of [...picked].sort((x, y) => x - y).slice(1, -1)) out.push(zs[i])
  }
  out.push(b)
  return out
}

/** Rasterabstand im Durchbruch (mm): fein genug fuer Stege von `cutoutWeb`. */
function cutoutStep(p) {
  const base = { entwurf: 1.2, standard: 0.7, fein: 0.45 }[p.quality]
  return Math.max(0.3, Math.min(base, p.cutoutWeb / 2.5))
}

/** Kabelschlitz: Rechteck von unten (Breite als Bogen aussen gemessen), bei 0 Grad; darueber voll. */
function notchFieldFor(p, shape, zn) {
  return (theta, z) => {
    let a = theta % (2 * Math.PI)
    if (a > Math.PI) a -= 2 * Math.PI
    const s = Math.abs(a) * shape.R(z) * shape.section.mean
    return Math.max(s - p.lampNotch / 2, z - p.lampNotchHeight)
  }
}

/**
 * Lochfeld fuer einen Bereich: Zellen nach dem groessten Umfang darin, Stege an jeder Hoehe gleich breit,
 * Raender voll; bei „Nur ganze Loecher“ bleiben angeschnittene Zellen zu. `rows` am Feld: ganze Lochreihen.
 */
function cutoutFieldFor(p, shape, zn) {
  const mean = shape.section.mean
  let Rref = 0
  for (let k = 0; k <= 64; k++) Rref = Math.max(Rref, shape.R(zn.z0 + ((zn.z1 - zn.z0) * k) / 64) * mean)
  const band = 0.75 * p.cutoutWeb
  const whole = p.cutoutEdge === 'ganz' ? { z0: zn.z0 + band, z1: zn.z1 - band } : null
  const { field, rows } = cutoutPattern(p, { Rref, scale: (z) => Math.max(0.05, (shape.R(z) * mean) / Rref), whole })
  return Object.assign((theta, z) => Math.max(field(theta, z), band - (z - zn.z0), band - (zn.z1 - z)), { rows })
}

/**
 * Nur der Koerper, ohne Oberflaechen-Effekt (Facetten bleiben, sie sind Form) - fuer den
 * Vasenmodus des Oberflaechen-Werkzeugs, das die Muster selbst aufbringt. Liefert die
 * Dreiecke (je 9 Zahlen), die verwendeten Einstellungen und je Dreieck, ob es gesperrt ist
 * (Lochwaende: dort kein Muster).
 */
export function vaseBody(input) {
  const p = normalizeParams({ ...input, effect: input?.effect === 'lowpoly' ? 'lowpoly' : 'keine', quality: 'standard' })
  const mesh = buildVase(p)
  return { soup: mesh.positions, params: mesh.params, section: mesh.section, locked: mesh.locked }
}

/** Kurzer Name (fuer Layerling) und Dateiname, z. B. "Vase Sechseck, 48 Rillen" / "vase-6eck-48-rillen". */
export function describeVase(input) {
  const p = normalizeParams(input)
  const sec = {
    kreis: ['', ''],
    vieleck: [`${p.polySides}-Eck`, `${p.polySides}eck`],
    welle: [`${p.sectionWaves} ${{ lamellen: 'Lamellen', bogen: 'Bögen' }[p.sectionWaveStyle] ?? 'Wellen'}`, `${{ lamellen: 'lamellen', bogen: 'boegen' }[p.sectionWaveStyle] ?? 'welle'}${p.sectionWaves}`],
    gezeichnet: [`gezeichnet (${SYMMETRIES[p.drawSymmetry]})`, 'gezeichnet'],
  }[p.section]
  // Uebergang: "Kreis zu 5-Eck" / "kreis-zu-5eck".
  if (p.section2 !== 'keiner') {
    const q = secondSectionParams(p)
    const to = { kreis: ['Kreis', 'kreis'], vieleck: [`${q.polySides}-Eck`, `${q.polySides}eck`], welle: [`${q.sectionWaves} ${{ lamellen: 'Lamellen', bogen: 'Bögen' }[q.sectionWaveStyle] ?? 'Wellen'}`, `welle${q.sectionWaves}`], gezeichnet: ['gezeichnet', 'gezeichnet'] }[q.section]
    sec[0] = `${sec[0] || 'Kreis'} zu ${to[0]}`
    sec[1] = `${sec[1] || 'kreis'}-zu-${to[1]}`
  }
  const eff = {
    keine: ['glatt', 'glatt'],
    rillen: p.ribCount > 0 && p.ribDepth > 0 ? [`${p.ribCount} Rillen`, `${p.ribCount}-rillen`] : ['glatt', 'glatt'],
    streifen: [`${p.stripeCount} Streifen`, `${p.stripeCount}-streifen`],
    voronoi: ['Voronoi', 'voronoi'],
    lowpoly: ['Facetten', 'facetten'],
  }[p.effect]
  const curve = p.twistMode === 'kurve'
  const twist = curve ? ['mit Drehkurve', 'drehkurve'] : p.twist ? [`${p.twist}° verdreht`, `${p.twist < 0 ? 'links' : ''}${Math.abs(p.twist)}grad`] : ['', '']
  const sway = !curve && p.swayAngle > 0 && p.swayCount > 0 ? ['pendelnd', 'pendel'] : ['', '']
  const name = ['Vase', [sec[0], eff[0], twist[0], sway[0]].filter(Boolean).join(', ')].join(' ')
  const slug = ['vase', p.profile, sec[1], eff[1], twist[1], sway[1]].filter(Boolean).join('-').replace(/[^a-z0-9-]/g, '')
  return { name, slug }
}

/**
 * Gedrucktes Volumen fuer Gewicht und Filament (ohne Fuellung gerechnet, Waende voll).
 * Hohl: das Volumen des Netzes. Voll: Der Slicer druckt im Vasenmodus eine Linie (`lineWidth`) entlang
 * der Mantelflaeche und einen Boden von VASE_MODE_BOTTOM mm - also Mantel x Linienbreite + Bodenflaeche x
 * Bodenstaerke (Schlitze fuer Rippen zaehlen mit ihren beiden Seiten: Dort laeuft die Linie hinein und zurueck).
 * Liefert { mm3, mode } - Gramm und Meter rechnet printWeight je Material.
 */
export function printVolume(input, positions) {
  const p = normalizeParams(input)
  if (p.body === 'hohl') return { mm3: Math.abs(meshVolume(positions)), mode: 'hohl' }
  let zMin = Infinity, zMax = -Infinity
  for (let i = 2; i < positions.length; i += 3) {
    zMin = Math.min(zMin, positions[i])
    zMax = Math.max(zMax, positions[i])
  }
  const eps = 1e-4 * (zMax - zMin || 1)
  let side = 0, bottom = 0
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2]
    const ux = positions[i + 3] - ax, uy = positions[i + 4] - ay, uz = positions[i + 5] - az
    const wx = positions[i + 6] - ax, wy = positions[i + 7] - ay, wz = positions[i + 8] - az
    const nz = ux * wy - uy * wx
    const area = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, nz) / 2
    const lowest = Math.max(az, positions[i + 5], positions[i + 8]) <= zMin + eps
    const highest = Math.min(az, positions[i + 5], positions[i + 8]) >= zMax - eps
    if (lowest && nz < 0) bottom += area
    else if (!(highest && nz > 0)) side += area
  }
  return { mm3: side * p.lineWidth + bottom * VASE_MODE_BOTTOM, mode: 'vasenmodus' }
}

/** Gramm und Meter Filament (1,75 mm) fuer ein gedrucktes Volumen in mm^3. */
export function printWeight(mm3, material = 'pla') {
  const m = MATERIALS[material] ?? MATERIALS.pla
  return { grams: (mm3 / 1000) * m.density, meters: mm3 / (Math.PI * (FILAMENT_DIAMETER / 2) ** 2) / 1000, material: m.label }
}

/** Volumen in mm^3 (Divergenzsatz) - fuer Gewicht und Filament. */
export function meshVolume(positions) {
  let v = 0
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.subarray(i, i + 9)
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return v / 6
}

/** Binaeres STL (Z oben), wie es jeder Slicer und Layerling einlesen. */
export function toBinaryStl(positions, name = 'Vase') {
  const count = positions.length / 9
  const buffer = new ArrayBuffer(84 + count * 50)
  const view = new DataView(buffer)
  const header = `Vasen-Generator: ${name}`.slice(0, 80)
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f)
  view.setUint32(80, count, true)
  let o = 84
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2]
    const ux = positions[i + 3] - ax, uy = positions[i + 4] - ay, uz = positions[i + 5] - az
    const vx = positions[i + 6] - ax, vy = positions[i + 7] - ay, vz = positions[i + 8] - az
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true)
    o += 12
    for (let k = 0; k < 9; k++) {
      view.setFloat32(o, positions[i + k], true)
      o += 4
    }
    view.setUint16(o, 0, true)
    o += 2
  }
  return new Uint8Array(buffer)
}

/**
 * Fuer Layerlings `import_mesh`: dort zeigt Y nach oben. Drehung um X um
 * -90 Grad: (x, y, z) -> (x, z, -y). Eine echte Drehung, also bleibt der
 * Umlaufsinn der Dreiecke - und damit aussen/innen - erhalten.
 */
export function toLayerlingPositions(positions) {
  const out = new Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = Math.round(positions[i] * 1000) / 1000
    out[i + 1] = Math.round(positions[i + 2] * 1000) / 1000
    out[i + 2] = Math.round(-positions[i + 1] * 1000) / 1000
  }
  return out
}

/** Ein ZIP ohne Kompression (Methode 0) - genug, um eine STL-Datei zu verpacken. */
export function storedZip(files) {
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc32 = (data) => {
    let c = 0xffffffff
    for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const encoder = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(8, 0, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, file.data.length, true)
    local.setUint32(22, file.data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, file.data)
    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, file.data.length, true)
    entry.setUint32(24, file.data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + file.data.length
  }
  const centralSize = central.reduce((s, a) => s + a.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0))
  let pos = 0
  for (const a of all) {
    out.set(a, pos)
    pos += a.length
  }
  return out
}
