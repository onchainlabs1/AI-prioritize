import {
  CRITERIA,
  GATES,
  applyWeightOverrides,
  mergeWithDefaultConfig,
  normalizeCriteriaWeights,
  sanitizeWeight,
} from "./decision-engine.js";
import { getDefaultConfig, loadConfig, resetConfig, saveConfig } from "./settings.js";

const STAGE0_POLICY_LABELS = {
  genai_rag: "GenAI / RAG",
  agentic: "Agentic",
  classical_ml: "Classical ML",
  deterministic: "Deterministic automation",
};

const REGION_POLICY_LABELS = {
  "eu-us": "EU + US",
  eu: "EU",
  us: "US",
  global: "Global",
};

const el = {
  criteriaContainer: document.getElementById("configCriteriaContainer"),
  stage0PolicyContainer: document.getElementById("stage0PolicyContainer"),
  regionPolicyContainer: document.getElementById("regionPolicyContainer"),
  configWeightTotal: document.getElementById("configWeightTotal"),
  thresholdTierA: document.getElementById("thresholdTierA"),
  thresholdTierB: document.getElementById("thresholdTierB"),
  conditionalPenalty: document.getElementById("conditionalPenalty"),
  maxTierIfConditional: document.getElementById("maxTierIfConditional"),
  evidenceAssumed: document.getElementById("evidenceAssumed"),
  evidencePartial: document.getElementById("evidencePartial"),
  evidenceValidated: document.getElementById("evidenceValidated"),
  saveConfigButton: document.getElementById("saveConfigButton"),
  resetConfigButton: document.getElementById("resetConfigButton"),
  configStatus: document.getElementById("configStatus"),
  configPreview: document.getElementById("configPreview"),
};

function weightInputId(key) {
  return `cfgWeight_${key}`;
}

function policyDeltaId(scope, key) {
  return `cfg_${scope}_${key}_delta`;
}

function policyMaxTierId(scope, key) {
  return `cfg_${scope}_${key}_maxTier`;
}

function policyGateId(scope, policyKey, gateKey) {
  return `cfg_${scope}_${policyKey}_gate_${gateKey}`;
}

function renderCriteria(config) {
  const fragment = document.createDocumentFragment();
  CRITERIA.forEach((criterion) => {
    const row = document.createElement("div");
    row.className = "criterion config-criterion";
    row.innerHTML = `
      <div>
        <strong>${criterion.label}</strong>
        <div class="weight">${criterion.help}</div>
      </div>
      <label>
        Default Weight %
        <input id="${weightInputId(criterion.key)}" type="number" min="0" max="100" step="0.1" value="${config.weights[criterion.key]}" />
      </label>
    `;
    fragment.appendChild(row);
  });
  el.criteriaContainer.appendChild(fragment);
}

function renderPolicyCards(container, scope, labels, configPolicies) {
  const fragment = document.createDocumentFragment();
  Object.entries(labels).forEach(([key, label]) => {
    const policy = configPolicies[key];
    const card = document.createElement("section");
    card.className = "policy-card";
    const gateControls = GATES.map(
      (gate) => `
        <label>
          ${gate.label}
          <select id="${policyGateId(scope, key, gate.key)}">
            <option value="fail"${!policy.minGateStates[gate.key] ? " selected" : ""}>No minimum</option>
            <option value="conditional"${policy.minGateStates[gate.key] === "conditional" ? " selected" : ""}>Conditional</option>
            <option value="pass"${policy.minGateStates[gate.key] === "pass" ? " selected" : ""}>Pass</option>
          </select>
        </label>
      `
    ).join("");

    card.innerHTML = `
      <div class="policy-card-head">
        <h3>${label}</h3>
        <span class="tag">Policy</span>
      </div>
      <div class="grid two">
        <label>
          Threshold delta
          <input id="${policyDeltaId(scope, key)}" type="number" min="-30" max="30" step="1" value="${policy.thresholdDelta}" />
        </label>
        <label>
          Max tier
          <select id="${policyMaxTierId(scope, key)}">
            <option value="A"${policy.maxTier === "A" ? " selected" : ""}>A</option>
            <option value="B"${policy.maxTier === "B" ? " selected" : ""}>B</option>
            <option value="C"${policy.maxTier === "C" ? " selected" : ""}>C</option>
          </select>
        </label>
      </div>
      <div class="policy-gates">
        ${gateControls}
      </div>
    `;
    fragment.appendChild(card);
  });
  container.appendChild(fragment);
}

function readPolicyMapFromUI(scope, labels) {
  return Object.fromEntries(
    Object.keys(labels).map((key) => {
      const minGateStates = Object.fromEntries(
        GATES.map((gate) => [
          gate.key,
          document.getElementById(policyGateId(scope, key, gate.key)).value,
        ]).filter(([, value]) => value !== "fail")
      );

      return [
        key,
        {
          thresholdDelta: Number(document.getElementById(policyDeltaId(scope, key)).value),
          maxTier: document.getElementById(policyMaxTierId(scope, key)).value,
          minGateStates,
        },
      ];
    })
  );
}

function getCriteriaFromUI() {
  const weightInput = {};
  CRITERIA.forEach((criterion) => {
    weightInput[criterion.key] = sanitizeWeight(
      Number(document.getElementById(weightInputId(criterion.key)).value)
    );
  });
  return applyWeightOverrides(CRITERIA, weightInput);
}

function refreshWeightSummary() {
  const criteria = getCriteriaFromUI();
  const { rawTotal } = normalizeCriteriaWeights(criteria);
  el.configWeightTotal.classList.remove("good", "warn");
  el.configWeightTotal.textContent = `Weight total entered: ${Math.round(rawTotal * 10) / 10}%`;
  if (Math.abs(rawTotal - 100) < 0.05) {
    el.configWeightTotal.classList.add("good");
  } else {
    el.configWeightTotal.classList.add("warn");
    el.configWeightTotal.textContent += " (will be normalized)";
  }
}

function collectConfigFromUI() {
  const weightCriteria = getCriteriaFromUI();
  const weightMap = Object.fromEntries(weightCriteria.map((c) => [c.key, c.weight]));

  return mergeWithDefaultConfig({
    weights: weightMap,
    thresholds: {
      tierA: Number(el.thresholdTierA.value),
      tierB: Number(el.thresholdTierB.value),
    },
    gates: {
      conditionalPenalty: Number(el.conditionalPenalty.value),
      maxTierIfConditional: el.maxTierIfConditional.value,
    },
    evidenceMultipliers: {
      assumed: Number(el.evidenceAssumed.value),
      partial: Number(el.evidencePartial.value),
      validated: Number(el.evidenceValidated.value),
    },
    stage0Policies: readPolicyMapFromUI("stage0", STAGE0_POLICY_LABELS),
    regionPolicies: readPolicyMapFromUI("region", REGION_POLICY_LABELS),
  });
}

function updatePreview(config) {
  el.configPreview.textContent = JSON.stringify(config, null, 2);
}

function setStatus(message) {
  el.configStatus.textContent = message;
}

function populateFromConfig(config) {
  CRITERIA.forEach((criterion) => {
    const input = document.getElementById(weightInputId(criterion.key));
    if (input) {
      input.value = String(config.weights[criterion.key]);
    }
  });
  el.thresholdTierA.value = String(config.thresholds.tierA);
  el.thresholdTierB.value = String(config.thresholds.tierB);
  el.conditionalPenalty.value = String(config.gates.conditionalPenalty);
  el.maxTierIfConditional.value = config.gates.maxTierIfConditional;
  el.evidenceAssumed.value = String(config.evidenceMultipliers.assumed);
  el.evidencePartial.value = String(config.evidenceMultipliers.partial);
  el.evidenceValidated.value = String(config.evidenceMultipliers.validated);

  Object.keys(STAGE0_POLICY_LABELS).forEach((key) => {
    const policy = config.stage0Policies[key];
    document.getElementById(policyDeltaId("stage0", key)).value = String(policy.thresholdDelta);
    document.getElementById(policyMaxTierId("stage0", key)).value = policy.maxTier;
    GATES.forEach((gate) => {
      document.getElementById(policyGateId("stage0", key, gate.key)).value =
        policy.minGateStates[gate.key] || "fail";
    });
  });

  Object.keys(REGION_POLICY_LABELS).forEach((key) => {
    const policy = config.regionPolicies[key];
    document.getElementById(policyDeltaId("region", key)).value = String(policy.thresholdDelta);
    document.getElementById(policyMaxTierId("region", key)).value = policy.maxTier;
    GATES.forEach((gate) => {
      document.getElementById(policyGateId("region", key, gate.key)).value =
        policy.minGateStates[gate.key] || "fail";
    });
  });
}

function bindListeners() {
  CRITERIA.forEach((criterion) => {
    const input = document.getElementById(weightInputId(criterion.key));
    if (input) {
      input.addEventListener("input", () => {
        refreshWeightSummary();
        updatePreview(collectConfigFromUI());
      });
    }
  });

  [
    el.thresholdTierA,
    el.thresholdTierB,
    el.conditionalPenalty,
    el.maxTierIfConditional,
    el.evidenceAssumed,
    el.evidencePartial,
    el.evidenceValidated,
  ].forEach((input) => {
    input.addEventListener("input", () => {
      updatePreview(collectConfigFromUI());
    });
  });

  [
    ...Object.keys(STAGE0_POLICY_LABELS).flatMap((key) => [
      document.getElementById(policyDeltaId("stage0", key)),
      document.getElementById(policyMaxTierId("stage0", key)),
      ...GATES.map((gate) => document.getElementById(policyGateId("stage0", key, gate.key))),
    ]),
    ...Object.keys(REGION_POLICY_LABELS).flatMap((key) => [
      document.getElementById(policyDeltaId("region", key)),
      document.getElementById(policyMaxTierId("region", key)),
      ...GATES.map((gate) => document.getElementById(policyGateId("region", key, gate.key))),
    ]),
  ].forEach((input) => {
    input.addEventListener("input", () => {
      updatePreview(collectConfigFromUI());
    });
    input.addEventListener("change", () => {
      updatePreview(collectConfigFromUI());
    });
  });

  el.saveConfigButton.addEventListener("click", () => {
    const saved = saveConfig(collectConfigFromUI());
    updatePreview(saved);
    setStatus("Configuration saved.");
  });

  el.resetConfigButton.addEventListener("click", () => {
    const defaults = resetConfig();
    populateFromConfig(defaults);
    refreshWeightSummary();
    updatePreview(defaults);
    setStatus("Configuration reset to defaults.");
  });
}

const initialConfig = mergeWithDefaultConfig(loadConfig() || getDefaultConfig());
renderCriteria(initialConfig);
renderPolicyCards(el.stage0PolicyContainer, "stage0", STAGE0_POLICY_LABELS, initialConfig.stage0Policies);
renderPolicyCards(el.regionPolicyContainer, "region", REGION_POLICY_LABELS, initialConfig.regionPolicies);
populateFromConfig(initialConfig);
refreshWeightSummary();
updatePreview(initialConfig);
bindListeners();
