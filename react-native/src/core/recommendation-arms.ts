import { deepMerge, isRecord, type ExperimentAssignment, type ExperimentGate } from './eligibility.js';
import type { RecommendationWidgetSummary, ResolvedRecommendationWidget } from '../types.js';

/**
 * What the visitor's A/B arms make of one recommendation strip.
 *
 * ## Why the SDK decides this, not the host
 *
 * A recommendation experiment used to be invisible in an app: the products
 * request went to the widget the host named, so every app visitor saw the
 * CONTROL strip whatever arm they were in, and no exposure was ever recorded
 * for them — the app's traffic was simply missing from the results page. Every
 * entry point that takes a widget id (`getRecommendationProducts`, the two
 * `trackRecommendation*` calls, `useRecommendationWidget`, the App Maker
 * strips) resolves the arm here first, so a host that hard-codes a widget id
 * is in the experiment without changing a line.
 *
 * ## The rules, in order — the browser widget's (`applyExperimentOverrides`)
 *
 * 1. **A `different_module` arm draws another strip in this one's place**
 *    (`ExperimentGate.replacementFor`). The arm's module is requested, drawn
 *    and reported under ITS OWN id, as the web does (`rec-widget-<arm id>`).
 *    It is usually inactive on its own; the API serves its products only
 *    while a running experiment swaps it in. This is asked BEFORE the
 *    exclusion check, because the control is in the arm's own
 *    `excludedTargetIds` — asked after it, the arm draws nothing, which is
 *    what the browser widget's recommendation module did until 2026-10-07
 *    (its test stubbed `shouldRenderTarget` to `true`, so nothing caught it).
 * 2. **A holdout arm draws nothing** — and asks for nothing. The contract
 *    refuses a holdout arm on a recommendation experiment
 *    (`HOLDOUT_TARGET_SUPPORT` in `@selwise/experiment-contract`): whether a
 *    strip is drawn depends on the server's answer, and that request is itself
 *    recorded. One stored before the rule, or reaching a later API, is still
 *    never drawn and never requested — and records no exposure either, since
 *    the moment the strip "would have appeared" cannot be known without the
 *    request.
 * 3. **A strip an arm excludes and replaces with nothing draws nothing** — an
 *    arm whose module did not arrive, or an arm's module asked for by a
 *    visitor in another arm.
 * 4. **Otherwise the strip itself**, with a `config_override` arm's override.
 *    Only what the app can honour is applied here: the title and subtitle (the
 *    two content fields the web renderer reads, `text` / `description` as
 *    aliases of the subtitle), the display type (the contract puts it under
 *    `recommendation`; a top-level one is accepted too, here and on the web) and the
 *    styles, merged into `containerStyles`. They reach the HOST as data — it
 *    draws the strip. `recommendation.strategy` and `maxProducts` are the
 *    API's to apply: the products request carries the arm's id
 *    (`experimentVariantId`, the browser widget's field) and the API reads
 *    the override from the STORED arm — it never takes a strategy from a
 *    client. A count or strategy faked here would make the app arm a
 *    different arm from the web one.
 *
 * The arm's EXPOSURE is not recorded here — resolving is not showing. It rides
 * with the strip's first impression (`trackRecommendationImpression`), the
 * browser widget's moment, once per arm per process like a campaign's.
 */

export interface RecommendationArm extends ResolvedRecommendationWidget {
  /** The assignment covering the strip — what its exposure is recorded against. */
  assignment: ExperimentAssignment | null;
  /**
   * The arm overrides the strategy, so the LISTED widget's cart flag is not
   * necessarily the drawn strip's: the measured basket is sent with it (the
   * API ignores a cart for every strategy that does not read one).
   */
  strategyOverridden: boolean;
  /**
   * The `config_override` arm to name in the products request
   * (`experimentVariantId`), so the API runs that arm's strategy and count.
   * Never for `different_module`: there the strip asked for IS the arm, with
   * its own saved strategy — the browser widget's `experimentVariantIdFor`.
   */
  requestVariantId?: string;
}

/**
 * The strip for a visitor in the channel's CONTROL GROUP: drawn as nothing,
 * outside every experiment. No assignment, so no exposure is recorded for a
 * strip the visitor is never shown; the comparison is the control group
 * against everyone, not an arm of any one experiment.
 */
export function controlGroupArm(widgetId: string): RecommendationArm {
  const id = String(widgetId ?? '').trim();
  return {
    widgetId: id,
    sourceWidgetId: id,
    widget: null,
    experiment: null,
    hidden: true,
    assignment: null,
    strategyOverridden: false,
  };
}

/** The arm as a host sees it — without what only the SDK uses. */
export function toResolvedRecommendationWidget(arm: RecommendationArm): ResolvedRecommendationWidget {
  const { assignment: _assignment, strategyOverridden: _strategy, requestVariantId: _variant, ...resolved } = arm;
  return resolved;
}

type ArmGate = Pick<ExperimentGate, 'replacementFor' | 'forTarget' | 'shouldRenderTarget' | 'configFor'>;

export function resolveRecommendationArm(
  gate: ArmGate,
  widgetId: string,
  listed: RecommendationWidgetSummary | null = null
): RecommendationArm {
  const id = String(widgetId ?? '').trim();

  // 1. Another strip in this one's place.
  const replacement = gate.replacementFor(id);
  const module = replacement ? moduleSummary(replacement.moduleData, replacement.effectiveTargetId) : null;
  if (replacement && module) {
    return {
      widgetId: module.id,
      sourceWidgetId: id,
      widget: module,
      experiment: experimentOf(replacement),
      hidden: false,
      ...liveCart(replacement, module),
      assignment: replacement,
      strategyOverridden: false,
    };
  }

  const assignment = gate.forTarget(id);
  const experiment = experimentOf(assignment);

  // 2 and 3. Nothing to draw.
  if (assignment?.holdout === true || !gate.shouldRenderTarget(id)) {
    return {
      widgetId: id,
      sourceWidgetId: id,
      widget: null,
      experiment,
      hidden: true,
      assignment,
      strategyOverridden: false,
    };
  }

  // 4. The strip itself — listed, or an arm's own module asked for by id.
  const override = assignment ? gate.configFor(id) : null;
  const base = listed ?? (assignment ? moduleSummary(assignment.moduleData, id, id) : null);
  const widget = base
    ? applyRecommendationOverride(base, override)
    : overridesDisplay(override)
      ? applyRecommendationOverride({ id }, override)
      : null;

  return {
    widgetId: id,
    sourceWidgetId: id,
    widget,
    experiment,
    hidden: false,
    ...liveCart(assignment, widget),
    assignment,
    strategyOverridden: overriddenStrategy(override) !== null,
    ...(assignment && assignment.experimentMode !== 'different_module' && assignment.variantId
      ? { requestVariantId: assignment.variantId }
      : {}),
  };
}

/**
 * The listed widget with a `config_override` arm's display fields — the same
 * fields, aliases and precedence as the browser widget's
 * `applyExperimentOverrides`, so a title test reads the same on both.
 */
export function applyRecommendationOverride(
  widget: RecommendationWidgetSummary,
  override: Record<string, unknown> | null | undefined
): RecommendationWidgetSummary {
  if (!isRecord(override)) return widget;
  const next: RecommendationWidgetSummary = { ...widget };

  const content = isRecord(override.content) ? override.content : null;
  if (content) {
    if (typeof content.title === 'string') {
      next.title = content.title;
      next.titleStyles = { ...(isRecord(widget.titleStyles) ? widget.titleStyles : {}), enabled: true };
    }
    const subtitle = [content.subtitle, content.text, content.description].find(
      (value): value is string => typeof value === 'string'
    );
    if (subtitle !== undefined) {
      next.subtitle = subtitle;
      next.subtitleStyles = { ...(isRecord(widget.subtitleStyles) ? widget.subtitleStyles : {}), enabled: true };
    }
  }

  const section = isRecord(override.recommendation) ? override.recommendation : null;
  const displayType = section?.displayType ?? override.displayType;
  if (typeof displayType === 'string' && displayType.trim()) next.displayType = displayType;

  if (isRecord(override.styles)) {
    next.containerStyles = deepMerge(isRecord(widget.containerStyles) ? widget.containerStyles : {}, override.styles);
  }

  return next;
}

function overridesDisplay(override: Record<string, unknown> | null): boolean {
  if (!override) return false;
  const probe = applyRecommendationOverride({ id: '' }, override);
  return Object.keys(probe).length > 1;
}

function overriddenStrategy(override: Record<string, unknown> | null): string | null {
  if (!override) return null;
  const section = isRecord(override.recommendation) ? override.recommendation : null;
  const strategy = section?.strategy ?? override.strategy;
  return typeof strategy === 'string' && strategy.trim() ? strategy : null;
}

/**
 * An arm's module as a strip summary. The API sends it through the presenter
 * `/recommendations` uses (`presentRecommendationWidget`); a `{ targetType,
 * data }` wrapper is unwrapped, as the browser widget does. `onlyId` keeps a
 * module that is not the strip asked about from describing it.
 */
function moduleSummary(
  raw: unknown,
  fallbackId: string | undefined,
  onlyId?: string
): RecommendationWidgetSummary | null {
  const wrapped = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;
  if (!isRecord(wrapped)) return null;
  const id = typeof wrapped.id === 'string' && wrapped.id ? wrapped.id : fallbackId;
  if (!id || (onlyId !== undefined && id !== onlyId)) return null;
  return { ...wrapped, id } as RecommendationWidgetSummary;
}

function experimentOf(assignment: ExperimentAssignment | null): RecommendationArm['experiment'] {
  return assignment ? { experimentId: assignment.experimentId, variantId: assignment.variantId } : null;
}

/** The API's flag on the arm, else the drawn strip's own (`eligibilityFlags.liveCartRequired`). */
function liveCart(
  assignment: ExperimentAssignment | null,
  widget: RecommendationWidgetSummary | null
): { liveCartRequired?: boolean } {
  if (assignment?.liveCartRequired === true) return { liveCartRequired: true };
  const flags = widget && isRecord(widget.eligibilityFlags) ? widget.eligibilityFlags : null;
  return typeof flags?.liveCartRequired === 'boolean' ? { liveCartRequired: flags.liveCartRequired } : {};
}
