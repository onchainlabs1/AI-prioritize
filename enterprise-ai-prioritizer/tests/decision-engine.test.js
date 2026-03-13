import test from "node:test";
import assert from "node:assert/strict";

import {
  CRITERIA,
  DEFAULT_CONFIG,
  applyWeightOverrides,
  clampScore,
  classify,
  getGateStatus,
  getScores,
  mergeWithDefaultConfig,
  normalizeCriteriaWeights,
  sanitizeEvidenceLevel,
  sanitizeWeight,
  useCaseHint,
} from "../decision-engine.js";

test("clampScore bounds values into 1..5", () => {
  assert.equal(clampScore(-3), 1);
  assert.equal(clampScore(0), 1);
  assert.equal(clampScore(2), 2);
  assert.equal(clampScore(5), 5);
  assert.equal(clampScore(9), 5);
  assert.equal(clampScore("not-a-number"), 1);
});

test("sanitizeWeight keeps non-negative numeric values only", () => {
  assert.equal(sanitizeWeight(10), 10);
  assert.equal(sanitizeWeight(-4), 0);
  assert.equal(sanitizeWeight("x"), 0);
});

test("sanitizeEvidenceLevel returns partial fallback", () => {
  assert.equal(sanitizeEvidenceLevel("assumed"), "assumed");
  assert.equal(sanitizeEvidenceLevel("validated"), "validated");
  assert.equal(sanitizeEvidenceLevel("unknown"), "partial");
});

test("mergeWithDefaultConfig enforces threshold consistency", () => {
  const merged = mergeWithDefaultConfig({
    thresholds: { tierA: 70, tierB: 90 },
  });
  assert.equal(merged.thresholds.tierA, 70);
  assert.equal(merged.thresholds.tierB, 70);
});

test("mergeWithDefaultConfig accepts stage and region policy overrides", () => {
  const merged = mergeWithDefaultConfig({
    stage0Policies: {
      agentic: {
        thresholdDelta: 9,
        maxTier: "C",
        minGateStates: {
          security: "pass",
          economics: "conditional",
        },
      },
    },
    regionPolicies: {
      eu: {
        thresholdDelta: 5,
        maxTier: "B",
        minGateStates: {
          regulatory: "pass",
          data: "conditional",
        },
      },
    },
  });

  assert.equal(merged.stage0Policies.agentic.thresholdDelta, 9);
  assert.equal(merged.stage0Policies.agentic.maxTier, "C");
  assert.equal(merged.stage0Policies.agentic.minGateStates.security, "pass");
  assert.equal(merged.stage0Policies.agentic.minGateStates.economics, "conditional");
  assert.equal(merged.regionPolicies.eu.thresholdDelta, 5);
  assert.equal(merged.regionPolicies.eu.maxTier, "B");
  assert.equal(merged.regionPolicies.eu.minGateStates.regulatory, "pass");
  assert.equal(merged.regionPolicies.eu.minGateStates.data, "conditional");
});

test("getGateStatus supports pass/conditional/fail", () => {
  const result = getGateStatus(
    {
      regulatory: "pass",
      security: "conditional",
      data: "fail",
      economics: "conditional",
    },
    DEFAULT_CONFIG
  );

  assert.equal(result.ok, false);
  assert.equal(result.failCount, 1);
  assert.equal(result.conditionalCount, 2);
  assert.deepEqual(result.failed, ["Data governance readiness"]);
  assert.equal(result.penalty, DEFAULT_CONFIG.gates.conditionalPenalty * 2);
});

test("getScores returns 100 when all criteria are 5 and evidence is validated", () => {
  const scoreInput = Object.fromEntries(CRITERIA.map((c) => [c.key, 5]));
  const evidenceInput = Object.fromEntries(CRITERIA.map((c) => [c.key, "validated"]));
  const result = getScores(scoreInput, CRITERIA, evidenceInput, DEFAULT_CONFIG);

  assert.equal(result.total, 100);
  assert.equal(result.details.length, CRITERIA.length);
});

test("getScores applies evidence multiplier penalties", () => {
  const scoreInput = Object.fromEntries(CRITERIA.map((c) => [c.key, 5]));
  const evidenceInput = Object.fromEntries(CRITERIA.map((c) => [c.key, "assumed"]));
  const result = getScores(scoreInput, CRITERIA, evidenceInput, DEFAULT_CONFIG);

  assert.equal(result.total, 80);
});

test("applyWeightOverrides and normalizeCriteriaWeights preserve 100% effective total", () => {
  const custom = applyWeightOverrides(CRITERIA, {
    businessImpact: 80,
    strategicAlignment: 20,
    timeToValue: 0,
    platformLeverage: 0,
    readiness: 0,
    unitEconomics: 0,
    operatingReadiness: 0,
    residualRisk: 0,
  });
  const result = normalizeCriteriaWeights(custom);
  const effectiveTotal = result.normalized.reduce((sum, c) => sum + c.weight, 0);

  assert.equal(result.rawTotal, 100);
  assert.ok(Math.abs(effectiveTotal - 100) < 0.0001);
});

test("classify returns NO-GO when stage 0 says not suitable", () => {
  const gateStatus = getGateStatus(
    { regulatory: "pass", security: "pass", data: "pass", economics: "pass" },
    DEFAULT_CONFIG
  );
  const result = classify(95, gateStatus, "not_suitable", DEFAULT_CONFIG);

  assert.equal(result.tier, "NO-GO");
  assert.match(result.lane, /Reframe/i);
});

test("classify returns NO-GO when any gate fails", () => {
  const gateStatus = getGateStatus(
    { regulatory: "fail", security: "pass", data: "pass", economics: "pass" },
    DEFAULT_CONFIG
  );
  const result = classify(95, gateStatus, "genai_rag", DEFAULT_CONFIG);

  assert.equal(result.tier, "NO-GO");
  assert.equal(result.adjustedScore, null);
  assert.equal(result.blocked, true);
  assert.equal(result.diagnosticScore, 95);
});

test("classify caps tier when conditional gates exist", () => {
  const gateStatus = getGateStatus(
    { regulatory: "conditional", security: "pass", data: "pass", economics: "pass" },
    DEFAULT_CONFIG
  );
  const result = classify(95, gateStatus, "genai_rag", DEFAULT_CONFIG);

  assert.equal(result.tier, "B");
});

test("classify threshold mapping still supports A/B/C", () => {
  const gateStatus = getGateStatus(
    { regulatory: "pass", security: "pass", data: "pass", economics: "pass" },
    DEFAULT_CONFIG
  );
  assert.equal(classify(75, gateStatus, "genai_rag", DEFAULT_CONFIG).tier, "A");
  assert.equal(classify(60, gateStatus, "genai_rag", DEFAULT_CONFIG).tier, "B");
  assert.equal(classify(59.9, gateStatus, "genai_rag", DEFAULT_CONFIG).tier, "C");
});

test("classify applies stage-specific caps for agentic route", () => {
  const gateStatus = getGateStatus(
    { regulatory: "pass", security: "pass", data: "pass", economics: "pass" },
    DEFAULT_CONFIG
  );
  const result = classify(99, gateStatus, "agentic", DEFAULT_CONFIG, { region: "us" });

  assert.equal(result.tier, "B");
  assert.equal(result.blocked, false);
});

test("classify enforces regional gate policy requirements", () => {
  const gateStatus = getGateStatus(
    { regulatory: "conditional", security: "pass", data: "pass", economics: "pass" },
    DEFAULT_CONFIG
  );
  const result = classify(95, gateStatus, "genai_rag", DEFAULT_CONFIG, { region: "eu" });

  assert.equal(result.tier, "NO-GO");
  assert.equal(result.blocked, true);
  assert.equal(result.adjustedScore, null);
  assert.equal(result.diagnosticScore, 87);
});

test("classify applies region threshold deltas", () => {
  const gateStatus = getGateStatus(
    { regulatory: "pass", security: "pass", data: "pass", economics: "pass" },
    DEFAULT_CONFIG
  );
  const baseline = classify(78, gateStatus, "genai_rag", DEFAULT_CONFIG, { region: "us" });
  const euUs = classify(78, gateStatus, "genai_rag", DEFAULT_CONFIG, { region: "eu-us" });

  assert.equal(baseline.tier, "A");
  assert.equal(euUs.tier, "B");
});

test("getScores derives confidence from evidence multipliers", () => {
  const scoreInput = Object.fromEntries(CRITERIA.map((c) => [c.key, 5]));
  const evidenceInput = Object.fromEntries(CRITERIA.map((c) => [c.key, "assumed"]));
  const config = mergeWithDefaultConfig({
    evidenceMultipliers: {
      assumed: 1.0,
      partial: 1.5,
      validated: 2.0,
    },
  });
  const result = getScores(scoreInput, CRITERIA, evidenceInput, config);

  assert.equal(result.confidenceIndex, 50);
});

test("useCaseHint returns specific and fallback guidance", () => {
  assert.match(useCaseHint("assistant"), /classic RAG/i);
  assert.match(useCaseHint("unknown_case"), /reference architecture/i);
});
