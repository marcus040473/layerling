import { t } from "@/lib/i18n";
import { groupedShape } from "@/lib/editorBooleans";
import { buildGroupedShapeOffThread } from "@/lib/geometryWorker";
import { cadShapeFromSketchProfile } from "@/lib/editorSketchCad";
import { createLocalId } from "@/lib/localIds";
import {
  DEFAULT_QR_WIDTH,
  MAX_QR_WIDTH,
  MIN_QR_WIDTH,
  QR_BYTE_CAPACITY,
  QR_QUIET_MODULES,
  normalizeQrSettings,
  qrByteLength,
  qrMatrix,
  qrModuleSize,
  qrOutlines,
  qrPlateProfile,
  qrSketchProfile,
  type QrCodeSettings,
} from "@/lib/qrCode";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

/** The code's colour, and the plate's: dark on light, as a scanner wants it. */
export const QR_CODE_COLOR = "#1f1f1f";
export const QR_PLATE_COLOR = "#ffffff";
/** How far an engraving reaches above the plate, so the cut leaves no skin on top. */
const ENGRAVE_OVERSHOOT = 0.2;

/** The shape a QR code is: one carrying the settings, the body itself or its plate group or bundle. */
export function qrCodeOf(shape: WorkplaneShape | null | undefined): QrCodeSettings | null {
  return shape?.qrCode ? normalizeQrSettings(shape.qrCode) : null;
}

/**
 * A QR code as a new shape, `width` mm wide, standing on the plate's middle: the code alone as one
 * sketch body; on a plate raised, as a bundle of a white plate and the dark code on it (each its
 * own colour, so a multicolour print takes them as two layers); or engraved, as the plate with
 * the code cut in as a hole. Throws with a sentence for a text that does not fit.
 */
export async function qrCodeShape(settings: QrCodeSettings, width: number, triangleLimit: number): Promise<WorkplaneShape> {
  let matrix: boolean[][];
  try {
    matrix = qrMatrix(settings.text, settings.errorCorrection);
  } catch {
    throw new Error(settings.text ? t("qrCode.tooLong", { used: qrByteLength(settings.text), max: QR_BYTE_CAPACITY[settings.errorCorrection] }) : t("qrCode.noText"));
  }
  const safeWidth = Math.min(MAX_QR_WIDTH, Math.max(MIN_QR_WIDTH, Number.isFinite(width) ? width : DEFAULT_QR_WIDTH));
  const count = matrix.length;
  const onPlate = settings.style !== "code";
  const margin = onPlate && settings.quietZone ? QR_QUIET_MODULES : 0;
  const across = count + 2 * margin;
  const moduleSize = qrModuleSize(count, safeWidth, settings.style, settings.quietZone);
  const loops = qrOutlines(matrix);
  // Named in English as the editor names what it makes; the object list shows it translated.
  const name = "QR code";

  const codeHeight = settings.style === "engraved" ? settings.codeHeight + ENGRAVE_OVERSHOOT : settings.codeHeight;
  const code = await cadShapeFromSketchProfile(qrSketchProfile(loops, moduleSize, across, margin), codeHeight);
  if (!onPlate) {
    return canonicalizeShape({ ...code, id: createLocalId("qr-code"), name, color: QR_CODE_COLOR, x: 0, z: 0, elevation: 0, qrCode: settings });
  }

  const plateSize = across * moduleSize;
  const plateBody = await cadShapeFromSketchProfile(qrPlateProfile(plateSize), settings.plateThickness);
  const plate = canonicalizeShape({ ...plateBody, id: createLocalId("qr-plate"), name: "QR plate", color: QR_PLATE_COLOR, x: 0, z: 0, elevation: 0 });
  // The code's sketch is centred on the plate's square, so both stand on the same middle.
  if (settings.style === "raised") {
    const raised = canonicalizeShape({ ...code, id: createLocalId("qr-code"), name, color: QR_CODE_COLOR, x: 0, z: 0, elevation: settings.plateThickness });
    const bundle = groupedShape([plate, raised]);
    if (!bundle) throw new Error(t("qrCode.failed"));
    return canonicalizeShape({ ...bundle, id: createLocalId("qr-code"), name, groupOperation: "bundle", qrCode: settings });
  }
  const depth = Math.min(settings.codeHeight, settings.plateThickness - 0.2);
  const cut = canonicalizeShape({
    ...code,
    id: createLocalId("qr-code"),
    name,
    color: QR_CODE_COLOR,
    hole: true,
    x: 0,
    z: 0,
    elevation: settings.plateThickness - depth,
  });
  const result = await buildGroupedShapeOffThread([plate, cut], triangleLimit);
  if (!result.group) throw new Error(t("qrCode.failed"));
  return canonicalizeShape({ ...result.group, id: createLocalId("qr-code"), name, color: QR_PLATE_COLOR, groupOperation: "group", qrCode: settings });
}

/**
 * A QR shape made again with new settings, where the old one stood: same id, place, turn and
 * name, and as wide as it is now - a code scaled bigger stays big. A code alone keeps its height
 * too, so a code made taller in the properties stays tall.
 */
export async function regeneratedQrCodeShape(old: WorkplaneShape, settings: QrCodeSettings, triangleLimit: number): Promise<WorkplaneShape> {
  const keepHeight = settings.style === "code" && old.qrCode?.style === "code" && !old.groupedShapes?.length;
  const next = keepHeight ? { ...settings, codeHeight: old.height } : settings;
  const built = await qrCodeShape(next, old.width, triangleLimit);
  return canonicalizeShape({
    ...built,
    id: old.id,
    name: old.name,
    x: old.x,
    z: old.z,
    elevation: old.elevation ?? 0,
    rotation: old.rotation,
    rotationX: old.rotationX,
    rotationZ: old.rotationZ,
    hole: old.hole,
    locked: old.locked,
    hidden: old.hidden,
    // A code alone keeps the colour it was given; a plate is white with a dark code.
    color: settings.style === "code" && old.qrCode?.style === "code" ? old.color : built.color,
  });
}
