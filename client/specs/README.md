# client/specs

Feature/RFC specs for this package — written before or alongside
implementation, one file per feature.

- [pages.md](pages.md) — every route, its data hooks, and its URL state

Cross-package specs live with the package that owns the data model:

- **Run cost** (COST column, cost badge on the timeline, trace drawer and
  verdict banner) → [`server/specs/0001-run-cost.md`](../../server/specs/0001-run-cost.md)
- **Review flow** (findings/score/cost rollups the PR list reads) →
  [`server/specs/review-flow.md`](../../server/specs/review-flow.md)
