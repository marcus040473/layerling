"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import {
  createRelayCode,
  MCP_RELAY_CHANGED_EVENT,
  MCP_RELAY_STATUS_EVENT,
  mcpRelayStatus,
  normalizeRelayUrl,
  readMcpRelaySettings,
  relayMcpUrl,
  writeMcpRelaySettings,
  type McpRelaySettings,
  type McpRelayStatus,
} from "@/lib/mcpRelayLink";

const STATUS_TEXT = {
  off: "aiLink.statusOff",
  connecting: "aiLink.statusConnecting",
  connected: "aiLink.statusConnected",
  unreachable: "aiLink.statusUnreachable",
} as const;

/**
 * The page "AI connection" in the settings: lets an AI app build in this browser's editor with nothing
 * installed, over a relay on the internet (mcpRelayLink.ts). A switch, the relay's address, the address
 * to give the AI app with a button that copies it, how the connection is, and a button that makes a new
 * address when the old one got into the wrong hands. It belongs to this browser, not to the design.
 */
export function AiLinkSettingsSection() {
  const [settings, setSettings] = useState<McpRelaySettings>(() => readMcpRelaySettings(true));
  const [relayText, setRelayText] = useState(settings.url);
  const [status, setStatus] = useState<McpRelayStatus>(mcpRelayStatus);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const followStatus = () => setStatus(mcpRelayStatus());
    const followSettings = () => setSettings(readMcpRelaySettings(true));
    followStatus();
    window.addEventListener(MCP_RELAY_STATUS_EVENT, followStatus);
    window.addEventListener(MCP_RELAY_CHANGED_EVENT, followSettings);
    return () => {
      window.removeEventListener(MCP_RELAY_STATUS_EVENT, followStatus);
      window.removeEventListener(MCP_RELAY_CHANGED_EVENT, followSettings);
    };
  }, []);

  const relayUrl = normalizeRelayUrl(relayText);
  const relayProblem = relayText.trim() && !relayUrl ? t("aiLink.relayInvalid") : "";
  const address = relayMcpUrl(settings);

  const save = (change: Partial<McpRelaySettings>) => {
    setCopied(false);
    setSettings(writeMcpRelaySettings({ ...settings, ...change }));
  };

  /** Takes the address typed into the field, once it is one; a connection that is on moves to the new relay. */
  const commitRelay = () => {
    const next = relayUrl ?? "";
    if (relayText.trim() && !relayUrl) return;
    setRelayText(next);
    if (next !== settings.url) save({ url: next, enabled: settings.enabled && Boolean(next) });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // No clipboard (an old browser, a page without https): the field is selected instead, for Ctrl+C.
      const field = document.querySelector<HTMLInputElement>(".workspace-ai-link-address input");
      field?.focus();
      field?.select();
    }
  };

  return (
    <>
      <div className="workspace-section-heading">
        <strong>{t("aiLink.title")}</strong>
        <span>{t("aiLink.intro")}</span>
      </div>
      <div className="workspace-ai-link">
        <label className="workspace-select" data-help={t("aiLink.relay")}>
          <span>{t("aiLink.relay")}</span>
          <input
            type="url"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            placeholder="https://"
            value={relayText}
            aria-invalid={relayProblem ? true : undefined}
            onChange={(event) => setRelayText(event.currentTarget.value)}
            onBlur={commitRelay}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
        <p className="workspace-ai-link-hint" role={relayProblem ? "alert" : undefined}>{relayProblem || t("aiLink.relayHint")}</p>

        <label className="workspace-toggle" data-help={t("aiLink.enable")}>
          <span className="workspace-toggle-copy">
            <span>{t("aiLink.enable")}</span>
            <small>{settings.url ? t("aiLink.enableHint") : t("aiLink.relayMissing")}</small>
          </span>
          <input type="checkbox" checked={settings.enabled} disabled={!settings.url} onChange={(event) => save({ enabled: event.currentTarget.checked })} />
        </label>

        <p className="workspace-ai-link-status" role="status" data-status={settings.enabled ? status : "off"}>
          {t(STATUS_TEXT[settings.enabled ? status : "off"])}
        </p>

        {settings.url ? (
          <div className="workspace-ai-link-address" data-help={t("aiLink.address")}>
            <strong>{t("aiLink.address")}</strong>
            <span className="workspace-ai-link-row">
              <input type="text" readOnly value={address} aria-label={t("aiLink.address")} onFocus={(event) => event.currentTarget.select()} />
              <button type="button" onClick={() => void copy()}>{copied ? t("aiLink.copied") : t("aiLink.copy")}</button>
            </span>
            <p className="workspace-ai-link-hint">{t("aiLink.addressHint")}</p>
            <p className="workspace-ai-link-hint workspace-ai-link-warning">{t("aiLink.warning")}</p>
            <span className="workspace-ai-link-row">
              <button type="button" onClick={() => save({ code: createRelayCode() })}>{t("aiLink.newAddress")}</button>
              <small>{t("aiLink.newAddressHint")}</small>
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}
