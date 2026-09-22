/* RunReviewDropdown — ported from components2.jsx, then extended with
   multi-select.
   "Run all enabled agents" / a specific agent (immediate) / a hand-picked
   subset (checkbox + "Run selected") → kicks off POST /pulls/:id/review and
   hands the resulting runIds up so the parent can stream SSE live status.

   This is a LOCAL menu, not `@devdigest/ui`'s `Dropdown` primitive: that
   primitive's `DropdownItem` unconditionally closes the menu after every
   item click (`vendor/ui/kit/Dropdown.tsx`), which is incompatible with a
   checkbox row that must stay open across multiple clicks while the user
   builds a selection. `vendor/ui` is do-not-touch, so the menu shell (open
   state + outside-click) is reimplemented here, reusing the same visual
   chrome (see `styles.ts`). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { s } from "./styles";

/** One clickable, hover-highlighted row (the local stand-in for the vendor
 *  Dropdown's `DropdownItem`, minus the auto-close-on-click behavior). */
function ActionRow({
  icon,
  children,
  onClick,
  muted,
  disabled,
}: {
  icon: keyof typeof Icon;
  children: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
  disabled?: boolean;
}) {
  const [h, setH] = React.useState(false);
  const I = Icon[icon];
  return (
    <button
      type="button"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...(muted ? s.actionRowMuted(h) : s.actionRow(h)),
        ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined),
      }}
    >
      <I size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{children}</span>
    </button>
  );
}

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const run = useRunReview();
  const all = agents ?? [];
  const hasEnabled = all.some((a) => a.enabled);

  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const kick = async (opts: { all?: boolean; agentId?: string; agentIds?: string[] }) => {
    setOpen(false);
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } finally {
      onRunSettled?.();
    }
  };

  const toggleAgent = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runSelected = () => {
    const ids = [...selected];
    setSelected(new Set());
    void kick({ agentIds: ids });
  };

  return (
    <div ref={ref} style={s.wrap}>
      <span
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={run.isPending}>
          {run.isPending ? t("runReview.running") : t("runReview.runReview")}
        </Button>
      </span>

      {open && (
        <div style={s.panel}>
          {warnMerged && (
            <>
              <div style={s.warningRow}>
                <Icon.AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>{t("runReview.mergedWarning")}</span>
              </div>
              <div style={s.divider} />
            </>
          )}

          <ActionRow icon="Play" onClick={() => void kick({ all: true })} muted={!hasEnabled}>
            {t("runReview.runAll")}
          </ActionRow>

          <div style={s.divider} />

          {all.length ? (
            <div role="group" aria-label={t("runReview.selectAgents")} style={s.agentList}>
              {all.map((a) => (
                <div key={a.id} style={s.agentRow}>
                  <Checkbox
                    checked={selected.has(a.id)}
                    onChange={() => toggleAgent(a.id)}
                    label={
                      <span style={s.agentLabel}>
                        <span style={s.agentName}>{a.name}</span>
                        <span style={s.agentHint}>{a.enabled ? a.model : `${a.model} · disabled`}</span>
                      </span>
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <ActionRow icon="Plus" onClick={() => router.push("/agents")} muted>
              {t("runReview.noAgents")}
            </ActionRow>
          )}

          {selected.size > 0 && (
            <>
              <div style={s.divider} />
              <Button kind="primary" size="sm" full onClick={runSelected}>
                {t("runReview.runSelected", { count: selected.size })}
              </Button>
            </>
          )}

          <div style={s.divider} />
          <ActionRow icon="Settings" onClick={() => router.push("/agents")} muted>
            {t("runReview.configureAgents")}
          </ActionRow>
        </div>
      )}
    </div>
  );
}
