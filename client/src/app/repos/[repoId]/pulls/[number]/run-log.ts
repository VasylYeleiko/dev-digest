/* Run-bus events → the LiveLogStream line shape. Used by both the live
   RunStatus panel and the RunTraceDrawer, so it lives at the route level. */
import type { LogLine } from "@devdigest/ui";

interface RawEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}
