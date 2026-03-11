import {
  CRITERIA,
  classify,
  getGateStatus as evaluateGates,
  getScores as evaluateScores,
  useCaseHint,
} from "./decision-engine.js";

const el = {
  criteriaContainer: document.getElementById("criteriaContainer"),
  runButton: document.getElementById("runButton"),
  copyButton: document.getElementById("copyButton"),
  resetButton: document.getElementById("resetButton"),
  result: document.getElementById("result"),
  projectName: document.getElementById("projectName"),
  businessUnit: document.getElementById("businessUnit"),
  useCaseType: document.getElementById("useCaseType"),
  region: document.getElementById("region"),
  gateRegulatory: document.getElementById("gateRegulatory"),
  gateSecurity: document.getElementById("gateSecurity"),
  gateData: document.getElementById("gateData"),
  gateEconomics: document.getElementById("gateEconomics"),
  scoreValue: document.getElementById("scoreValue"),
  laneValue: document.getElementById("laneValue"),
  gateValue: document.getElementById("gateValue"),
  scoreBar: document.getElementById("scoreBar"),
};

let lastReport = "";

function renderCriteria() {
  const fragment = document.createDocumentFragment();
  CRITERIA.forEach((c) => {
    const row = document.createElement("div");
    row.className = "criterion";
    row.innerHTML = `
      <div>
        <strong>${c.label}</strong>
        <div class="weight">Weight: ${c.weight}% | ${c.help}</div>
      </div>
      <label>
        Score (1-5)
        <input id="${c.key}" type="number" min="1" max="5" step="1" value="3" />
      </label>
      <div>${c.weight}%</div>
    `;
    fragment.appendChild(row);
  });
  el.criteriaContainer.appendChild(fragment);
}

function getGateStatus() {
  return evaluateGates({
    regulatory: el.gateRegulatory.checked,
    security: el.gateSecurity.checked,
    data: el.gateData.checked,
    economics: el.gateEconomics.checked,
  });
}

function getScores() {
  const scoreInput = {};
  CRITERIA.forEach((criterion) => {
    scoreInput[criterion.key] = Number(document.getElementById(criterion.key).value);
  });
  return evaluateScores(scoreInput);
}

function buildReport() {
  const name = (el.projectName.value || "Unnamed project").trim();
  const bu = (el.businessUnit.value || "N/A").trim();
  const useCaseType = el.useCaseType.value;
  const region = el.region.value;
  const gate = getGateStatus();
  const scores = getScores();
  const cls = classify(scores.total, gate.ok);

  const lines = [];
  lines.push(`Project: ${name}`);
  lines.push(`Business Unit: ${bu}`);
  lines.push(`Use Case Type: ${useCaseType}`);
  lines.push(`Region: ${region}`);
  lines.push("");
  lines.push(`Final score: ${scores.total}/100`);
  lines.push(`Tier: ${cls.tier} | Lane: ${cls.lane}`);
  lines.push(`Rationale: ${cls.rationale}`);
  lines.push("");
  lines.push("Scoring breakdown:");
  scores.details.forEach((d) => {
    lines.push(`- ${d.label}: ${d.score}/5 (weight ${d.weight}%)`);
  });

  if (!gate.ok) {
    lines.push("");
    lines.push("Pending gates:");
    gate.failed.forEach((f) => lines.push(`- ${f}`));
  }

  lines.push("");
  lines.push(`Use-case guidance: ${useCaseHint(useCaseType)}`);
  lines.push("Next action: generate ADR and validate with business, security, and compliance.");

  return {
    text: lines.join("\n"),
    score: scores.total,
    classification: cls,
    gate,
  };
}

function renderResult(rep) {
  const pill = `<span class="pill ${rep.classification.css}">Tier ${rep.classification.tier}</span>`;
  const gateSummary = rep.gate.ok
    ? "Gates: OK"
    : `Gates: failed (${rep.gate.failed.length})`;
  if (el.scoreValue) el.scoreValue.textContent = `${rep.score}/100`;
  if (el.laneValue) el.laneValue.textContent = rep.classification.lane;
  if (el.gateValue) el.gateValue.textContent = rep.gate.ok ? "OK" : `${rep.gate.failed.length} pending`;
  if (el.scoreBar) el.scoreBar.style.width = `${Math.max(0, Math.min(100, rep.score))}%`;
  el.result.classList.remove("empty");
  el.result.innerHTML = `${pill}\n${gateSummary}\n\n${rep.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}`;
}

function runCalculation() {
  const rep = buildReport();
  lastReport = rep.text;
  renderResult(rep);
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
  el.projectName.value = "";
  el.businessUnit.value = "";
  el.useCaseType.value = "assistant";
  el.region.value = "eu-us";
  el.gateRegulatory.checked = false;
  el.gateSecurity.checked = false;
  el.gateData.checked = false;
  el.gateEconomics.checked = false;
  if (el.scoreValue) el.scoreValue.textContent = "--";
  if (el.laneValue) el.laneValue.textContent = "--";
  if (el.gateValue) el.gateValue.textContent = "--";
  if (el.scoreBar) el.scoreBar.style.width = "0%";
  CRITERIA.forEach((c) => {
    const input = document.getElementById(c.key);
    if (input) input.value = "3";
  });
  lastReport = "";
  el.result.className = "result empty";
  el.result.textContent = 'Fill the fields and click "Calculate Priority".';
}

renderCriteria();
el.runButton.addEventListener("click", runCalculation);
el.copyButton.addEventListener("click", copyReport);
el.resetButton.addEventListener("click", resetForm);
