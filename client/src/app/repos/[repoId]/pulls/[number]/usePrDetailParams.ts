/* URL state of the PR detail page: the active tab (?tab) and the open run
   trace (?trace). Kept in the URL so both survive reloads and can be linked. */
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function usePrDetailParams(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();

  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    router.replace(`/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  return {
    tab: search.get("tab") ?? "overview",
    traceRunId: search.get("trace"),
    setTab: (t: string) => setParam("tab", t),
    openTrace: (runId: string) => setParam("trace", runId),
    closeTrace: () => setParam("trace", null),
  };
}
