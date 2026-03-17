import { getQueueStats, listInitiatives } from "./initiative-store.js";

const el = {
  kpiNow: document.getElementById("kpiNow"),
  kpiDecision: document.getElementById("kpiDecision"),
  kpiClarity: document.getElementById("kpiClarity"),
  kpiApproved: document.getElementById("kpiApproved"),
  executiveSummary: document.getElementById("executiveSummary"),
  priorityCount: document.getElementById("priorityCount"),
  priorityList: document.getElementById("priorityList"),
  decisionCount: document.getElementById("decisionCount"),
  decisionQueueList: document.getElementById("decisionQueueList"),
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

function decisionLabel(decision) {
  const labels = {
    approve_now: "Approve now",
    approve_after_discovery: "Proceed with follow-ups",
    hold: "Hold",
    reject: "Reject",
  };
  return labels[decision] || decision || "Decision";
}

function renderQueueList(container, items, options = {}) {
  const { emptyMessage = "No initiatives available.", primaryAction = "Open Assessment", actionPath = "assessment" } = options;
  container.innerHTML = "";

  if (items.length === 0) {
    container.appendChild(createElement("p", "hint", emptyMessage));
    return;
  }

  items.forEach((initiative) => {
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
    const primaryLink = createElement("a", "btn-link", primaryAction);
    primaryLink.href =
      actionPath === "board"
        ? `./board.html?id=${encodeURIComponent(initiative.id)}`
        : `./assessment.html?id=${encodeURIComponent(initiative.id)}`;
    const secondaryLink = createElement("a", "btn-link", actionPath === "board" ? "Open Assessment" : "Decision Review");
    secondaryLink.href =
      actionPath === "board"
        ? `./assessment.html?id=${encodeURIComponent(initiative.id)}`
        : `./board.html?id=${encodeURIComponent(initiative.id)}`;

    header.appendChild(title);
    header.appendChild(status);
    actions.appendChild(primaryLink);
    actions.appendChild(secondaryLink);
    article.appendChild(header);
    article.appendChild(summary);
    article.appendChild(updated);
    article.appendChild(actions);
    container.appendChild(article);
  });
}

function renderPriorityList(initiatives) {
  const top = sortPriority(initiatives).slice(0, 5);
  el.priorityCount.textContent = String(top.length);
  renderQueueList(el.priorityList, top, {
    emptyMessage: "No initiatives are standing out yet.",
    primaryAction: "Open Assessment",
    actionPath: "assessment",
  });
}

function renderDecisionQueue(initiatives) {
  const candidates = sortPriority(
    initiatives.filter((initiative) => initiative.status === "board_review" || initiative.status === "hold")
  ).slice(0, 5);
  el.decisionCount.textContent = String(candidates.length);
  renderQueueList(el.decisionQueueList, candidates, {
    emptyMessage: "Nothing is waiting on a decision right now.",
    primaryAction: "Open Decisions",
    actionPath: "board",
  });
}

function renderAlerts(initiatives) {
  el.alertList.innerHTML = "";
  const itemsNeedingClarity = [];

  const noOwner = initiatives.filter((i) => !i.owner || i.owner === "unassigned");
  if (noOwner.length > 0) itemsNeedingClarity.push(`${noOwner.length} initiative(s) still need a clear owner.`);

  const noScore = initiatives.filter((i) => i.finalScore == null && i.status !== "submitted" && i.status !== "triage");
  if (noScore.length > 0) itemsNeedingClarity.push(`${noScore.length} initiative(s) are in motion without a saved recommendation.`);

  const submitted = initiatives.filter((i) => i.status === "submitted");
  if (submitted.length > 0) itemsNeedingClarity.push(`${submitted.length} newly submitted initiative(s) should be reviewed and routed.`);

  const noGo = initiatives.filter((i) => String(i.priorityLane || "").toLowerCase().includes("do not prioritize"));
  if (noGo.length > 0) itemsNeedingClarity.push(`${noGo.length} initiative(s) may need reframing before they return to the portfolio.`); 

  if (itemsNeedingClarity.length === 0) {
    el.alertList.appendChild(createElement("li", "", "Nothing material is stuck right now."));
    return;
  }

  itemsNeedingClarity.forEach((message) => {
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
      `${initiative.id}: ${decisionLabel(initiative.boardDecision.decision)} (${formatDate(initiative.boardDecision.decidedAt)})`
    );
    el.decisionList.appendChild(li);
  });
}

function applyStats(initiatives, stats) {
  const byStatus = stats?.byStatus || {};
  const moveNow = initiatives.filter(
    (i) =>
      String(i.priorityLane || "").toLowerCase().includes("prioritize now") &&
      !["approved", "approved_with_conditions", "in_delivery", "closed", "rejected"].includes(i.status)
  ).length;
  const needDecision = initiatives.filter((i) => i.status === "board_review" || i.status === "hold").length;
  const needClarity = initiatives.filter(
    (i) =>
      i.status === "submitted" ||
      ((!i.owner || i.owner === "unassigned") && i.status !== "approved" && i.status !== "in_delivery")
  ).length;
  const approvedMomentum = (byStatus.approved || 0) + (byStatus.approved_with_conditions || 0);

  el.kpiNow.textContent = String(moveNow);
  el.kpiDecision.textContent = String(needDecision);
  el.kpiClarity.textContent = String(needClarity);
  el.kpiApproved.textContent = String(approvedMomentum);

  const total = initiatives.length;
  const topOpportunity = sortPriority(initiatives)[0];
  if (el.executiveSummary) {
    if (!total) {
      el.executiveSummary.textContent = "No initiatives in the portfolio yet.";
    } else if (!topOpportunity) {
      el.executiveSummary.textContent = `${total} initiatives are in the portfolio. Start routing the queue to create clearer priorities.`;
    } else {
      el.executiveSummary.textContent =
        `${moveNow} item(s) look ready to move now, ${needDecision} need a decision, and ${needClarity} still need clarity. ` +
        `Top current opportunity: ${topOpportunity.id} in ${topOpportunity.businessUnit || "the portfolio"}.`;
    }
  }
}

async function initDashboard() {
  try {
    const [stats, initiatives] = await Promise.all([getQueueStats(), listInitiatives()]);
    applyStats(initiatives, stats);
    renderPriorityList(initiatives);
    renderDecisionQueue(initiatives);
    renderAlerts(initiatives);
    renderRecentDecisions(initiatives);
  } catch (error) {
    const msg = error?.message || "Failed to load dashboard data.";
    el.priorityList.innerHTML = "";
    el.priorityList.appendChild(createElement("p", "hint status-warn", msg));
    el.decisionQueueList.innerHTML = "";
    el.decisionQueueList.appendChild(createElement("p", "hint", "Unable to load decision queue."));
    el.alertList.innerHTML = "";
    el.alertList.appendChild(createElement("li", "", "Unable to load focus items."));
    el.decisionList.innerHTML = "";
    el.decisionList.appendChild(createElement("li", "", "Unable to load recent decisions."));
    if (el.executiveSummary) {
      el.executiveSummary.textContent = msg;
    }
  }
}

void initDashboard();
