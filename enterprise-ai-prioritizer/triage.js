import {
  WORKFLOW_STATUSES,
  getQueueStats,
  listBusinessUnits,
  listInitiatives,
  listOwners,
} from "./initiative-store.js";

const el = {
  filterSearch: document.getElementById("filterSearch"),
  filterStatus: document.getElementById("filterStatus"),
  filterBusinessUnit: document.getElementById("filterBusinessUnit"),
  filterLane: document.getElementById("filterLane"),
  filterOwner: document.getElementById("filterOwner"),
  queueList: document.getElementById("queueList"),
  resultCount: document.getElementById("resultCount"),
};

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

async function populateStaticFilters() {
  const stats = await getQueueStats();
  WORKFLOW_STATUSES.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = `${status} (${stats.byStatus[status] || 0})`;
    el.filterStatus.appendChild(option);
  });

  const units = await listBusinessUnits();
  units.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit;
    el.filterBusinessUnit.appendChild(option);
  });

  const owners = await listOwners();
  owners.forEach((owner) => {
    const option = document.createElement("option");
    option.value = owner;
    option.textContent = owner;
    el.filterOwner.appendChild(option);
  });
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

async function renderList() {
  const filters = {
    search: el.filterSearch.value.trim(),
    status: el.filterStatus.value,
    businessUnit: el.filterBusinessUnit.value,
    lane: el.filterLane.value,
    owner: el.filterOwner.value,
  };
  let initiatives = [];
  try {
    initiatives = await listInitiatives(filters);
  } catch (error) {
    el.resultCount.textContent = "0";
    el.queueList.innerHTML = "";
    el.queueList.appendChild(
      createElement("p", "hint status-warn", error?.message || "Failed to load initiatives.")
    );
    return;
  }
  el.resultCount.textContent = `${initiatives.length}`;

  el.queueList.innerHTML = "";
  if (initiatives.length === 0) {
    el.queueList.appendChild(createElement("p", "hint", "No initiatives match current filters."));
    return;
  }

  initiatives.forEach((initiative) => {
    const article = createElement("article", "queue-item");
    const header = createElement("header");
    const title = createElement("h3", "", `${initiative.id} — ${initiative.title || "Untitled"}`);
    const status = createElement("span", "tag", initiative.status);
    const summary = createElement(
      "p",
      "hint",
      `BU: ${initiative.businessUnit || "N/A"} | Owner: ${initiative.owner || "unassigned"} | Lane: ${initiative.priorityLane || "Unassessed"}`
    );
    const dates = createElement(
      "p",
      "hint",
      `Created: ${formatDate(initiative.createdAt)} | Updated: ${formatDate(initiative.updatedAt)}`
    );
    const actions = createElement("div", "actions");
    const assessmentLink = createElement("a", "btn-link", "Open Assessment");
    assessmentLink.href = `./assessment.html?id=${encodeURIComponent(initiative.id)}`;
    const boardLink = createElement("a", "btn-link", "Open Board View");
    boardLink.href = `./board.html?id=${encodeURIComponent(initiative.id)}`;

    header.appendChild(title);
    header.appendChild(status);
    actions.appendChild(assessmentLink);
    actions.appendChild(boardLink);
    article.appendChild(header);
    article.appendChild(summary);
    article.appendChild(dates);
    article.appendChild(actions);
    el.queueList.appendChild(article);
  });
}

function bindEvents() {
  [el.filterSearch, el.filterStatus, el.filterBusinessUnit, el.filterLane, el.filterOwner].forEach((field) => {
    field.addEventListener("input", () => {
      void renderList();
    });
    field.addEventListener("change", () => {
      void renderList();
    });
  });
}

async function init() {
  try {
    await populateStaticFilters();
    bindEvents();
    await renderList();
  } catch (error) {
    el.resultCount.textContent = "0";
    el.queueList.innerHTML = "";
    el.queueList.appendChild(
      createElement("p", "hint status-warn", error?.message || "Failed to initialize triage queue.")
    );
  }
}

void init();
