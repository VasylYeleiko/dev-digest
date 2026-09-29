"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, ProgressBar, SelectInput, Textarea } from "@devdigest/ui";
import type { Convention, ConventionCategory, ConventionStatus } from "@devdigest/shared";
import { CATEGORY_VALUES, RULE_EDITOR_ROWS } from "./constants";
import { confidenceColor, confidencePercent, evidenceRef, splitInlineCode } from "./helpers";
import { s } from "./styles";

export interface ConventionEdit {
  rule: string;
  category: ConventionCategory;
}

/**
 * One extracted rule: the rule text, the evidence sliced from the real file,
 * the confidence bar, and triage — Accept (toggles back to pending), Reject,
 * and Edit, which swaps the rule for an inline editor on the same card.
 */
export function ConventionCard({
  convention,
  busy,
  onStatus,
  onSave,
}: {
  convention: Convention;
  busy: boolean;
  onStatus: (status: ConventionStatus) => void;
  onSave: (edit: ConventionEdit) => Promise<void>;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(convention.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(convention.category);

  const accepted = convention.status === "accepted";
  const percent = confidencePercent(convention.confidence);
  const ref = evidenceRef(convention);

  const startEdit = () => {
    setRule(convention.rule);
    setCategory(convention.category);
    setEditing(true);
  };
  const save = async () => {
    await onSave({ rule: rule.trim(), category });
    setEditing(false);
  };

  return (
    <article style={s.card(accepted)} aria-label={convention.rule}>
      <div style={s.main}>
        {editing ? (
          <div style={s.editor}>
            <FormField label={t("card.ruleLabel")} required>
              <Textarea value={rule} onChange={setRule} rows={RULE_EDITOR_ROWS} />
            </FormField>
            <FormField label={t("card.categoryLabel")}>
              <SelectInput
                value={category}
                onChange={(v) => setCategory(v as ConventionCategory)}
                options={CATEGORY_VALUES.map((c) => ({ value: c, label: t(`category.${c}`) }))}
              />
            </FormField>
            <div style={s.editorActions}>
              <Button kind="primary" size="sm" onClick={save} disabled={busy || rule.trim().length === 0}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div style={s.ruleRow}>
            <div style={s.rule}>
              {splitInlineCode(convention.rule).map((seg, i) =>
                seg.code ? (
                  <code key={i} className="mono" style={s.inlineCode}>
                    {seg.text}
                  </code>
                ) : (
                  <React.Fragment key={i}>{seg.text}</React.Fragment>
                ),
              )}
            </div>
            <Badge>{t(`category.${convention.category}`)}</Badge>
          </div>
        )}

        {ref && convention.evidence_snippet ? (
          <div style={s.evidence}>
            <div style={s.evidenceHeader}>
              <Icon.FileText size={12} />
              <span className="mono">{ref}</span>
            </div>
            <pre className="mono" style={s.snippet}>
              {convention.evidence_snippet}
            </pre>
          </div>
        ) : (
          <div style={s.noEvidence}>{t("card.noEvidence")}</div>
        )}

        {percent !== null && (
          <div style={s.confidenceRow}>
            <span>{t("card.confidence")}</span>
            <div style={s.confidenceBar}>
              <ProgressBar value={percent} color={confidenceColor(percent)} />
            </div>
            <span className="mono">{percent}%</span>
          </div>
        )}
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          aria-pressed={accepted}
          onClick={() => onStatus(accepted ? "pending" : "accepted")}
          disabled={busy || editing}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button kind="ghost" size="sm" icon="X" onClick={() => onStatus("rejected")} disabled={busy || editing}>
          {t("card.reject")}
        </Button>
        <Button kind="ghost" size="sm" icon="Edit" onClick={startEdit} disabled={busy || editing}>
          {t("card.edit")}
        </Button>
      </div>
    </article>
  );
}
