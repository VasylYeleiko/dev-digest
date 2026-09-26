import type { SkillSource } from "@devdigest/shared";
import { SOURCE_ICON } from "./constants";

export function sourceIcon(source: SkillSource) {
  return SOURCE_ICON[source];
}
