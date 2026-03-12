import { getQueueStats, listInitiatives } from "./initiative-store.js";

const el = {
  kpiSubmitted: document.getElementById("kpiSubmitted"),
  kpiAssessment: document.getElementById("kpiAssessment"),
  kpiBoard: document.getElementById("kpiBoard"),
  kpiApproved: document.getElementById("kpiApproved"),
  priorityCount: document.getElementById("priorityCount"),
  priorityList: document.getElementById("priorityList"),
  alertList: document.getElementById("alertList"),
  decisionList: document.getElementById("decisionList"),
};

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value || "N/A";
  }
}

function laneRank(lane) {
  const normalized = String(lane || "").toLowerCase();
  if (normalized.includes("prioritize now")) return 3;
  if (normalized.includes("plan next")) return 2;
  if (normalized.includes("incubate")) return 1;
  return 0;
}

function sortPriority(items) {
  return [...items].sort((a, b) => {
    const laneDiff = laneRank(b.priorityLane) - laneRank(a.priorityLane);
    if (laneDiff !== 0) return laneDiff;
    const scoreA = Number.isFinite(Number(a.finalScore)) ? Number(a.finalScore) : -1;
    const scoreB = Number.isFinite(Number(b.finalScore)) ? Number(b.finalScore) : -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
}

function renderPriorityList(initiatives) {
  const top = sortPriority(initiatives).slice(0, 5);
  el.priorityCount.textContent = String(top.length);
  el.priorityList.innerHTML = "";

  if (top.length === 0) {
    el.priorityList.appendChild(createElement("p", "hint", "No initiatives available yet."));
    return;
  }

  top.forEach((initiative) => {
    const article = createElement("article", "queue-item");
    const header = createElement("header");
    const title = createElement("h3", "", `${initiative.id} — ${initiative.title || "Untitled"}`);
    const status = createElement("span", "tag", initiative.status || "unknown");
    const summary = createElement(
      "p",
      "hint",
      `Lane: ${initiative.priorityLane || "Unassessed"} | Score: ${initiative.finalScore ?? "N/A"} | BU: ${initiative.businessUnit || "N/A"}`
    );
    const updated = createElement("p", "hint", `Updated: ${formatDate(initiative.updatedAt)}`);
    const actions = createElement("div", "actions");
    const assessmentLink = createElement("a", "btn-link", "Open Assessment");
    assessmentLink.href = `./assessment.html?id=${encodeURIComponent(initiative.id)}`;
    const boardLink = createElement("a", "btn-link", "Board Decision");
    boardLink.href = `./board.html?id=${encodeURIComponent(initiative.id)}`;

    header.appendChild(title);
    header.appendChild(status);
    actions.appendChild(assessmentLink);
    actions.appendChild(boardLink);
    article.appendChild(header);
    article.appendChild(summary);
    article.appendChild(updated);
    article.appendChild(actions);
    el.priorityList.appendChild(article);
  });
}

function renderAlerts(initiatives) {
  el.alertList.innerHTML = "";
  const alerts = [];

  const noGo = initiatives.filter((i) => String(i.priorityLane || "").toLowerCase().includes("do not prioritize"));
  if (noGo.length > 0) alerts.push(`${noGo.length} initiative(s) currently marked NO-GO.`);

  const holds = initiatives.filter((i) => i.status === "hold");
  if (holds.length > 0) alerts.push(`${holds.length} initiative(s) are on hold and need a decision.`);

  const noOwner = initiatives.filter((i) => !i.owner || i.owner === "unassigned");
  if (noOwner.length > 0) alerts.push(`${noOwner.length} initiative(s) missing a defined owner.`);

  const noScore = initiatives.filter((i) => i.finalScore == null && i.status !== "submitted" && i.status !== "triage");
  if (noScore.length > 0) alerts.push(`${noScore.length} initiative(s) in-progress without a saved score.`);

  if (alerts.length === 0) {
    el.alertList.appendChild(createElement("li", "", "No critical alerts right now."));
    return;
  }

  alerts.forEach((message) => {
    el.alertList.appendChild(createElement("li", "", message));
  });
}

function renderRecentDecisions(initiatives) {
  el.decisionList.innerHTML = "";
  const recent = initiatives
    .filter((i) => i.boardDecision && i.boardDecision.decision)
    .sort((a, b) => String(b.boardDecision?.decidedAt || "").localeCompare(String(a.boardDecision?.decidedAt || "")))
    .slice(0, 5);

  if (recent.length === 0) {
    el.decisionList.appendChild(createElement("li", "", "No board decisions registered yet."));
    return;
  }

  recent.forEach((initiative) => {
    const li = createElement(
      "li",
      "",
      `${initiative.id}: ${initiative.boardDecision.decision} (${formatDate(initiative.boardDecision.decidedAt)})`
    );
    el.decisionList.appendChild(li);
  });
}

function applyStats(stats) {
  const byStatus = stats?.byStatus || {};
  el.kpiSubmitted.textContent = String(byStatus.submitted || 0);
  el.kpiAssessment.textContent = String((byStatus.assessment || 0) + (byStatus.triage || 0));
  el.kpiBoard.textContent = String(byStatus.board_review || 0);
  el.kpiApproved.textContent = String((byStatus.approved || 0) + (byStatus.approved_with_conditions || 0));
}

async function initDashboard() {
  try {
    const [stats, initiatives] = await Promise.all([getQueueStats(), listInitiatives()]);
    applyStats(stats);
    renderPriorityList(initiatives);
    renderAlerts(initiatives);
    renderRecentDecisions(initiatives);
  } catch (error) {
    const msg = error?.message || "Failed to load dashboard data.";
    el.priorityList.innerHTML = "";
    el.priorityList.appendChild(createElement("p", "hint status-warn", msg));
    el.alertList.innerHTML = "";
    el.alertList.appendChild(createElement("li", "", "Unable to load alerts."));
    el.decisionList.innerHTML = "";
    el.decisionList.appendChild(createElement("li", "", "Unable to load recent decisions."));
  }
}

void initDashboard();
