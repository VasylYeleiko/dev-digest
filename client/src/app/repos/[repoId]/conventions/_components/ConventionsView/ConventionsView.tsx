"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionStatus } from "@devdigest/shared";
import { AppShell } from "../../../../../../components/app-shell";
import { RepoNotFound } from "../../../../../../components/repo-not-found";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "../../../../../../lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "../../../../../../lib/repo-context";
import { ConventionCard, type ConventionEdit } from "../ConventionCard";
import { CreateConventionsSkillModal } from "../CreateConventionsSkillModal";
import { acceptedIds, formatAgo, pendingIds } from "./helpers";
import { s } from "./styles";

/**
 * /repos/:repoId/conventions — Skills Lab → Conventions. Run Scan (first run)
 * or Re-scan, triage the grounded candidates, then merge the accepted ones
 * into a skill via the Create-skill modal.
 */
export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [creating, setCreating] = React.useState(false);

  const repoName = activeRepo?.id === repoId ? activeRepo.full_name : repoId;
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const items = data?.items ?? [];
  const accepted = acceptedIds(items);
  const pending = pendingIds(items);
  const scan = data?.scan ?? null;

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const setStatus = (id: string, status: ConventionStatus) => update.mutate({ id, patch: { status } });
  const saveEdit = async (id: string, edit: ConventionEdit) => {
    await update.mutateAsync({ id, patch: edit });
  };
  const acceptAll = async () => {
    for (const id of pending) await update.mutateAsync({ id, patch: { status: "accepted" } });
  };
  const runScan = () => extract.mutate();

  return (
    <AppShell crumb={crumb}>
      {creating && (
        <CreateConventionsSkillModal
          repoId={repoId}
          repoName={repoName}
          conventionIds={accepted}
          onClose={() => setCreating(false)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>
              {scan
                ? t("page.subtitle", { files: scan.sample_files.length, when: formatAgo(scan.created_at) })
                : t("page.subtitleNoScan")}
            </p>
            {scan && (
              <p style={s.stats}>
                {t("page.scanStats", { proposed: scan.proposed, dropped: scan.dropped, skipped: scan.skipped })}
              </p>
            )}
          </div>
          {scan && (
            <Button icon="RefreshCw" onClick={runScan} loading={extract.isPending}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>

        {extract.isPending && <p style={s.scanHint}>{t("page.scanHint")}</p>}
        {extract.isError && (
          <div role="alert" style={s.scanError}>
            {t("page.scanFailed")}: {extract.error.message}
          </div>
        )}

        {isLoading && (
          <div style={s.loadingStack}>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {!isLoading && !isError && !scan && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.runScan")}
            onCta={extract.isPending ? undefined : runScan}
          />
        )}
        {scan && items.length === 0 && (
          <EmptyState icon="ListChecks" title={t("page.noCandidates.title")} body={t("page.noCandidates.body")} />
        )}

        {items.length > 0 && (
          <>
            <div style={s.toolbar}>
              <span>{t("page.acceptedCount", { accepted: accepted.length, total: items.length })}</span>
              {pending.length > 0 && (
                <Button kind="ghost" size="sm" icon="Check" onClick={() => void acceptAll()} disabled={update.isPending}>
                  {t("page.acceptAll")}
                </Button>
              )}
              <span style={s.spacer} />
              {accepted.length > 0 && (
                <Button kind="primary" size="sm" icon="Sparkles" onClick={() => setCreating(true)}>
                  {t("page.createSkill")}
                </Button>
              )}
            </div>
            {items.map((c) => (
              <ConventionCard
                key={c.id}
                convention={c}
                busy={update.isPending && update.variables?.id === c.id}
                onStatus={(status) => setStatus(c.id, status)}
                onSave={(edit) => saveEdit(c.id, edit)}
              />
            ))}
          </>
        )}
      </div>
    </AppShell>
  );
}
