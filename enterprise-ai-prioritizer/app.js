const CRITERIA = [
  {
    key: "businessImpact",
    label: "Impacto de negocio",
    weight: 25,
    help: "Receita, reducao de custo, risco evitado",
  },
  {
    key: "timeToValue",
    label: "Time-to-value",
    weight: 15,
    help: "Velocidade para gerar valor em producao",
  },
  {
    key: "platformLeverage",
    label: "Reuso e leverage de plataforma",
    weight: 15,
    help: "Reaproveitamento cross-BU",
  },
  {
    key: "readiness",
    label: "Prontidao tecnica e dados",
    weight: 15,
    help: "Integracoes, qualidade de dados, owner",
  },
  {
    key: "unitEconomics",
    label: "Unit economics",
    weight: 15,
    help: "Custo por transacao/token e payback",
  },
  {
    key: "adoption",
    label: "Adocao e change readiness",
    weight: 10,
    help: "Aderencia ao fluxo e sponsorship",
  },
  {
    key: "residualRisk",
    label: "Risco residual (apos controles)",
    weight: 5,
    help: "5 = baixo risco residual",
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
        <div class="weight">Peso: ${c.weight}% | ${c.help}</div>
      </div>
      <label>
        Nota (1-5)
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
    { label: "Classificacao regulatoria", ok: el.gateRegulatory.checked },
    { label: "Threat model de seguranca", ok: el.gateSecurity.checked },
    { label: "Governanca de dados", ok: el.gateData.checked },
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
      lane: "Nao priorizar agora",
      css: "bad",
      rationale: "Um ou mais gates obrigatorios falharam.",
    };
  }

  if (score >= 75) {
    return {
      tier: "A",
      lane: "Priorizar agora",
      css: "good",
      rationale: "Projeto com boa chance de valor e execucao no ciclo atual.",
    };
  }
  if (score >= 60) {
    return {
      tier: "B",
      lane: "Discovery guiado",
      css: "warn",
      rationale: "Precisa reduzir incertezas antes de escalar.",
    };
  }
  return {
    tier: "C",
    lane: "Backlog / reavaliar",
    css: "bad",
    rationale: "Baixa relacao valor-risco-prontidao neste momento.",
  };
}

function useCaseHint(useCaseType) {
  const hints = {
    assistente: "Comece com RAG classico + guardrails de prompt e dados.",
    atendimento: "Exija fallback humano e medicao de resolucao no primeiro contato.",
    automacao: "Priorize processos com alto volume e baixa variabilidade.",
    analitica: "Exija baseline estatistico e validacao out-of-sample.",
    risco: "Inclua aprovacao precoce de compliance e auditoria rastreavel.",
  };
  return hints[useCaseType] || "Defina um padrao de arquitetura com controles minimos.";
}

function buildReport() {
  const name = (el.projectName.value || "Projeto sem nome").trim();
  const bu = (el.businessUnit.value || "N/A").trim();
  const useCaseType = el.useCaseType.value;
  const region = el.region.value;
  const gate = getGateStatus();
  const scores = getScores();
  const cls = classify(scores.total, gate.ok);

  const lines = [];
  lines.push(`Projeto: ${name}`);
  lines.push(`Unidade: ${bu}`);
  lines.push(`Tipo: ${useCaseType}`);
  lines.push(`Regiao: ${region}`);
  lines.push("");
  lines.push(`Score final: ${scores.total}/100`);
  lines.push(`Tier: ${cls.tier} | Lane: ${cls.lane}`);
  lines.push(`Racional: ${cls.rationale}`);
  lines.push("");
  lines.push("Detalhe de notas:");
  scores.details.forEach((d) => {
    lines.push(`- ${d.label}: ${d.score}/5 (peso ${d.weight}%)`);
  });

  if (!gate.ok) {
    lines.push("");
    lines.push("Gates pendentes:");
    gate.failed.forEach((f) => lines.push(`- ${f}`));
  }

  lines.push("");
  lines.push(`Guidance por caso: ${useCaseHint(useCaseType)}`);
  lines.push("Proxima acao: gerar ADR e validar com negocio + seguranca + compliance.");

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
    : `Gates: falha em ${rep.gate.failed.length}`;
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
      el.copyButton.textContent = "Copiado";
      setTimeout(() => {
        el.copyButton.textContent = "Copiar Relatorio";
      }, 1200);
    })
    .catch(() => {
      el.copyButton.textContent = "Falha ao copiar";
      setTimeout(() => {
        el.copyButton.textContent = "Copiar Relatorio";
      }, 1200);
    });
}

function resetForm() {
  el.projectName.value = "";
  el.businessUnit.value = "";
  el.useCaseType.value = "assistente";
  el.region.value = "eu-us";
  el.gateRegulatory.checked = false;
  el.gateSecurity.checked = false;
  el.gateData.checked = false;
  el.gateEconomics.checked = false;
  CRITERIA.forEach((c) => {
    const input = document.getElementById(c.key);
    if (input) input.value = "3";
  });
  lastReport = "";
  el.result.className = "result empty";
  el.result.textContent = 'Preencha e clique em "Calcular Prioridade".';
}

renderCriteria();
el.runButton.addEventListener("click", runCalculation);
el.copyButton.addEventListener("click", copyReport);
el.resetButton.addEventListener("click", resetForm);
