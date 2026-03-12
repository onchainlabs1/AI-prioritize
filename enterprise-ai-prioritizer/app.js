import {
  CRITERIA,
  applyWeightOverrides,
  classify,
  getGateStatus as evaluateGates,
  getScores as evaluateScores,
  mergeWithDefaultConfig,
  normalizeCriteriaWeights,
  sanitizeWeight,
  useCaseHint,
} from "./decision-engine.js";
import {
  getInitiativeById,
  saveInitiativeAssessment,
  setInitiativeStatus,
} from "./initiative-store.js";
import { loadConfig } from "./settings.js";

const SELECTION_COMPONENTS = [
  "Strategic alignment and measurable business value",
  "ROI and unit economics sustainability",
  "Time-to-value and delivery urgency",
  "Technical and data feasibility",
  "Operating model readiness and adoption",
  "Regulatory, security, and data governance risk controls",
];

const STAGE0_LABELS = {
  genai_rag: "GenAI / RAG candidate",
  agentic: "Agentic candidate",
  classical_ml: "Classical ML candidate",
  deterministic: "Deterministic automation candidate",
  not_suitable: "Not suitable yet (requires process redesign)",
};

const el = {
  criteriaContainer: document.getElementById("criteriaContainer"),
  runButton: document.getElementById("runButton"),
  copyButton: document.getElementById("copyButton"),
  resetButton: document.getElementById("resetButton"),
  normalizeWeightsButton: document.getElementById("normalizeWeightsButton"),
  weightsTotal: document.getElementById("weightsTotal"),
  modelSummary: document.getElementById("modelSummary"),
  result: document.getElementById("result"),
  projectName: document.getElementById("projectName"),
  businessUnit: document.getElementById("businessUnit"),
  useCaseType: document.getElementById("useCaseType"),
  region: document.getElementById("region"),
  stage0Fit: document.getElementById("stage0Fit"),
  gateRegulatory: document.getElementById("gateRegulatory"),
  gateSecurity: document.getElementById("gateSecurity"),
  gateData: document.getElementById("gateData"),
  gateEconomics: document.getElementById("gateEconomics"),
  scoreValue: document.getElementById("scoreValue"),
  laneValue: document.getElementById("laneValue"),
  gateValue: document.getElementById("gateValue"),
  confidenceValue: document.getElementById("confidenceValue"),
  scoreBar: document.getElementById("scoreBar"),
  initiativeContext: document.getElementById("initiativeContext"),
  saveAssessmentButton: document.getElementById("saveAssessmentButton"),
  assessmentStatus: document.getElementById("assessmentStatus"),
};

let lastReport = "";
let lastComputedReport = null;
const runtime = {
  config: mergeWithDefaultConfig(loadConfig()),
  initiativeId: null,
  initiative: null,
};

function weightInputId(key) {
  return `${key}Weight`;
}

function evidenceInputId(key) {
  return `${key}Evidence`;
}

function effectiveWeightId(key) {
  return `${key}EffectiveWeight`;
}

function renderCriteria() {
  const fragment = document.createDocumentFragment();
  CRITERIA.forEach((criterion) => {
    const defaultWeight = runtime.config.weights[criterion.key];
    const row = document.createElement("div");
    row.className = "criterion";
    row.innerHTML = `
      <div>
        <strong>${criterion.label}</strong>
        <div class="weight">${criterion.help}</div>
      </div>
      <label>
        Score (1-5)
        <input id="${criterion.key}" type="number" min="1" max="5" step="1" value="3" />
      </label>
      <label>
        Evidence
        <select id="${evidenceInputId(criterion.key)}">
          <option value="assumed">Assumed (low confidence)</option>
          <option value="partial" selected>Partial (medium confidence)</option>
          <option value="validated">Validated (high confidence)</option>
        </select>
      </label>
      <label>
        Weight %
        <input id="${weightInputId(criterion.key)}" type="number" min="0" max="100" step="0.1" value="${defaultWeight}" />
      </label>
      <div class="effective-weight">
        Effective:<br />
        <strong id="${effectiveWeightId(criterion.key)}">${Number(defaultWeight).toFixed(1)}%</strong>
      </div>
    `;
    fragment.appendChild(row);
  });
  el.criteriaContainer.appendChild(fragment);
}

function getRuntimeConfig() {
  runtime.config = mergeWithDefaultConfig(loadConfig());
  return runtime.config;
}

function getActiveCriteria(config) {
  const weightInput = {};
  CRITERIA.forEach((criterion) => {
    weightInput[criterion.key] = sanitizeWeight(
      Number(document.getElementById(weightInputId(criterion.key)).value)
    );
  });
  const baseline = applyWeightOverrides(CRITERIA, config.weights);
  return applyWeightOverrides(baseline, weightInput);
}

function getGateStatus(config) {
  return evaluateGates(
    {
      regulatory: el.gateRegulatory.value,
      security: el.gateSecurity.value,
      data: el.gateData.value,
      economics: el.gateEconomics.value,
    },
    config
  );
}

function getScores(config, activeCriteria) {
  const scoreInput = {};
  const evidenceInput = {};
  CRITERIA.forEach((criterion) => {
    scoreInput[criterion.key] = Number(document.getElementById(criterion.key).value);
    evidenceInput[criterion.key] = document.getElementById(evidenceInputId(criterion.key)).value;
  });
  return {
    scoreInput,
    evidenceInput,
    evaluation: evaluateScores(scoreInput, activeCriteria, evidenceInput, config),
  };
}

function refreshWeightVisualization(config) {
  const activeCriteria = getActiveCriteria(config);
  const { normalized, rawTotal } = normalizeCriteriaWeights(activeCriteria);

  if (el.weightsTotal) {
    el.weightsTotal.textContent = `Weight total entered: ${Math.round(rawTotal * 10) / 10}%`;
    el.weightsTotal.classList.remove("good", "warn");
    if (Math.abs(rawTotal - 100) < 0.05) {
      el.weightsTotal.classList.add("good");
    } else {
      el.weightsTotal.classList.add("warn");
      el.weightsTotal.textContent += " (normalized to 100% during scoring)";
    }
  }

  normalized.forEach((criterion) => {
    const effective = document.getElementById(effectiveWeightId(criterion.key));
    if (effective) {
      effective.textContent = `${(Math.round(criterion.weight * 10) / 10).toFixed(1)}%`;
    }
  });
}

function updateModelSummary(config) {
  if (!el.modelSummary) {
    return;
  }
  el.modelSummary.textContent =
    `Thresholds: Tier A >= ${config.thresholds.tierA}, Tier B >= ${config.thresholds.tierB}. ` +
    `Conditional gate penalty: ${config.gates.conditionalPenalty} each. ` +
    `Max tier with conditional gates: ${config.gates.maxTierIfConditional}.`;
}

function buildReport() {
  const config = getRuntimeConfig();
  const name = (el.projectName.value || "Unnamed project").trim();
  const bu = (el.businessUnit.value || "N/A").trim();
  const useCaseType = el.useCaseType.value;
  const region = el.region.value;
  const stage0Choice = el.stage0Fit.value;

  const activeCriteria = getActiveCriteria(config);
  const gate = getGateStatus(config);
  const scoreResult = getScores(config, activeCriteria);
  const scores = scoreResult.evaluation;
  const cls = classify(scores.total, gate, stage0Choice, config);

  const lines = [];
  lines.push(`Project: ${name}`);
  lines.push(`Business Unit: ${bu}`);
  lines.push(`Use Case Type: ${useCaseType}`);
  lines.push(`Region: ${region}`);
  lines.push(`Stage 0 route: ${STAGE0_LABELS[stage0Choice] || stage0Choice}`);
  lines.push("");
  lines.push(`Raw weighted score: ${scores.total}/100`);
  lines.push(`Gate penalty: ${gate.penalty}`);
  lines.push(`Final decision score: ${cls.adjustedScore}/100`);
  lines.push(`Tier: ${cls.tier} | Lane: ${cls.lane}`);
  lines.push(`Rationale: ${cls.rationale}`);
  lines.push("");
  lines.push(`Weight total entered: ${scores.rawWeightTotal}% (normalized to 100% during scoring)`);
  lines.push(`Evidence confidence index: ${scores.confidenceIndex}/100`);
  lines.push(
    `Evidence mix: assumed=${scores.evidenceCounts.assumed}, partial=${scores.evidenceCounts.partial}, validated=${scores.evidenceCounts.validated}`
  );
  lines.push("");
  lines.push("Components considered:");
  SELECTION_COMPONENTS.forEach((component) => {
    lines.push(`- ${component}`);
  });
  lines.push("");
  lines.push("Scoring breakdown:");
  scores.details.forEach((detail) => {
    lines.push(
      `- ${detail.label}: ${detail.score}/5 | evidence=${detail.evidence} (x${detail.multiplier}) | weight=${detail.weight}% | contribution=${detail.contribution}`
    );
  });

  if (gate.conditionalCount > 0) {
    lines.push("");
    lines.push("Conditional gates:");
    gate.conditional.forEach((item) => lines.push(`- ${item}`));
  }

  if (gate.failCount > 0) {
    lines.push("");
    lines.push("Failed gates:");
    gate.failed.forEach((item) => lines.push(`- ${item}`));
  }

  lines.push("");
  lines.push(`Use-case guidance: ${useCaseHint(useCaseType)}`);
  lines.push("Next action: generate ADR and validate with business, security, and compliance.");

  return {
    text: lines.join("\n"),
    rawScore: scores.total,
    score: cls.adjustedScore,
    confidenceIndex: scores.confidenceIndex,
    stage0Choice,
    project: {
      name,
      businessUnit: bu,
      useCaseType,
      region,
    },
    scoreInput: scoreResult.scoreInput,
    evidenceInput: scoreResult.evidenceInput,
    weightsInput: Object.fromEntries(activeCriteria.map((criterion) => [criterion.key, criterion.weight])),
    scores,
    classification: cls,
    gate,
    configSnapshot: config,
  };
}

function renderResult(report) {
  const pill = `<span class="pill ${report.classification.css}">Tier ${report.classification.tier}</span>`;
  const gateSummary =
    report.gate.failCount > 0
      ? `Gates: ${report.gate.failCount} fail / ${report.gate.conditionalCount} conditional`
      : report.gate.conditionalCount > 0
        ? `Gates: ${report.gate.conditionalCount} conditional`
        : "Gates: all pass";

  if (el.scoreValue) el.scoreValue.textContent = `${report.score}/100`;
  if (el.laneValue) el.laneValue.textContent = report.classification.lane;
  if (el.gateValue) el.gateValue.textContent = gateSummary.replace("Gates: ", "");
  if (el.confidenceValue) el.confidenceValue.textContent = `${report.confidenceIndex}/100`;
  if (el.scoreBar) el.scoreBar.style.width = `${Math.max(0, Math.min(100, report.score))}%`;

  el.result.classList.remove("empty");
  el.result.innerHTML =
    `${pill}\n${gateSummary}\n\n` +
    report.text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
}

function runCalculation() {
  const report = buildReport();
  lastReport = report.text;
  lastComputedReport = report;
  refreshWeightVisualization(runtime.config);
  updateModelSummary(runtime.config);
  renderResult(report);
  markAssessmentInProgress();
  return report;
}

function copyReport() {
  if (!lastReport) {
    runCalculation();
  }
  navigator.clipboard
    .writeText(lastReport)
    .then(() => {
      el.copyButton.textContent = "Copied";
      setTimeout(() => {
        el.copyButton.textContent = "Copy Report";
      }, 1200);
    })
    .catch(() => {
      el.copyButton.textContent = "Copy failed";
      setTimeout(() => {
        el.copyButton.textContent = "Copy Report";
      }, 1200);
    });
}

function resetForm() {
  const config = getRuntimeConfig();
  el.projectName.value = "";
  el.businessUnit.value = "";
  el.useCaseType.value = "assistant";
  el.region.value = "eu-us";
  el.stage0Fit.value = "genai_rag";
  el.gateRegulatory.value = "pass";
  el.gateSecurity.value = "pass";
  el.gateData.value = "pass";
  el.gateEconomics.value = "pass";

  CRITERIA.forEach((criterion) => {
    const scoreInput = document.getElementById(criterion.key);
    const evidenceInput = document.getElementById(evidenceInputId(criterion.key));
    const weightInput = document.getElementById(weightInputId(criterion.key));
    if (scoreInput) scoreInput.value = "3";
    if (evidenceInput) evidenceInput.value = "partial";
    if (weightInput) weightInput.value = String(config.weights[criterion.key]);
  });

  if (el.scoreValue) el.scoreValue.textContent = "--";
  if (el.laneValue) el.laneValue.textContent = "--";
  if (el.gateValue) el.gateValue.textContent = "--";
  if (el.confidenceValue) el.confidenceValue.textContent = "--";
  if (el.scoreBar) el.scoreBar.style.width = "0%";

  lastReport = "";
  lastComputedReport = null;
  el.result.className = "result empty";
  el.result.textContent = 'Fill the fields and click "Calculate Priority".';
  if (el.assessmentStatus) {
    el.assessmentStatus.textContent = "";
  }
  refreshWeightVisualization(config);
  updateModelSummary(config);
}

function normalizeWeightsInUI() {
  const config = getRuntimeConfig();
  const activeCriteria = getActiveCriteria(config);
  const { normalized } = normalizeCriteriaWeights(activeCriteria);
  normalized.forEach((criterion) => {
    const input = document.getElementById(weightInputId(criterion.key));
    if (input) {
      input.value = (Math.round(criterion.weight * 10) / 10).toFixed(1);
    }
  });
  refreshWeightVisualization(config);
}

function bindCriteriaListeners() {
  CRITERIA.forEach((criterion) => {
    const input = document.getElementById(weightInputId(criterion.key));
    if (input) {
      input.addEventListener("input", () => {
        refreshWeightVisualization(runtime.config);
      });
    }
  });
}

function readInitiativeIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get("id") || "").trim();
  return id || null;
}

function setAssessmentStatus(message, cssClass = "") {
  if (!el.assessmentStatus) {
    return;
  }
  el.assessmentStatus.textContent = message;
  el.assessmentStatus.classList.remove("status-ok", "status-warn");
  if (cssClass) {
    el.assessmentStatus.classList.add(cssClass);
  }
}

function renderInitiativeContext() {
  if (!el.initiativeContext) {
    return;
  }
  if (!runtime.initiativeId) {
    el.initiativeContext.textContent =
      "Open this page with ?id=<initiative-id> from Triage Queue to save an auditable assessment.";
    return;
  }
  if (!runtime.initiative) {
    el.initiativeContext.textContent = `Initiative ${runtime.initiativeId} was not found in local storage.`;
    return;
  }

  const initiative = runtime.initiative;
  const scoreLabel = initiative.finalScore == null ? "N/A" : `${initiative.finalScore}/100`;
  el.initiativeContext.textContent =
    `Linked initiative ${initiative.id} | Status: ${initiative.status} | Owner: ${initiative.owner || "unassigned"} | ` +
    `Lane: ${initiative.priorityLane || "Unassessed"} | Final score: ${scoreLabel}`;
}

function maybePrefillFromInitiative() {
  if (!runtime.initiative) {
    return;
  }
  const initiative = runtime.initiative;
  if (!el.projectName.value && initiative.title) {
    el.projectName.value = initiative.title;
  }
  if (!el.businessUnit.value && initiative.businessUnit) {
    el.businessUnit.value = initiative.businessUnit;
  }
}

function loadInitiativeContext() {
  runtime.initiativeId = readInitiativeIdFromUrl();
  if (!runtime.initiativeId) {
    renderInitiativeContext();
    if (el.saveAssessmentButton) {
      el.saveAssessmentButton.disabled = true;
      el.saveAssessmentButton.title = "Open an initiative from Triage Queue to enable save.";
    }
    return;
  }

  runtime.initiative = getInitiativeById(runtime.initiativeId);
  if (!runtime.initiative) {
    renderInitiativeContext();
    if (el.saveAssessmentButton) {
      el.saveAssessmentButton.disabled = true;
    }
    return;
  }

  if (runtime.initiative.status === "submitted") {
    const updated = setInitiativeStatus(
      runtime.initiative.id,
      "triage",
      "reviewer",
      "Initiative opened in assessment workspace."
    );
    if (updated) {
      runtime.initiative = updated;
    }
  }

  maybePrefillFromInitiative();
  renderInitiativeContext();
}

function markAssessmentInProgress() {
  if (!runtime.initiative || !runtime.initiativeId) {
    return;
  }
  if (runtime.initiative.status === "triage" || runtime.initiative.status === "submitted") {
    const updated = setInitiativeStatus(
      runtime.initiative.id,
      "assessment",
      "reviewer",
      "Assessment scoring started."
    );
    if (updated) {
      runtime.initiative = updated;
      renderInitiativeContext();
    }
  }
}

function saveAssessment() {
  if (!runtime.initiativeId) {
    setAssessmentStatus("No linked initiative. Open assessment from Triage Queue.", "status-warn");
    return;
  }
  const report = lastComputedReport || runCalculation();
  const assessmentPayload = {
    savedAt: new Date().toISOString(),
    stage0Choice: report.stage0Choice,
    project: report.project,
    scoreInput: report.scoreInput,
    evidenceInput: report.evidenceInput,
    weightsInput: report.weightsInput,
    gate: report.gate,
    score: report.score,
    rawScore: report.rawScore,
    confidenceIndex: report.confidenceIndex,
    scores: report.scores,
    classification: report.classification,
    reportText: report.text,
    configSnapshot: report.configSnapshot,
  };
  const updated = saveInitiativeAssessment(runtime.initiativeId, assessmentPayload, "reviewer");
  if (!updated) {
    setAssessmentStatus("Failed to save assessment. Initiative not found.", "status-warn");
    return;
  }
  runtime.initiative = updated;
  renderInitiativeContext();
  setAssessmentStatus(
    `Assessment saved to ${updated.id}. Status moved to ${updated.status}. Open Board View for final decision.`,
    "status-ok"
  );
}

renderCriteria();
bindCriteriaListeners();
resetForm();
loadInitiativeContext();
el.runButton.addEventListener("click", runCalculation);
el.copyButton.addEventListener("click", copyReport);
el.resetButton.addEventListener("click", resetForm);
if (el.saveAssessmentButton) {
  el.saveAssessmentButton.addEventListener("click", saveAssessment);
}
if (el.normalizeWeightsButton) {
  el.normalizeWeightsButton.addEventListener("click", normalizeWeightsInUI);
}
