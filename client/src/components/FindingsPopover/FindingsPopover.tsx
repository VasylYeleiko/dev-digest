/* FindingsPopover — severity icons + counts, and a hover/focus/click popover
   titled "N FINDINGS IN THIS RUN" with a READ-ONLY preview of each finding
   (no Accept/Dismiss — that lives on the PR detail page's ReviewRunAccordion,
   not here). Shared by two callers: the PR list's FINDINGS cell (counts +
   preview = the latest review) and the PR detail TIMELINE's per-run row
   (counts + preview = that run's findings).

   The panel is rendered through a portal to `document.body`, positioned from
   the trigger's `getBoundingClientRect()` — NOT `position: absolute` inside
   the row. Both callers wrap rows in a container that sets `overflow: hidden`
   to clip rounded corners; an absolutely-positioned descendant gets clipped by
   that same box the instant it would extend past the row's in-flow content
   height/width. Portaling escapes that ancestor entirely.

   Opens on hover/focus (transient) AND click (pinned — stays open until an
   outside click or Escape). Pinning exists because the panel's finding list
   can be longer than the trigger's hover-out grace: without it, moving the
   mouse into the panel to scroll would close it. It also gives deterministic
   browser-automation tools (no synthetic hover) a way to open the panel. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, ConfidenceNum, type Category } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { PANEL_WIDTH, VIEWPORT_MARGIN } from "./constants";
import { s } from "./styles";

/** One finding as shown in the panel — a structural subset both `PrMeta`'s
 *  `findings_preview` and `FindingRecord` satisfy, so either caller can pass
 *  its findings straight through with no mapping. */
export interface FindingsPreviewItem {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  confidence: number;
  rationale: string;
}

export interface FindingsCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

/** Severity (contract enum) paired with its key in `FindingsCounts`. */
const SEVERITY_KEYS: { severity: Severity; key: keyof FindingsCounts }[] = [
  { severity: "CRITICAL", key: "critical" },
  { severity: "WARNING", key: "warning" },
  { severity: "SUGGESTION", key: "suggestion" },
];

export function FindingsPopover({
  counts,
  preview,
  zeroState,
}: {
  counts: FindingsCounts | null | undefined;
  preview: FindingsPreviewItem[] | null | undefined;
  /** Rendered instead of the default muted "—" when there is nothing to show.
   *  Lets a caller keep its own zero-state text (e.g. RunHistory's
   *  "0 finding(s)" line) instead of the PR list's dash. */
  zeroState?: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const [hovering, setHovering] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const open = hovering || pinned;
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const total = counts ? counts.critical + counts.warning + counts.suggestion : 0;

  const reposition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      // Clamp so the fixed-width panel never overflows the viewport's right edge.
      left: Math.min(rect.left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
    });
  }, []);

  const show = () => {
    reposition();
    setHovering(true);
  };
  const hide = () => setHovering(false);

  const togglePin = () => {
    reposition();
    setPinned((p) => !p);
  };

  // Keep the panel glued to its row while open — the app shell's <main> is a
  // scroll container, so a scroll or a viewport resize would otherwise leave
  // a `position: fixed` panel visually detached from its trigger.
  React.useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  // While pinned: a click/press outside the trigger AND the (portaled) panel
  // unpins; Escape unpins. Not needed for the transient hover case — that
  // closes on mouseleave/blur already.
  React.useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setPinned(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pinned]);

  if (!counts || total === 0) {
    return zeroState !== undefined ? <>{zeroState}</> : <span style={s.muted}>—</span>;
  }

  return (
    <div
      ref={triggerRef}
      style={s.trigger}
      tabIndex={0}
      role="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={t("list.findingsTrigger", { count: total })}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePin();
        }
      }}
      // The whole row navigates to the PR on click — reading this popover
      // (hovering, clicking to select text, clicking to pin) must never
      // trigger that.
      onClick={(e) => {
        e.stopPropagation();
        togglePin();
      }}
    >
      <div style={s.icons}>
        {SEVERITY_KEYS.filter(({ key }) => counts[key] > 0).map(({ severity, key }) => (
          <SeverityBadge key={severity} severity={severity} count={counts[key]} compact />
        ))}
      </div>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ ...s.panel, top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div style={s.panelHeader}>{t("list.findingsInRun", { count: total })}</div>
            <div style={s.list}>
              {(preview ?? []).map((f) => (
                <div key={f.id} style={s.item}>
                  <div style={s.itemHeader}>
                    <SeverityBadge severity={f.severity as Severity} compact />
                    <span style={s.itemTitle}>{f.title}</span>
                    <CategoryTag category={f.category as Category} />
                  </div>
                  <div style={s.itemMeta}>
                    <span className="mono" style={s.itemLocation}>
                      {f.file}:{f.start_line}
                    </span>
                    <ConfidenceNum value={f.confidence} />
                  </div>
                  <div style={s.itemBody}>{f.rationale}</div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
