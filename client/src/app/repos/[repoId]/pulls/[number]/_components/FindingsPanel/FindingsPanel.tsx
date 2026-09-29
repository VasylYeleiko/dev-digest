/* FindingsPanel — severity pills + severity filter, hide-low-confidence +
   j/k navigation + FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { countBySeverity, type FindingSeverity } from "../../severity";
import { SeverityBar } from "./SeverityBar";
import { useShortcutOwner } from "./activePanel";
import { isTextInput } from "../../../../../../../components/app-shell/helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [sevFilter, setSevFilter] = React.useState<FindingSeverity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, sevFilter),
    [findings, hideLow, sevFilter],
  );
  // Filtering can shrink `shown` past the last focused index — clamp rather
  // than let the focus ring point past the end (same fix `hideLow` needed).
  const focus = shown.length ? Math.min(focusIdx, shown.length - 1) : 0;

  const onToggleSeverity = (sev: FindingSeverity) => setSevFilter((prev) => (prev === sev ? null : sev));

  // j/k navigation + a/d shortcuts on the focused finding (keyboard). Only the
  // panel that owns the shortcuts reacts — see activePanel.ts.
  const { active, claim } = useShortcutOwner();
  React.useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return;
      // Leave Ctrl/Cmd/Alt combos (e.g. Ctrl+K palette, Cmd+D bookmark) alone.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "j") setFocusIdx(Math.min(focus + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx(Math.max(focus - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focus]) {
        action.mutate({ findingId: shown[focus]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, shown, focus, action, prId]);

  return (
    <div onPointerDownCapture={claim} onFocusCapture={claim}>
      <SeverityBar counts={counts} active={sevFilter} onToggle={onToggleSeverity} />
      <div style={s.toolbar}>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={active && i === focus}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
