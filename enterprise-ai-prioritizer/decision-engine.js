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
const GATE_STATE_RANK = { fail: 0, conditional: 1, pass: 2 };

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
  stage0Policies: {
    genai_rag: {
      thresholdDelta: 0,
      maxTier: "A",
      minGateStates: {
        security: "conditional",
        data: "conditional",
      },
    },
    agentic: {
      thresholdDelta: 7,
      maxTier: "B",
      minGateStates: {
        regulatory: "pass",
        security: "pass",
        data: "pass",
        economics: "conditional",
      },
    },
    classical_ml: {
      thresholdDelta: 3,
      maxTier: "A",
      minGateStates: {
        regulatory: "conditional",
        data: "pass",
      },
    },
    deterministic: {
      thresholdDelta: -2,
      maxTier: "A",
      minGateStates: {
        security: "conditional",
        economics: "conditional",
      },
    },
  },
  regionPolicies: {
    "eu-us": {
      thresholdDelta: 4,
      maxTier: "A",
      minGateStates: {
        regulatory: "pass",
        security: "pass",
      },
    },
    eu: {
      thresholdDelta: 3,
      maxTier: "A",
      minGateStates: {
        regulatory: "pass",
        data: "conditional",
      },
    },
    us: {
      thresholdDelta: 1,
      maxTier: "A",
      minGateStates: {
        security: "pass",
      },
    },
    global: {
      thresholdDelta: 6,
      maxTier: "B",
      minGateStates: {
        regulatory: "pass",
        security: "pass",
        data: "pass",
      },
    },
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

function sanitizeOptionalTier(raw, fallback) {
  if (raw == null) {
    return null;
  }
  return sanitizeTier(raw, fallback);
}

function sanitizeMultiplier(raw, fallback) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function sanitizeThresholdDelta(raw, fallback) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(30, Math.max(-30, parsed));
}

function sanitizePolicy(policyInput, fallbackPolicy) {
  const fallback = fallbackPolicy || { thresholdDelta: 0, maxTier: null, minGateStates: {} };
  const source = policyInput && typeof policyInput === "object" ? policyInput : {};
  const minGateStates = {};

  GATES.forEach((gate) => {
    const fallbackState = fallback.minGateStates?.[gate.key];
    const rawState = source.minGateStates?.[gate.key];
    const chosen =
      rawState === "pass" || rawState === "conditional" || rawState === "fail"
        ? rawState
        : normalizeGateState(fallbackState ?? "fail");
    if (chosen !== "fail") {
      minGateStates[gate.key] = chosen;
    }
  });

  return {
    thresholdDelta: sanitizeThresholdDelta(source.thresholdDelta, fallback.thresholdDelta || 0),
    maxTier: sanitizeOptionalTier(source.maxTier, fallback.maxTier || null),
    minGateStates,
  };
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

  if (input.stage0Policies && typeof input.stage0Policies === "object") {
    Object.keys(DEFAULT_CONFIG.stage0Policies).forEach((key) => {
      merged.stage0Policies[key] = sanitizePolicy(
        input.stage0Policies[key],
        DEFAULT_CONFIG.stage0Policies[key]
      );
    });
  } else {
    Object.keys(DEFAULT_CONFIG.stage0Policies).forEach((key) => {
      merged.stage0Policies[key] = sanitizePolicy(
        DEFAULT_CONFIG.stage0Policies[key],
        DEFAULT_CONFIG.stage0Policies[key]
      );
    });
  }

  if (input.regionPolicies && typeof input.regionPolicies === "object") {
    Object.keys(DEFAULT_CONFIG.regionPolicies).forEach((key) => {
      merged.regionPolicies[key] = sanitizePolicy(
        input.regionPolicies[key],
        DEFAULT_CONFIG.regionPolicies[key]
      );
    });
  } else {
    Object.keys(DEFAULT_CONFIG.regionPolicies).forEach((key) => {
      merged.regionPolicies[key] = sanitizePolicy(
        DEFAULT_CONFIG.regionPolicies[key],
        DEFAULT_CONFIG.regionPolicies[key]
      );
    });
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

function gateStateRank(state) {
  return GATE_STATE_RANK[normalizeGateState(state)] ?? 0;
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

function resolvePolicy(policyMap, key) {
  if (key && Object.prototype.hasOwnProperty.call(policyMap, key)) {
    return policyMap[key];
  }
  return { thresholdDelta: 0, maxTier: null, minGateStates: {} };
}

function mergeRequiredGateStates(...sources) {
  const merged = {};
  GATES.forEach((gate) => {
    let requiredRank = 0;
    sources.forEach((source) => {
      const state = source?.[gate.key];
      if (state) {
        requiredRank = Math.max(requiredRank, gateStateRank(state));
      }
    });
    if (requiredRank > 0) {
      merged[gate.key] = requiredRank >= 2 ? "pass" : "conditional";
    }
  });
  return merged;
}

function evaluatePolicyGateViolations(gateStatus, requiredGateStates) {
  const byKey = new Map((gateStatus.details || []).map((detail) => [detail.key, detail]));
  const violations = [];
  Object.entries(requiredGateStates).forEach(([gateKey, requiredState]) => {
    const detail = byKey.get(gateKey);
    const actualState = normalizeGateState(detail?.state);
    if (gateStateRank(actualState) < gateStateRank(requiredState)) {
      const gate = GATES.find((item) => item.key === gateKey);
      violations.push({
        key: gateKey,
        label: gate?.label || gateKey,
        requiredState,
        actualState,
      });
    }
  });
  return violations;
}

function applyThresholdDelta(thresholds, delta) {
  const tierA = Math.min(100, Math.max(0, thresholds.tierA + delta));
  const tierB = Math.min(100, Math.max(0, thresholds.tierB + delta));
  return {
    tierA,
    tierB: Math.min(tierA, tierB),
  };
}

export function classify(baseScore, gateStatus, stage0Choice, config = DEFAULT_CONFIG, context = {}) {
  const cleanConfig = mergeWithDefaultConfig(config);
  const diagnosticScore = Math.max(0, Math.round((baseScore - gateStatus.penalty) * 10) / 10);

  if (stage0Choice === "not_suitable") {
    return {
      tier: "NO-GO",
      lane: "Reframe / process redesign",
      css: "bad",
      rationale: "Stage 0 indicates this initiative is not suitable for AI in its current form.",
      adjustedScore: null,
      diagnosticScore,
      blocked: true,
    };
  }

  if (gateStatus.failCount > 0) {
    return {
      tier: "NO-GO",
      lane: "Do not prioritize now",
      css: "bad",
      rationale: "One or more mandatory gates failed.",
      adjustedScore: null,
      diagnosticScore,
      blocked: true,
    };
  }

  const stagePolicy = resolvePolicy(cleanConfig.stage0Policies, stage0Choice);
  const regionPolicy = resolvePolicy(cleanConfig.regionPolicies, context?.region);
  const requiredGateStates = mergeRequiredGateStates(
    stagePolicy.minGateStates,
    regionPolicy.minGateStates
  );
  const policyViolations = evaluatePolicyGateViolations(gateStatus, requiredGateStates);
  if (policyViolations.length > 0) {
    const labels = policyViolations.map((item) => item.label).join(", ");
    return {
      tier: "NO-GO",
      lane: "Do not prioritize now",
      css: "bad",
      rationale: `Policy baseline was not met for: ${labels}.`,
      adjustedScore: null,
      diagnosticScore,
      blocked: true,
    };
  }

  const delta = stagePolicy.thresholdDelta + regionPolicy.thresholdDelta;
  const effectiveThresholds = applyThresholdDelta(cleanConfig.thresholds, delta);
  let tier = tierFromScore(diagnosticScore, effectiveThresholds);
  let conditionalCapApplied = false;
  let stageCapApplied = false;
  let regionCapApplied = false;

  if (gateStatus.conditionalCount > 0) {
    const capped = capTier(tier, cleanConfig.gates.maxTierIfConditional);
    conditionalCapApplied = capped !== tier;
    tier = capped;
  }
  {
    const capped = capTier(tier, stagePolicy.maxTier);
    stageCapApplied = capped !== tier;
    tier = capped;
  }
  {
    const capped = capTier(tier, regionPolicy.maxTier);
    regionCapApplied = capped !== tier;
    tier = capped;
  }

  const meta = tierMeta(tier);
  const rationaleParts = [];
  if (conditionalCapApplied) {
    rationaleParts.push(`Conditional gates impose a penalty of ${gateStatus.penalty} points.`);
  }
  if (delta !== 0) {
    rationaleParts.push(`Policy threshold delta applied: ${delta > 0 ? "+" : ""}${delta}.`);
  }
  if (stageCapApplied && stagePolicy.maxTier) {
    rationaleParts.push(`Stage 0 cap applied at Tier ${stagePolicy.maxTier}.`);
  }
  if (regionCapApplied && regionPolicy.maxTier) {
    rationaleParts.push(`Region cap applied at Tier ${regionPolicy.maxTier}.`);
  }

  return {
    tier,
    lane: meta.lane,
    css: meta.css,
    rationale: `Decision based on weighted value, feasibility, and risk scoring${rationaleParts.length ? ` ${rationaleParts.join(" ")}` : "."}`,
    adjustedScore: diagnosticScore,
    diagnosticScore,
    blocked: false,
  };
}

export function getScores(scoreInput, criteria = CRITERIA, evidenceInput = {}, config = DEFAULT_CONFIG) {
  const cleanConfig = mergeWithDefaultConfig(config);
  const { normalized, rawTotal } = normalizeCriteriaWeights(criteria);
  const maxEvidenceMultiplier = Math.max(
    cleanConfig.evidenceMultipliers.assumed,
    cleanConfig.evidenceMultipliers.partial,
    cleanConfig.evidenceMultipliers.validated,
    Number.EPSILON
  );

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
    confidenceAccumulator += (multiplier / maxEvidenceMultiplier) * criterion.weight;
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
