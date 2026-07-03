/**
 * @okeytokey/figma-bridge — pure Figma integration logic shared by the
 * plugin's main thread and UI iframe. No `figma` globals, no DOM.
 */

export {
  BRIDGE_PROTOCOL_VERSION,
  applyTargetSchema,
  mainToUiSchema,
  mappingReportSchema,
  parseMainToUi,
  parseUiToMain,
  themeSchema,
  uiToMainSchema,
  type ApplyTarget,
  type MainToUi,
  type MappingReport,
  type UiToMain,
} from "./protocol.js";

export {
  ApplyError,
  cssToFigmaColor,
  dimensionToPx,
  fontWeightToStyle,
  planApply,
  type ApplyAction,
  type FigmaRGBA,
} from "./apply.js";

export {
  importVariables,
  planVariableExport,
  type VariableDump,
  type VariableExportPlan,
  type VariableImportResult,
  type VariablePlanEntry,
  type VariableValue,
} from "./variables.js";
