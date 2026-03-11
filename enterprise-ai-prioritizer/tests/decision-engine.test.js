import test from "node:test";
import assert from "node:assert/strict";

import {
  CRITERIA,
  clampScore,
  classify,
  getGateStatus,
  getScores,
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

test("getGateStatus returns OK when all gates pass", () => {
  const result = getGateStatus({
    regulatory: true,
    security: true,
    data: true,
    economics: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failed, []);
});

test("getGateStatus reports failed gates in deterministic order", () => {
  const result = getGateStatus({
    regulatory: false,
    security: true,
    data: false,
    economics: false,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failed, [
    "Regulatory risk classification",
    "Data governance",
    "KPI + baseline + economics",
  ]);
});

test("getScores returns 100 when all criteria are 5", () => {
  const scoreInput = Object.fromEntries(CRITERIA.map((c) => [c.key, 5]));
  const result = getScores(scoreInput);

  assert.equal(result.total, 100);
  assert.equal(result.details.length, CRITERIA.length);
});

test("getScores returns 20 when all criteria are 1", () => {
  const scoreInput = Object.fromEntries(CRITERIA.map((c) => [c.key, 1]));
  const result = getScores(scoreInput);

  assert.equal(result.total, 20);
});

test("getScores clamps invalid and out-of-range values", () => {
  const result = getScores({
    businessImpact: 5,
    timeToValue: 10,
    platformLeverage: 0,
    readiness: "x",
    unitEconomics: 3,
    adoption: 4,
    residualRisk: -2,
  });

  const detailByLabel = Object.fromEntries(result.details.map((d) => [d.label, d]));
  assert.equal(detailByLabel["Time-to-value"].score, 5);
  assert.equal(detailByLabel["Platform leverage and reuse"].score, 1);
  assert.equal(detailByLabel["Technical and data readiness"].score, 1);
  assert.equal(detailByLabel["Residual risk (after controls)"].score, 1);
});

test("classify returns NO-GO when gates fail", () => {
  const result = classify(95, false);
  assert.equal(result.tier, "NO-GO");
  assert.equal(result.lane, "Do not prioritize now");
});

test("classify threshold mapping is correct", () => {
  assert.equal(classify(75, true).tier, "A");
  assert.equal(classify(74.9, true).tier, "B");
  assert.equal(classify(60, true).tier, "B");
  assert.equal(classify(59.9, true).tier, "C");
});

test("useCaseHint returns specific and fallback guidance", () => {
  assert.match(useCaseHint("assistant"), /classic RAG/i);
  assert.match(useCaseHint("unknown_case"), /reference architecture/i);
});
