import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInvalidateRunState } from "./reviews";

function setup(prId: string | null) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useInvalidateRunState(prId), { wrapper });
  return { result, spy };
}

describe("useInvalidateRunState", () => {
  // These must stay the exact keys usePrActiveRuns / usePrRuns read, or the
  // live-status pills and run history silently stop refreshing after a run.
  it("targets the active-runs and run-history caches of that PR", () => {
    const { result, spy } = setup("pr-1");
    result.current.activeRuns();
    result.current.history();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["pr-active-runs", "pr-1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["pr-runs", "pr-1"] });
  });

  it("is a no-op until the PR id is resolved", () => {
    const { result, spy } = setup(null);
    result.current.activeRuns();
    result.current.history();
    expect(spy).not.toHaveBeenCalled();
  });
});
