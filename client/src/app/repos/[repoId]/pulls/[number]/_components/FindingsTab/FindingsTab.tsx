"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { s } from "./styles";
import type { PrCommit } from "@devdigest/shared";
import { groupFindingsByRun } from "./helpers";
import {
  usePrReviews,
  usePrActiveRuns,
  usePrRuns,
  useCancelRun,
  useDeleteRun,
  useInvalidateRunState,
} from "../../../../../../../lib/hooks/reviews";

interface FindingsTabProps {
  prId: string | null;
  prCommits: PrCommit[];
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (id: string) => void;
}

/**
 * Findings tab — live runs, timeline and the review-run accordions. Owns its
 * run data through the reviews hooks (React Query shares the cache with the
 * page, so nothing is fetched twice).
 */
export function FindingsTab({ prId, prCommits, repoFullName, headSha, onOpenTrace }: FindingsTabProps) {
  const t = useTranslations("prReview");
  // `runs` are REVIEWS; `prRuns` are the AGENT RUNS (status, cost) — see client/INSIGHTS.md.
  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);
  const runs = React.useMemo(() => reviews ?? [], [reviews]);
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;
  const cancel = useCancelRun();
  const deleteRun = useDeleteRun(prId);
  const invalidateRunState = useInvalidateRunState(prId);

  const lethalTrifecta = runs.flatMap((r) => r.findings).filter((f) => f.kind === "lethal_trifecta");

  const handleCancelAll = () => liveRunIds.forEach((id) => cancel.mutate(id));
  const handleOpenFirstTrace = () => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  };
  const handleDelete = (id: string) => {
    if (window.confirm(t("findingsTab.deleteRunConfirm"))) deleteRun.mutate(id);
  };
  // A run settled (done OR failed): refresh live runs, the run history (so a
  // just-failed run shows up without a reload) and the persisted reviews.
  const handleRunDone = () => {
    invalidateRunState.activeRuns();
    invalidateRunState.history();
    refetchReviews();
  };

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = React.useCallback((runId: string) => {
    setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
  }, []);

  const findingsByRun = React.useMemo(() => groupFindingsByRun(runs), [runs]);

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancel.isPending}
                  onClick={handleCancelAll}
                >
                  {t("findingsTab.cancel")}
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  {t("findingsTab.openTrace")}
                </Button>
              </div>
            }
          >
            {t("findingsTab.liveReview")}
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={handleRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>{t("findingsTab.inProgress")}</span>
          <span style={s.reviewInProgressSub}>{t("findingsTab.inProgressSub")}</span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>{t("findingsTab.trifectaTitle")}</span>
          <Badge color="var(--crit)" bg="transparent">
            {t("findingsTab.trifectaCount", { count: lethalTrifecta.length })}
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("findingsTab.timelineHint")}</span>}
          >
            {t("findingsTab.timeline")}
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            findingsByRun={findingsByRun}
            onOpenTrace={onOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("findingsTab.reviewRunsHint")}</span>}
      >
        {t("findingsTab.reviewRuns")}
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title={t("findingsTab.emptyTitle")}
            body={t("findingsTab.emptyBody")}
          />
        )
      ) : (
        prId &&
        runs.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            // `runs` here are REVIEWS; the agent run carrying cost/tokens lives
            // in `prRuns`, matched by run_id (null when the run was deleted).
            run={prRuns?.find((r) => r.run_id === review.run_id) ?? null}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
          />
        ))
      )}
    </section>
  );
}
