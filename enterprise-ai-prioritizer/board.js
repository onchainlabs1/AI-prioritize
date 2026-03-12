import { listInitiatives, saveBoardDecision } from "./initiative-store.js";

const el = {
  boardList: document.getElementById("boardList"),
  boardCount: document.getElementById("boardCount"),
  boardStatus: document.getElementById("boardStatus"),
};

const ACTIVE_STATUSES = new Set(["board_review", "assessment", "hold"]);
const DECISIONS = [
  { value: "approve_now", label: "Approve now" },
  { value: "approve_after_discovery", label: "Approve after discovery" },
  { value: "hold", label: "Hold" },
  { value: "reject", label: "Reject" },
];

const targetId = new URLSearchParams(window.location.search).get("id");

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

function setBoardStatus(message, cssClass = "") {
  if (!el.boardStatus) {
    return;
  }
  el.boardStatus.textContent = message;
  el.boardStatus.classList.remove("status-ok", "status-warn");
  if (cssClass) {
    el.boardStatus.classList.add(cssClass);
  }
}

function boardCandidates() {
  return listInitiatives().filter((initiative) => {
    if (targetId && initiative.id === targetId) {
      return true;
    }
    return ACTIVE_STATUSES.has(initiative.status);
  });
}

function render() {
  const initiatives = boardCandidates();
  el.boardCount.textContent = `${initiatives.length}`;
  el.boardList.innerHTML = "";

  if (initiatives.length === 0) {
    el.boardList.appendChild(createElement("p", "hint", "No initiatives currently in board pipeline."));
    return;
  }

  initiatives.forEach((initiative) => {
    const score = initiative.finalScore ?? "N/A";
    const lane = initiative.priorityLane || "Unassessed";
    const rationale = initiative.assessment?.classification?.rationale || "No assessment rationale yet.";
    const selectedDecision = initiative.boardDecision?.decision || "approve_now";
    const article = createElement("article", `queue-item${targetId === initiative.id ? " focused" : ""}`);
    const header = createElement("header");
    const title = createElement("h3", "", `${initiative.id} — ${initiative.title || "Untitled"}`);
    const status = createElement("span", "tag", initiative.status);
    const summary = createElement(
      "p",
      "hint",
      `Lane: ${lane} | Score: ${score} | BU: ${initiative.businessUnit || "N/A"}`
    );
    const rationaleLine = createElement("p", "hint", rationale);

    const grid = createElement("div", "grid two");
    const decisionLabel = createElement("label");
    decisionLabel.append("Board decision");
    const decisionSelect = createElement("select");
    decisionSelect.setAttribute("data-decision-id", initiative.id);
    DECISIONS.forEach((item) => {
      const option = createElement("option", "", item.label);
      option.value = item.value;
      if (item.value === selectedDecision) {
        option.selected = true;
      }
      decisionSelect.appendChild(option);
    });
    decisionLabel.appendChild(decisionSelect);

    const rationaleLabel = createElement("label");
    rationaleLabel.append("Rationale");
    const rationaleInput = createElement("input");
    rationaleInput.setAttribute("data-rationale-id", initiative.id);
    rationaleInput.type = "text";
    rationaleInput.value = initiative.boardDecision?.rationale || "";
    rationaleLabel.appendChild(rationaleInput);

    grid.appendChild(decisionLabel);
    grid.appendChild(rationaleLabel);

    const actions = createElement("div", "actions");
    const saveButton = createElement("button", "", "Save decision");
    saveButton.type = "button";
    saveButton.addEventListener("click", () => {
      const decision = decisionSelect.value;
      const rationaleValue = rationaleInput.value || "";
      const updated = saveBoardDecision(initiative.id, decision, rationaleValue, "board.reviewer");
      if (!updated) {
        setBoardStatus(
          `Could not save decision for ${initiative.id}. Check workflow status and decision compatibility.`,
          "status-warn"
        );
        return;
      }
      setBoardStatus(`Board decision saved for ${initiative.id}. Current status: ${updated.status}.`, "status-ok");
      render();
    });

    const assessmentLink = createElement("a", "btn-link", "Open Assessment");
    assessmentLink.href = `./index.html?id=${encodeURIComponent(initiative.id)}`;

    header.appendChild(title);
    header.appendChild(status);
    actions.appendChild(saveButton);
    actions.appendChild(assessmentLink);
    article.appendChild(header);
    article.appendChild(summary);
    article.appendChild(rationaleLine);
    article.appendChild(grid);
    article.appendChild(actions);
    el.boardList.appendChild(article);
  });
}

render();
