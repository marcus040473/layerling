import type { SketchTool } from "@/components/SketchWorkspace";

/**
 * What Esc does in the sketch, as in 3D: a drawing tool goes down first and Select takes its
 * place; only with Select in hand does the key clear the selection (#664).
 */
export function sketchEscapeAction(tool: SketchTool): "selectTool" | "clearSelection" {
  return tool === "select" ? "clearSelection" : "selectTool";
}
