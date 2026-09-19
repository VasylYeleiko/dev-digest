import React from "react";
import { formatCost } from "@/lib/cost";
import { formatTokens } from "@/lib/tokens";

/**
 * Per-run generation cost. Missing cost renders "—" (never "$0.00") so an
 * un-priced / failed / pre-tracking run reads differently from a genuine $0.
 *
 * - `compact`    → "$0.014"              (PR list COST column)
 * - `withTokens` → "9,119 tok · $0.0013" (Agent-runs timeline, under the time)
 * - `verdict`    → "$0.014 · 8.2K→1.3K"  (verdict banner title row)
 */
type Props =
  | { variant: "compact"; cost: number | null | undefined }
  | {
      variant: "withTokens" | "verdict";
      cost: number | null | undefined;
      tokensIn: number | null | undefined;
      tokensOut: number | null | undefined;
    };

const mutedStyle: React.CSSProperties = { color: "var(--text-muted)" };

export function RunCostBadge(props: Props) {
  if (props.variant === "compact") {
    const hasCost = props.cost != null;
    return (
      <span className="tnum" style={hasCost ? undefined : mutedStyle}>
        {formatCost(props.cost)}
      </span>
    );
  }

  // The verdict banner is a summary surface — an empty slot reads better there
  // than a dangling "—", so an un-priced run renders nothing at all.
  if (props.variant === "verdict") {
    if (props.cost == null) return null;
    return (
      <span className="tnum" style={mutedStyle}>
        {formatCost(props.cost)} · {formatTokens(props.tokensIn ?? 0, props.tokensOut ?? 0)}
      </span>
    );
  }

  const total = (props.tokensIn ?? 0) + (props.tokensOut ?? 0);
  // No tokens AND no cost → nothing meaningful to show (running/failed run).
  if (total === 0 && props.cost == null) return <span style={mutedStyle}>—</span>;

  return (
    <span className="tnum" style={mutedStyle}>
      {total.toLocaleString()} tok · {formatCost(props.cost)}
    </span>
  );
}
