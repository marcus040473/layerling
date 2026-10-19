"use client";

import { useMemo } from "react";
import { numberLocale, t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { vaseNote } from "@/lib/vaseNotes";
import { vasePrintReport } from "@/lib/vaseShape";
import type { WorkplaneShape } from "@/types/layerling";

/** What printing the vase takes - weight and filament - and the core's notes on printing it, in the current language. */
export function VasePrintReport({ shape }: { shape: WorkplaneShape }) {
  const language = useLanguage();
  const report = useMemo(() => vasePrintReport({ width: shape.width ?? shape.size, depth: shape.depth ?? shape.size, height: shape.height, vase: shape.vase }), [shape.width, shape.depth, shape.size, shape.height, shape.vase]);
  const number = (value: number, digits: number) => value.toLocaleString(numberLocale(language), { maximumFractionDigits: digits });
  return (
    <div className="vase-print-report">
      <p className="vase-print-weight">{t("vase.printWeight", { grams: number(report.grams, 0), material: report.material, meters: number(report.meters, 1) })}</p>
      <p className="cylinder-wrap-hint">{report.vaseMode ? t("vase.printVaseMode", { line: number(report.line, 2), bottom: number(report.bottom, 1) }) : t("vase.printHollow")}</p>
      {report.notes.length ? (
        <ul className="vase-print-notes">
          {report.notes.map((note) => (
            <li key={note}>{vaseNote(note)}</li>
          ))}
        </ul>
      ) : (
        <p className="cylinder-wrap-hint">{t("vase.printFine")}</p>
      )}
    </div>
  );
}
