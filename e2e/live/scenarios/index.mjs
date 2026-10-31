import { differentiatorScenarios } from "./differentiators.mjs";
import { gateScenarios } from "./gate.mjs";
import { genericScenarios } from "./generic.mjs";

export const scenarios = [...gateScenarios, ...differentiatorScenarios, ...genericScenarios];
