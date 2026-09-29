"use client";

import { useTranslations } from "next-intl";
import { Modal, Skeleton } from "@devdigest/ui";
import { useAgents } from "../../../../../../lib/hooks/agents";
import { useConventionSkillDraft } from "../../../../../../lib/hooks/conventions";
import { MODAL_WIDTH } from "./constants";
import { SkillDraftForm } from "./SkillDraftForm";
import { s } from "./styles";

/**
 * "Create skill" from the accepted conventions: fetches the merged draft and
 * the agent list, then hands both to the editable form.
 */
export function CreateConventionsSkillModal({
  repoId,
  repoName,
  conventionIds,
  onClose,
}: {
  repoId: string;
  repoName: string;
  conventionIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const draft = useConventionSkillDraft(repoId, conventionIds);
  const agents = useAgents();

  if (draft.data && agents.data) {
    return (
      <SkillDraftForm
        repoId={repoId}
        repoName={repoName}
        draft={draft.data}
        agents={agents.data}
        onClose={onClose}
      />
    );
  }

  const failed = draft.isError || agents.isError;
  return (
    <Modal width={MODAL_WIDTH} title={t("modal.title")} onClose={onClose}>
      <div style={s.loading}>
        {failed ? (
          <div role="alert" style={s.error}>
            {draft.error?.message ?? agents.error?.message ?? t("modal.draftError")}
          </div>
        ) : (
          <>
            <span style={s.muted}>{t("modal.draftLoading")}</span>
            <Skeleton height={36} />
            <Skeleton height={180} />
          </>
        )}
      </div>
    </Modal>
  );
}
