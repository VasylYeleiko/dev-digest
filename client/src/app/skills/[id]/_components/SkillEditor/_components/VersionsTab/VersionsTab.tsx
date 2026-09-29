/* VersionsTab — version history with an inline Diff (vs. the PREVIOUS
   version, not the current body — see client/INSIGHTS.md) and a Restore
   action per past version. `versions` comes back newest-first (server
   `ORDER BY version DESC`), so a version's predecessor is simply the next
   entry in the array; the oldest version (v1) has no predecessor and so no
   Diff button. Restore has no dedicated endpoint: it PUTs the chosen
   version's body, which snapshots a new version server-side. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Skeleton, EmptyState } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { diffLines, formatVersionDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  const restore = (version: SkillVersion) =>
    update.mutate(
      { id: skill.id, patch: { body: version.body } },
      {
        onSuccess: (data) =>
          toast.success(t("versions.restored", { version: version.version, newVersion: data.version })),
      },
    );

  const toggleDiff = (version: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  const list = versions ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.note}>{t("versions.reproNote")}</div>
      {isLoading && (
        <>
          <Skeleton height={48} style={{ marginBottom: 8 }} />
          <Skeleton height={48} style={{ marginBottom: 8 }} />
        </>
      )}
      {!isLoading && list.length === 0 && <EmptyState icon="History" title={t("versions.empty")} />}
      {list.map((v, i) => {
        const current = v.version === skill.version;
        const prev = list[i + 1]; // one entry older, since `list` is newest-first
        const isExpanded = expanded.has(v.version);
        const lines = prev && isExpanded ? diffLines(prev.body, v.body) : null;
        const hasChanges = lines?.some((l) => l.type !== "same") ?? false;
        return (
          <div key={v.version} style={s.card}>
            <div style={s.row}>
              <span style={s.rowLabel}>{t("versions.versionLabel", { version: v.version, date: formatVersionDate(v.created_at) })}</span>
              {current && <Badge color="var(--accent)">{t("versions.current")}</Badge>}
              <div style={s.rowActions}>
                {prev && (
                  <Button kind="secondary" size="sm" icon="ArrowRight" onClick={() => toggleDiff(v.version)}>
                    {isExpanded ? t("versions.hideDiff") : t("versions.diff")}
                  </Button>
                )}
                {!current && (
                  <Button kind="secondary" size="sm" icon="History" onClick={() => restore(v)} disabled={update.isPending}>
                    {update.isPending ? t("versions.restoring") : t("versions.restore")}
                  </Button>
                )}
              </div>
            </div>
            {lines && prev && (
              <div style={s.diffPanel}>
                <div style={s.diffRange}>{t("versions.diffRange", { from: prev.version, to: v.version })}</div>
                {hasChanges ? (
                  <div style={s.diffBody}>
                    {lines.map((l, li) => (
                      <div key={li} style={s.diffLine(l.type)}>
                        {l.type === "add" ? "+ " : l.type === "remove" ? "- " : "  "}
                        {l.text}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={s.diffBody}>{t("versions.noChanges")}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
