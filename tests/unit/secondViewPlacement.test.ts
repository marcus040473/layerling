import { describe, expect, it } from "vitest";
import {
  placementOf,
  readSecondViewPlacement,
  SECOND_VIEW_PLACEMENT_KEY,
  secondViewSupported,
  secondViewWindowFeatures,
  writeSecondViewPlacement,
} from "@/lib/secondViewPlacement";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

describe("the second view's window placement", () => {
  it("opens at the default size where the browser puts it, the first time", () => {
    expect(readSecondViewPlacement(memoryStorage())).toBeNull();
    expect(secondViewWindowFeatures(null)).toBe("popup,width=960,height=720");
  });

  it("opens where it was left, at the size it had", () => {
    const storage = memoryStorage();
    writeSecondViewPlacement(storage, placementOf({ screenX: 1930, screenY: 40, innerWidth: 1200, innerHeight: 800 }));
    const placement = readSecondViewPlacement(storage);
    expect(placement).toEqual({ left: 1930, top: 40, width: 1200, height: 800 });
    expect(secondViewWindowFeatures(placement)).toBe("popup,left=1930,top=40,width=1200,height=800");
  });

  it("keeps no size too small to use, and ignores a broken entry", () => {
    const storage = memoryStorage();
    writeSecondViewPlacement(storage, { left: 0, top: 0, width: 0, height: 0 });
    expect(storage.items.has(SECOND_VIEW_PLACEMENT_KEY)).toBe(false);
    storage.setItem(SECOND_VIEW_PLACEMENT_KEY, "{not json");
    expect(readSecondViewPlacement(storage)).toBeNull();
    storage.setItem(SECOND_VIEW_PLACEMENT_KEY, JSON.stringify({ left: 0, top: 0, width: "wide", height: 600 }));
    expect(readSecondViewPlacement(storage)).toBeNull();
  });

  it("does not fail without storage", () => {
    expect(readSecondViewPlacement(null)).toBeNull();
    expect(() => writeSecondViewPlacement(null, { left: 0, top: 0, width: 800, height: 600 })).not.toThrow();
  });
});

describe("where the second view is offered", () => {
  const UA = {
    windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
    chromeOs: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    iPhone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    iPadMobileSite: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  };
  const desktop = { coarsePointer: false, maxTouchPoints: 0 };

  it("is offered with a mouse or a trackpad, a touch screen laptop and a Chromebook included", () => {
    expect(secondViewSupported({ ...desktop, platform: "Win32", userAgent: UA.windowsChrome, mobile: false })).toBe(true);
    expect(secondViewSupported({ ...desktop, platform: "Win32", userAgent: UA.windowsChrome, maxTouchPoints: 10, mobile: false })).toBe(true);
    expect(secondViewSupported({ ...desktop, platform: "MacIntel", userAgent: UA.macSafari })).toBe(true);
    expect(secondViewSupported({ ...desktop, platform: "Linux x86_64", userAgent: UA.linuxFirefox })).toBe(true);
    expect(secondViewSupported({ ...desktop, platform: "Linux x86_64", userAgent: UA.chromeOs, maxTouchPoints: 10, mobile: false })).toBe(true);
  });

  it("is not offered on a phone", () => {
    expect(secondViewSupported({ coarsePointer: true, platform: "Linux armv8l", maxTouchPoints: 5, userAgent: UA.androidPhone, mobile: true })).toBe(false);
    expect(secondViewSupported({ coarsePointer: true, platform: "iPhone", maxTouchPoints: 5, userAgent: UA.iPhone })).toBe(false);
  });

  it("is not offered on a tablet, not even with a mouse or a trackpad on it", () => {
    // Android tablet with a mouse: the pointer reports fine, the name still says Android.
    expect(secondViewSupported({ ...desktop, platform: "Linux aarch64", maxTouchPoints: 10, userAgent: UA.androidTablet, mobile: false })).toBe(false);
    // An iPad as it presents itself by default: a Mac with touch points.
    expect(secondViewSupported({ ...desktop, platform: "MacIntel", maxTouchPoints: 5, userAgent: UA.macSafari })).toBe(false);
    // An iPad asking for mobile sites, with a trackpad.
    expect(secondViewSupported({ ...desktop, platform: "iPad", maxTouchPoints: 5, userAgent: UA.iPadMobileSite })).toBe(false);
  });

  it("is not offered where the browser says it runs on a mobile device, whatever its name", () => {
    expect(secondViewSupported({ ...desktop, platform: "Linux x86_64", userAgent: UA.linuxFirefox, mobile: true })).toBe(false);
  });
});
