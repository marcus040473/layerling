"use client";

import { useSyncExternalStore } from "react";
import { getSimpleMode, subscribeToSimpleMode } from "@/lib/simpleMode";

export function useSimpleMode(): boolean {
  return useSyncExternalStore(subscribeToSimpleMode, getSimpleMode, () => false);
}
