"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { t } from "@/lib/i18n";
import { SURFACE_TEXTURE_LABELS } from "@/lib/surfaceTextureShape";
import { SURFACE_TEXTURE_PATTERNS, type SurfaceTexturePattern } from "@/lib/surfaceTexture";

/** A small picture of each pattern: its front face on a box, rendered from the surface texture code with its starting values. */
const thumbnail = (pattern: SurfaceTexturePattern) => `assets/editor/surface-patterns/${pattern}.png`;

/**
 * The surface texture's pattern, chosen by its picture (the GUI examples, D): the field shows the chosen one; opened,
 * a grid of all of them with a search above. Arrow keys move through the grid, Enter takes one, Escape closes it.
 */
export function SurfacePatternPicker({ value, disabled = false, onChange }: {
  value: SurfaceTexturePattern;
  disabled?: boolean;
  onChange: (value: SurfaceTexturePattern) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const label = (pattern: SurfaceTexturePattern) => t(SURFACE_TEXTURE_LABELS.pattern[pattern]);
  const words = query.trim().toLocaleLowerCase();
  const shown = SURFACE_TEXTURE_PATTERNS.filter((pattern) => !words || label(pattern).toLocaleLowerCase().includes(words) || pattern.includes(words));

  useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    const away = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };
  const choose = (pattern: SurfaceTexturePattern) => {
    if (pattern !== value) onChange(pattern);
    close();
  };
  const tiles = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [])];
  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = tiles();
    const index = all.indexOf(document.activeElement as HTMLButtonElement);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      if (index + step < 0 && step === -2) searchRef.current?.focus();
      else all[Math.min(all.length - 1, Math.max(0, index + step))]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div className="pattern-picker" ref={rootRef}>
      <span className="pattern-picker-label">{t("inspector.surfacePattern")}</span>
      <button
        ref={triggerRef}
        type="button"
        className="pattern-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <PatternThumbnail pattern={value} />
        <span>{label(value)}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open ? (
        <div className="pattern-picker-popover">
          <label className="pattern-picker-search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={t("inspector.surfacePatternSearch")}
              aria-label={t("inspector.surfacePatternSearch")}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  event.stopPropagation();
                  tiles()[0]?.focus();
                } else if (event.key === "Enter" && shown.length > 0) {
                  event.preventDefault();
                  event.stopPropagation();
                  choose(shown[0]);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
              }}
            />
          </label>
          <div className="pattern-picker-grid" role="listbox" id={listId} aria-label={t("inspector.surfacePattern")} ref={listRef} onKeyDown={onGridKey}>
            {shown.map((pattern) => (
              <button
                key={pattern}
                type="button"
                role="option"
                aria-selected={pattern === value}
                tabIndex={-1}
                className={pattern === value ? "selected" : ""}
                onClick={() => choose(pattern)}
              >
                <PatternThumbnail pattern={pattern} />
                <span>{label(pattern)}</span>
                {pattern === value ? <Check className="pattern-picker-check" size={14} aria-hidden="true" /> : null}
              </button>
            ))}
            {shown.length === 0 ? <p className="pattern-picker-empty">{t("inspector.surfacePatternNone")}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A pattern's picture; a missing one leaves an empty tile instead of a broken image. */
function PatternThumbnail({ pattern }: { pattern: SurfaceTexturePattern }) {
  const [missing, setMissing] = useState(false);
  return missing ? <span className="pattern-thumbnail missing" aria-hidden="true" /> : (
    <img className="pattern-thumbnail" src={thumbnail(pattern)} alt="" aria-hidden="true" onError={() => setMissing(true)} />
  );
}
