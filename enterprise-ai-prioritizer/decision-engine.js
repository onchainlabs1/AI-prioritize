export const CRITERIA = [
  {
    key: "businessImpact",
    label: "Business impact",
    weight: 25,
    help: "Revenue uplift, cost reduction, risk avoided",
  },
  {
    key: "timeToValue",
    label: "Time-to-value",
    weight: 15,
    help: "Speed to deliver value in production",
  },
  {
    key: "platformLeverage",
    label: "Platform leverage and reuse",
    weight: 15,
    help: "Cross-business-unit reuse",
  },
  {
    key: "readiness",
    label: "Technical and data readiness",
    weight: 15,
    help: "Integrations, data quality, ownership",
  },
  {
    key: "unitEconomics",
    label: "Unit economics",
    weight: 15,
    help: "Cost per transaction/token and payback",
  },
  {
    key: "adoption",
    label: "Adoption and change readiness",
    weight: 10,
    help: "Workflow adoption and sponsorship",
  },
  {
    key: "residualRisk",
    label: "Residual risk (after controls)",
    weight: 5,
    help: "5 = low residual risk",
  },
];

const GATES = [
  { key: "regulatory", label: "Regulatory risk classification" },
  { key: "security", label: "Security threat model" },
  { key: "data", label: "Data governance" },
  { key: "economics", label: "KPI + baseline + economics" },
];

export function clampScore(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(5, Math.max(1, parsed));
}

export function getGateStatus(gateInput) {
  const failed = GATES.filter((g) => !gateInput?.[g.key]).map((g) => g.label);
  return { ok: failed.length === 0, failed };
}

export function getScores(scoreInput) {
  let weighted = 0;
  const details = [];

  CRITERIA.forEach((criterion) => {
    const score = clampScore(scoreInput?.[criterion.key]);
    weighted += (score / 5) * criterion.weight;
    details.push({ label: criterion.label, score, weight: criterion.weight });
  });

  return { total: Math.round(weighted * 10) / 10, details };
}

export function classify(score, gateOk) {
  if (!gateOk) {
    return {
      tier: "NO-GO",
      lane: "Do not prioritize now",
      css: "bad",
      rationale: "One or more mandatory gates failed.",
    };
  }

  if (score >= 75) {
    return {
      tier: "A",
      lane: "Prioritize now",
      css: "good",
      rationale: "Strong likelihood of value and execution in the current cycle.",
    };
  }

  if (score >= 60) {
    return {
      tier: "B",
      lane: "Guided discovery",
      css: "warn",
      rationale: "Needs uncertainty reduction before scaling.",
    };
  }

  return {
    tier: "C",
    lane: "Backlog / reassess",
    css: "bad",
    rationale: "Low value-risk-readiness ratio at this time.",
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
