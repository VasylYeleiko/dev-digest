import { Provider } from "@devdigest/shared";

/** Default provider/model for a new agent. */
export const DEFAULT_PROVIDER: Provider = "openai";
export const DEFAULT_MODEL = "gpt-4.1";

/** Selectable providers in the create form — straight from the contract enum. */
export const PROVIDER_OPTIONS: readonly Provider[] = Provider.options;

/** Modal width (px). */
export const MODAL_WIDTH = 620;
