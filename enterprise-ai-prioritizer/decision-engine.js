export const CRITERIA = [
  {
    key: "businessImpact",
    label: "Business impact",
    weight: 20,
    help: "Revenue uplift, cost reduction, risk avoided",
  },
  {
    key: "strategicAlignment",
    label: "Strategic alignment and business ownership",
    weight: 15,
    help: "Executive sponsorship, clear owner, and OKR fit",
  },
  {
    key: "timeToValue",
    label: "Time-to-value and urgency",
    weight: 10,
    help: "Speed to value and urgency window",
  },
  {
    key: "platformLeverage",
    label: "Platform leverage and reuse",
    weight: 10,
    help: "Cross-business-unit reuse and standardization",
  },
  {
    key: "readiness",
    label: "Technical and data feasibility",
    weight: 15,
    help: "Integrations, data quality, and delivery feasibility",
  },
  {
    key: "unitEconomics",
    label: "ROI and unit economics",
    weight: 15,
    help: "Cost per transaction/token and payback",
  },
  {
    key: "operatingReadiness",
    label: "Operating model readiness",
    weight: 10,
    help: "Ownership, approvals, monitoring, and incident response",
  },
  {
    key: "residualRisk",
    label: "Residual risk (after controls)",
    weight: 5,
    help: "5 = low residual risk after mitigation",
  },
];

export const GATES = [
  { key: "regulatory", label: "Regulatory risk classification" },
  { key: "security", label: "Security threat model" },
  { key: "data", label: "Data governance readiness" },
  { key: "economics", label: "KPI baseline and unit economics definition" },
];

export const EVIDENCE_LEVELS = ["assumed", "partial", "validated"];

export const DEFAULT_CONFIG = {
  weights: Object.fromEntries(CRITERIA.map((c) => [c.key, c.weight])),
  thresholds: {
    tierA: 75,
    tierB: 60,
  },
  gates: {
    conditionalPenalty: 8,
    maxTierIfConditional: "B",
  },
  evidenceMultipliers: {
    assumed: 0.8,
    partial: 0.9,
    validated: 1.0,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clampScore(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(5, Math.max(1, parsed));
}

export function sanitizeWeight(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, parsed);
}

export function sanitizeEvidenceLevel(level) {
  if (EVIDENCE_LEVELS.includes(level)) {
    return level;
  }
  return "partial";
}

function clampPercent(raw, fallback) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, parsed));
}

function sanitizeTier(raw, fallback) {
  if (raw === "A" || raw === "B" || raw === "C") {
    return raw;
  }
  return fallback;
}

function sanitizeMultiplier(raw, fallback) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function mergeWithDefaultConfig(input = {}) {
  const merged = clone(DEFAULT_CONFIG);

  if (input.weights && typeof input.weights === "object") {
    CRITERIA.forEach((criterion) => {
      if (Object.prototype.hasOwnProperty.call(input.weights, criterion.key)) {
        merged.weights[criterion.key] = sanitizeWeight(input.weights[criterion.key]);
      }
    });
  }

  if (input.thresholds && typeof input.thresholds === "object") {
    merged.thresholds.tierA = clampPercent(input.thresholds.tierA, DEFAULT_CONFIG.thresholds.tierA);
    merged.thresholds.tierB = clampPercent(input.thresholds.tierB, DEFAULT_CONFIG.thresholds.tierB);
  }
  if (merged.thresholds.tierB > merged.thresholds.tierA) {
    merged.thresholds.tierB = merged.thresholds.tierA;
  }

  if (input.gates && typeof input.gates === "object") {
    merged.gates.conditionalPenalty = Math.max(
      0,
      Number.isFinite(Number(input.gates.conditionalPenalty))
        ? Number(input.gates.conditionalPenalty)
        : DEFAULT_CONFIG.gates.conditionalPenalty
    );
    merged.gates.maxTierIfConditional = sanitizeTier(
      input.gates.maxTierIfConditional,
      DEFAULT_CONFIG.gates.maxTierIfConditional
    );
  }

  if (input.evidenceMultipliers && typeof input.evidenceMultipliers === "object") {
    merged.evidenceMultipliers.assumed = sanitizeMultiplier(
      input.evidenceMultipliers.assumed,
      DEFAULT_CONFIG.evidenceMultipliers.assumed
    );
    merged.evidenceMultipliers.partial = sanitizeMultiplier(
      input.evidenceMultipliers.partial,
      DEFAULT_CONFIG.evidenceMultipliers.partial
    );
    merged.evidenceMultipliers.validated = sanitizeMultiplier(
      input.evidenceMultipliers.validated,
      DEFAULT_CONFIG.evidenceMultipliers.validated
    );
  }

  return merged;
}

export function applyWeightOverrides(criteria, weightInput = {}) {
  return criteria.map((criterion) => ({
    ...criterion,
    weight: sanitizeWeight(
      Object.prototype.hasOwnProperty.call(weightInput, criterion.key)
        ? weightInput[criterion.key]
        : criterion.weight
    ),
  }));
}

export function normalizeCriteriaWeights(criteria) {
  const total = criteria.reduce((sum, criterion) => sum + sanitizeWeight(criterion.weight), 0);

  if (total <= 0) {
    const equalWeight = 100 / criteria.length;
    return {
      normalized: criteria.map((criterion) => ({ ...criterion, weight: equalWeight })),
      rawTotal: total,
    };
  }

  return {
    normalized: criteria.map((criterion) => ({
      ...criterion,
      weight: (sanitizeWeight(criterion.weight) / total) * 100,
    })),
    rawTotal: total,
  };
}

function normalizeGateState(raw) {
  if (raw === "pass" || raw === "conditional" || raw === "fail") {
    return raw;
  }
  return "fail";
}

export function getGateStatus(gateInput, config = DEFAULT_CONFIG) {
  const cleanConfig = mergeWithDefaultConfig(config);
  const failed = [];
  const conditional = [];
  const details = [];

  GATES.forEach((gate) => {
    const state = normalizeGateState(gateInput?.[gate.key]);
    details.push({ key: gate.key, label: gate.label, state });
    if (state === "fail") {
      failed.push(gate.label);
    } else if (state === "conditional") {
      conditional.push(gate.label);
    }
  });

  const failCount = failed.length;
  const conditionalCount = conditional.length;
  const penalty = conditionalCount * cleanConfig.gates.conditionalPenalty;

  return {
    ok: failCount === 0,
    failed,
    conditional,
    failCount,
    conditionalCount,
    penalty: Math.round(penalty * 10) / 10,
    details,
  };
}

function tierRank(tier) {
  const map = { A: 3, B: 2, C: 1 };
  return map[tier] || 0;
}

function capTier(tier, cap) {
  if (!cap) {
    return tier;
  }
  return tierRank(tier) > tierRank(cap) ? cap : tier;
}

function tierFromScore(score, thresholds) {
  if (score >= thresholds.tierA) {
    return "A";
  }
  if (score >= thresholds.tierB) {
    return "B";
  }
  return "C";
}

function tierMeta(tier) {
  if (tier === "A") {
    return {
      lane: "Prioritize now",
      css: "good",
    };
  }
  if (tier === "B") {
    return {
      lane: "Plan next",
      css: "warn",
    };
  }
  return {
    lane: "Incubate / discovery",
    css: "bad",
  };
}

export function classify(baseScore, gateStatus, stage0Choice, config = DEFAULT_CONFIG) {
  const cleanConfig = mergeWithDefaultConfig(config);

  if (stage0Choice === "not_suitable") {
    return {
      tier: "NO-GO",
      lane: "Reframe / process redesign",
      css: "bad",
      rationale: "Stage 0 indicates this initiative is not suitable for AI in its current form.",
      adjustedScore: 0,
    };
  }

  if (gateStatus.failCount > 0) {
    return {
      tier: "NO-GO",
      lane: "Do not prioritize now",
      css: "bad",
      rationale: "One or more mandatory gates failed.",
      adjustedScore: Math.max(0, Math.round((baseScore - gateStatus.penalty) * 10) / 10),
    };
  }

  const adjustedScore = Math.max(0, Math.round((baseScore - gateStatus.penalty) * 10) / 10);
  let tier = tierFromScore(adjustedScore, cleanConfig.thresholds);

  if (gateStatus.conditionalCount > 0) {
    tier = capTier(tier, cleanConfig.gates.maxTierIfConditional);
  }

  const meta = tierMeta(tier);
  const rationaleSuffix =
    gateStatus.conditionalCount > 0
      ? ` Conditional gates impose a penalty of ${gateStatus.penalty} points.`
      : "";

  return {
    tier,
    lane: meta.lane,
    css: meta.css,
    rationale: `Decision based on weighted value, feasibility, and risk scoring.${rationaleSuffix}`,
    adjustedScore,
  };
}

export function getScores(scoreInput, criteria = CRITERIA, evidenceInput = {}, config = DEFAULT_CONFIG) {
  const cleanConfig = mergeWithDefaultConfig(config);
  const { normalized, rawTotal } = normalizeCriteriaWeights(criteria);

  const confidenceScale = {
    assumed: 0.4,
    partial: 0.7,
    validated: 1.0,
  };

  let weighted = 0;
  let confidenceAccumulator = 0;
  const details = [];
  const evidenceCounts = {
    assumed: 0,
    partial: 0,
    validated: 0,
  };

  normalized.forEach((criterion) => {
    const score = clampScore(scoreInput?.[criterion.key]);
    const evidence = sanitizeEvidenceLevel(evidenceInput?.[criterion.key]);
    const multiplier = cleanConfig.evidenceMultipliers[evidence];
    const contribution = (score / 5) * criterion.weight * multiplier;
    weighted += contribution;
    confidenceAccumulator += confidenceScale[evidence] * criterion.weight;
    evidenceCounts[evidence] += 1;

    details.push({
      key: criterion.key,
      label: criterion.label,
      score,
      evidence,
      multiplier: Math.round(multiplier * 100) / 100,
      weight: Math.round(criterion.weight * 10) / 10,
      contribution: Math.round(contribution * 10) / 10,
    });
  });

  const total = Math.min(100, Math.round(weighted * 10) / 10);
  const confidenceIndex = Math.round(confidenceAccumulator * 10) / 10;

  return {
    total,
    details,
    rawWeightTotal: Math.round(rawTotal * 10) / 10,
    confidenceIndex,
    evidenceCounts,
  };
}

export function useCaseHint(useCaseType) {
  const hints = {
    assistant: "Start with classic RAG plus prompt and data guardrails.",
    customer_support: "Require human fallback and first-contact resolution tracking.",
    automation: "Prioritize high-volume, low-variability processes.",
    analytics: "Require a statistical baseline and out-of-sample validation.",
    risk: "Include early compliance approval and traceable audit evidence.",
  };

  return hints[useCaseType] || "Define a reference architecture with minimum controls.";
}
