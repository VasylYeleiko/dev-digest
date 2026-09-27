"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { s } from "./styles";

/**
 * Inline multi-select of agents to link the new skill to. A plain checkbox
 * list, not `vendor/ui`'s Dropdown — that menu closes on every click and
 * can't host a multi-select (client/INSIGHTS.md, 2026-09-20).
 */
export function AgentPicker({
  agents,
  selected,
  onToggle,
}: {
  agents: readonly Agent[];
  selected: readonly string[];
  onToggle: (agentId: string) => void;
}) {
  const t = useTranslations("conventions");
  if (agents.length === 0) return <div style={s.muted}>{t("modal.noAgents")}</div>;
  return (
    <div style={s.agentList}>
      {agents.map((a) => (
        <Checkbox
          key={a.id}
          checked={selected.includes(a.id)}
          onChange={() => onToggle(a.id)}
          label={
            <span>
              {a.name}
              <span className="mono" style={s.agentModel}>
                {a.model}
              </span>
            </span>
          }
        />
      ))}
    </div>
  );
}
