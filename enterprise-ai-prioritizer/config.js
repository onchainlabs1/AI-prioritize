import {
  CRITERIA,
  applyWeightOverrides,
  mergeWithDefaultConfig,
  normalizeCriteriaWeights,
  sanitizeWeight,
} from "./decision-engine.js";
import { getDefaultConfig, loadConfig, resetConfig, saveConfig } from "./settings.js";

const el = {
  criteriaContainer: document.getElementById("configCriteriaContainer"),
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
populateFromConfig(initialConfig);
refreshWeightSummary();
updatePreview(initialConfig);
bindListeners();
