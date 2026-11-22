// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiLinkSettingsSection } from "@/components/workplane/AiLinkSettingsSection";
import { setLanguage } from "@/lib/i18n";
import { MCP_RELAY_CHANGED_EVENT, MCP_RELAY_STORAGE_KEY, setMcpRelayStatus } from "@/lib/mcpRelayLink";

/**
 * The page "AI connection" in the settings: the relay's address, the switch that stays off until there
 * is one, the address for the AI app, how the connection is, and a new address on request.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let changes = 0;
const countChange = () => {
  changes += 1;
};

beforeEach(async () => {
  await setLanguage("en", false);
  window.localStorage.clear();
  setMcpRelayStatus("off");
  changes = 0;
  window.addEventListener(MCP_RELAY_CHANGED_EVENT, countChange);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  window.removeEventListener(MCP_RELAY_CHANGED_EVENT, countChange);
});

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(AiLinkSettingsSection)));
  return container;
}

const stored = () => JSON.parse(window.localStorage.getItem(MCP_RELAY_STORAGE_KEY) ?? "null") as { enabled: boolean; url: string; code: string } | null;
const relayField = (panel: HTMLElement) => panel.querySelector<HTMLInputElement>('input[type="url"]')!;
const toggle = (panel: HTMLElement) => panel.querySelector<HTMLInputElement>('.workspace-toggle input[type="checkbox"]')!;
const status = (panel: HTMLElement) => panel.querySelector<HTMLElement>("[role=status]")!;
const addressField = (panel: HTMLElement) => panel.querySelector<HTMLInputElement>(".workspace-ai-link-address input");

/** Types into a field the way React hears it. */
function type(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

describe("the AI connection in the settings", () => {
  it("is off and asks for a relay first, and keeps a key for this browser", () => {
    const panel = mount();
    expect(relayField(panel).value).toBe("");
    expect(toggle(panel).checked).toBe(false);
    expect(toggle(panel).disabled).toBe(true);
    expect(panel.textContent).toContain("Enter the address of a relay first.");
    expect(status(panel).textContent).toBe("Switched off. No AI can reach this browser.");
    expect(addressField(panel)).toBeNull();
    expect(stored()).toMatchObject({ enabled: false, url: "" });
    expect(stored()!.code).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it("shows the address for the AI once a relay is entered, and connects when switched on", () => {
    const panel = mount();
    const code = stored()!.code;
    type(relayField(panel), "relay.example.com/");
    expect(relayField(panel).value).toBe("https://relay.example.com");
    expect(stored()).toEqual({ enabled: false, url: "https://relay.example.com", code });
    expect(addressField(panel)!.value).toBe(`https://relay.example.com/mcp/${code}`);
    expect(toggle(panel).disabled).toBe(false);

    const before = changes;
    act(() => toggle(panel).click());
    expect(stored()!.enabled).toBe(true);
    // The editor hears of it and connects.
    expect(changes).toBe(before + 1);
    act(() => setMcpRelayStatus("connecting"));
    expect(status(panel).textContent).toBe("Connecting to the relay…");
    act(() => setMcpRelayStatus("connected"));
    expect(status(panel).dataset.status).toBe("connected");
    expect(status(panel).textContent).toContain("Connected.");
    act(() => setMcpRelayStatus("unreachable"));
    expect(status(panel).textContent).toContain("The relay does not answer.");

    act(() => toggle(panel).click());
    expect(stored()!.enabled).toBe(false);
    expect(status(panel).textContent).toContain("Switched off.");
  });

  it("refuses an address that is no relay's, and leaves what was stored", () => {
    const panel = mount();
    type(relayField(panel), "https://relay.example.com");
    type(relayField(panel), "http://relay.example.com");
    expect(panel.querySelector("[role=alert]")?.textContent).toBe("A relay address begins with https://.");
    expect(relayField(panel).getAttribute("aria-invalid")).toBe("true");
    expect(stored()!.url).toBe("https://relay.example.com");
  });

  it("switches off when the relay's address is taken away", () => {
    const panel = mount();
    type(relayField(panel), "https://relay.example.com");
    act(() => toggle(panel).click());
    expect(stored()!.enabled).toBe(true);
    type(relayField(panel), "");
    expect(stored()).toMatchObject({ enabled: false, url: "" });
    expect(toggle(panel).disabled).toBe(true);
    expect(addressField(panel)).toBeNull();
  });

  it("makes a new address on request, so the old one stops working", () => {
    const panel = mount();
    type(relayField(panel), "https://relay.example.com");
    const before = stored()!.code;
    const button = [...panel.querySelectorAll("button")].find((entry) => entry.textContent === "Make a new address")!;
    act(() => button.click());
    const after = stored()!.code;
    expect(after).not.toBe(before);
    expect(addressField(panel)!.value).toBe(`https://relay.example.com/mcp/${after}`);
  });

  it("comes back as it was left", () => {
    const code = "abcdefghijklmnopqrstuvwxyz012345";
    window.localStorage.setItem(MCP_RELAY_STORAGE_KEY, JSON.stringify({ enabled: true, url: "https://relay.example.com", code }));
    const panel = mount();
    expect(toggle(panel).checked).toBe(true);
    expect(relayField(panel).value).toBe("https://relay.example.com");
    expect(addressField(panel)!.value).toBe(`https://relay.example.com/mcp/${code}`);
  });
});
