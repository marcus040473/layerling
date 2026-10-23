"use client";

import { useSyncExternalStore } from "react";
import { getShapeColors, subscribeToShapeColors } from "@/lib/shapeColors";

export function useShapeColors(): boolean {
  return useSyncExternalStore(subscribeToShapeColors, getShapeColors, () => true);
}
