const CRITERIA = [
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
  const gates = [
    { label: "Regulatory risk classification", ok: el.gateRegulatory.checked },
    { label: "Security threat model", ok: el.gateSecurity.checked },
    { label: "Data governance", ok: el.gateData.checked },
    { label: "KPI + baseline + economics", ok: el.gateEconomics.checked },
  ];
  const failed = gates.filter((g) => !g.ok).map((g) => g.label);
  return { ok: failed.length === 0, failed };
}

function getScores() {
  let weighted = 0;
  const details = [];
  CRITERIA.forEach((c) => {
    const raw = Number(document.getElementById(c.key).value);
    const score = Number.isFinite(raw) ? Math.min(5, Math.max(1, raw)) : 1;
    weighted += (score / 5) * c.weight;
    details.push({ label: c.label, score, weight: c.weight });
  });
  return { total: Math.round(weighted * 10) / 10, details };
}

function classify(score, gateOk) {
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

function useCaseHint(useCaseType) {
  const hints = {
    assistant: "Start with classic RAG plus prompt and data guardrails.",
    customer_support: "Require human fallback and first-contact resolution tracking.",
    automation: "Prioritize high-volume, low-variability processes.",
    analytics: "Require a statistical baseline and out-of-sample validation.",
    risk: "Include early compliance approval and traceable audit evidence.",
  };
  return hints[useCaseType] || "Define a reference architecture with minimum controls.";
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
