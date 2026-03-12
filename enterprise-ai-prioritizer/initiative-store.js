export const INITIATIVE_STORAGE_KEY = "ai-architect-decision-workbench.initiatives.v1";
const COUNTER_STORAGE_KEY = "ai-architect-decision-workbench.initiatives.counter.v1";
const MAX_AUDIT_ENTRIES = 200;

const MAX_LEN = {
  title: 140,
  businessUnit: 100,
  requesterName: 120,
  requesterEmail: 254,
  businessOwner: 120,
  kpiTarget: 180,
  processFrequency: 180,
  systemsInvolved: 500,
  dataSensitivity: 240,
  desiredTimeline: 120,
  attachments: 2000,
  owner: 120,
  problemDescription: 3000,
  expectedOutcome: 3000,
  rationale: 1000,
};

export const REQUIRED_INTAKE_FIELDS = [
  "title",
  "businessUnit",
  "requesterName",
  "requesterEmail",
  "businessOwner",
  "problemDescription",
  "expectedOutcome",
];

export const WORKFLOW_STATUSES = [
  "draft",
  "submitted",
  "triage",
  "assessment",
  "board_review",
  "approved",
  "approved_with_conditions",
  "hold",
  "rejected",
  "in_delivery",
  "closed",
];

export const BOARD_DECISIONS = [
  "approve_now",
  "approve_after_discovery",
  "hold",
  "reject",
];

export const STATUS_TRANSITIONS = {
  draft: ["submitted"],
  submitted: ["triage", "assessment", "board_review", "hold", "rejected"],
  triage: ["assessment", "hold", "rejected", "board_review"],
  assessment: ["board_review", "hold", "rejected"],
  board_review: ["approved", "approved_with_conditions", "hold", "rejected"],
  approved: ["in_delivery", "closed"],
  approved_with_conditions: ["in_delivery", "hold", "closed"],
  hold: ["triage", "assessment", "board_review", "rejected"],
  rejected: ["triage", "closed"],
  in_delivery: ["closed", "hold"],
  closed: [],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(status) {
  return WORKFLOW_STATUSES.includes(status) ? status : "draft";
}

function normalizeActor(actor) {
  return sanitizeShortText(actor, 120) || "system";
}

function sanitizeShortText(value, maxLen) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function sanitizeLongText(value, maxLen) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function sanitizeEmail(value) {
  return sanitizeShortText(value, MAX_LEN.requesterEmail).toLowerCase();
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sortByUpdatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const tsA = Date.parse(a?.updatedAt || a?.createdAt || 0);
    const tsB = Date.parse(b?.updatedAt || b?.createdAt || 0);
    return (Number.isFinite(tsB) ? tsB : 0) - (Number.isFinite(tsA) ? tsA : 0);
  });
}

export function canTransitionStatus(currentStatus, nextStatus) {
  const from = normalizeStatus(currentStatus);
  const to = normalizeStatus(nextStatus);
  if (from === to) {
    return true;
  }
  return safeArray(STATUS_TRANSITIONS[from]).includes(to);
}

export function normalizeInitiativePayload(payload = {}) {
  return {
    title: sanitizeShortText(payload.title, MAX_LEN.title),
    businessUnit: sanitizeShortText(payload.businessUnit, MAX_LEN.businessUnit),
    requesterName: sanitizeShortText(payload.requesterName, MAX_LEN.requesterName),
    requesterEmail: sanitizeEmail(payload.requesterEmail),
    businessOwner: sanitizeShortText(payload.businessOwner, MAX_LEN.businessOwner),
    problemDescription: sanitizeLongText(payload.problemDescription, MAX_LEN.problemDescription),
    expectedOutcome: sanitizeLongText(payload.expectedOutcome, MAX_LEN.expectedOutcome),
    kpiTarget: sanitizeShortText(payload.kpiTarget, MAX_LEN.kpiTarget),
    processFrequency: sanitizeShortText(payload.processFrequency, MAX_LEN.processFrequency),
    systemsInvolved: sanitizeLongText(payload.systemsInvolved, MAX_LEN.systemsInvolved),
    dataSensitivity: sanitizeShortText(payload.dataSensitivity, MAX_LEN.dataSensitivity),
    desiredTimeline: sanitizeShortText(payload.desiredTimeline, MAX_LEN.desiredTimeline),
    attachments: sanitizeLongText(payload.attachments, MAX_LEN.attachments),
    owner: sanitizeShortText(payload.owner, MAX_LEN.owner),
  };
}

export function validateInitiativePayload(payload = {}) {
  const errors = [];
  REQUIRED_INTAKE_FIELDS.forEach((field) => {
    if (!String(payload[field] || "").trim()) {
      errors.push(`${field} is required`);
    }
  });
  if (payload.requesterEmail && !isValidEmail(payload.requesterEmail)) {
    errors.push("requesterEmail must be a valid email address");
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

function nextCounter() {
  const raw = Number(localStorage.getItem(COUNTER_STORAGE_KEY) || "0");
  const next = Number.isFinite(raw) ? raw + 1 : 1;
  localStorage.setItem(COUNTER_STORAGE_KEY, String(next));
  return next;
}

export function generateInitiativeId() {
  const year = new Date().getFullYear();
  const seq = String(nextCounter()).padStart(4, "0");
  return `AII-${year}-${seq}`;
}

export function loadInitiatives() {
  try {
    const raw = localStorage.getItem(INITIATIVE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return safeArray(parsed);
  } catch {
    return [];
  }
}

export function saveInitiatives(initiatives) {
  localStorage.setItem(INITIATIVE_STORAGE_KEY, JSON.stringify(safeArray(initiatives)));
}

function appendAudit(initiative, entry) {
  const auditEntry = {
    timestamp: nowIso(),
    ...entry,
    actor: normalizeActor(entry.actor),
    action: sanitizeShortText(entry.action, 120),
    note: sanitizeLongText(entry.note, 500),
  };
  initiative.auditTrail = safeArray(initiative.auditTrail);
  initiative.auditTrail.unshift(auditEntry);
  if (initiative.auditTrail.length > MAX_AUDIT_ENTRIES) {
    initiative.auditTrail = initiative.auditTrail.slice(0, MAX_AUDIT_ENTRIES);
  }
}

export function createInitiative(payload, actor = "submitter") {
  const normalizedPayload = normalizeInitiativePayload(payload);
  const validation = validateInitiativePayload(normalizedPayload);
  if (!validation.valid) {
    throw new Error(`Invalid initiative payload: ${validation.errors.join("; ")}`);
  }

  const initiatives = loadInitiatives();
  const id = generateInitiativeId();
  const createdAt = nowIso();

  const initiative = {
    id,
    createdAt,
    updatedAt: createdAt,
    status: "submitted",
    owner: normalizedPayload.owner || "unassigned",
    priorityLane: "Unassessed",
    finalScore: null,
    stage0Classification: null,
    assessment: null,
    boardDecision: null,
    title: normalizedPayload.title,
    businessUnit: normalizedPayload.businessUnit,
    requesterName: normalizedPayload.requesterName,
    requesterEmail: normalizedPayload.requesterEmail,
    businessOwner: normalizedPayload.businessOwner,
    problemDescription: normalizedPayload.problemDescription,
    expectedOutcome: normalizedPayload.expectedOutcome,
    kpiTarget: normalizedPayload.kpiTarget,
    processFrequency: normalizedPayload.processFrequency,
    systemsInvolved: normalizedPayload.systemsInvolved,
    dataSensitivity: normalizedPayload.dataSensitivity,
    desiredTimeline: normalizedPayload.desiredTimeline,
    attachments: normalizedPayload.attachments,
    auditTrail: [],
  };

  appendAudit(initiative, {
    actor: normalizeActor(actor),
    action: "initiative_created",
    note: "Initiative submitted through intake form.",
  });

  initiatives.unshift(initiative);
  saveInitiatives(initiatives);
  return clone(initiative);
}

export function listInitiatives(filters = {}) {
  const search = sanitizeShortText(filters.search, 120).toLowerCase();
  const status = filters.status || "all";
  const businessUnit = filters.businessUnit || "all";
  const lane = String(filters.lane || "all").toLowerCase();
  const owner = filters.owner || "all";

  const list = sortByUpdatedAtDesc(loadInitiatives());
  return list.filter((initiative) => {
    if (status !== "all" && initiative.status !== status) {
      return false;
    }
    if (businessUnit !== "all" && initiative.businessUnit !== businessUnit) {
      return false;
    }
    if (lane !== "all" && (initiative.priorityLane || "").toLowerCase() !== lane) {
      return false;
    }
    if (owner !== "all" && initiative.owner !== owner) {
      return false;
    }
    if (search) {
      const haystack =
        `${initiative.id} ${initiative.title} ${initiative.businessUnit} ${initiative.businessOwner}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
}

export function getInitiativeById(id) {
  return clone(loadInitiatives().find((initiative) => initiative.id === id) || null);
}

export function updateInitiative(id, updater, actor = "system", action = "initiative_updated", note = "") {
  const initiatives = loadInitiatives();
  const idx = initiatives.findIndex((initiative) => initiative.id === id);
  if (idx < 0) {
    return null;
  }
  const initiative = initiatives[idx];
  const candidate = updater(clone(initiative));
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const updated = candidate;
  updated.id = initiative.id;
  updated.createdAt = initiative.createdAt;
  updated.status = normalizeStatus(updated.status || initiative.status);
  updated.updatedAt = nowIso();
  appendAudit(updated, { actor: normalizeActor(actor), action, note });
  initiatives[idx] = updated;
  saveInitiatives(initiatives);
  return clone(updated);
}

export function setInitiativeStatus(id, status, actor = "reviewer", note = "") {
  const normalized = normalizeStatus(status);
  const current = getInitiativeById(id);
  if (!current) {
    return null;
  }
  if (!canTransitionStatus(current.status, normalized)) {
    return null;
  }
  return updateInitiative(
    id,
    (initiative) => {
      initiative.status = normalized;
      return initiative;
    },
    actor,
    "status_changed",
    note || `Status updated to ${normalized}.`
  );
}

export function saveInitiativeAssessment(id, assessment, actor = "reviewer") {
  if (!assessment || typeof assessment !== "object") {
    return null;
  }
  return updateInitiative(
    id,
    (initiative) => {
      initiative.assessment = clone(assessment);
      initiative.stage0Classification = sanitizeShortText(assessment.stage0Choice, 64);
      initiative.priorityLane = sanitizeShortText(assessment.classification?.lane, 80) || "Unassessed";
      initiative.finalScore = Number.isFinite(Number(assessment.score)) ? Number(assessment.score) : null;
      if (initiative.status === "submitted" || initiative.status === "triage" || initiative.status === "assessment") {
        if (canTransitionStatus(initiative.status, "board_review")) {
          initiative.status = "board_review";
        }
      }
      return initiative;
    },
    actor,
    "assessment_saved",
    "Stage 0, gates, and scoring assessment saved."
  );
}

export function saveBoardDecision(id, decision, rationale, actor = "board_reviewer") {
  if (!BOARD_DECISIONS.includes(decision)) {
    return null;
  }
  const decisionToStatus = {
    approve_now: "approved",
    approve_after_discovery: "approved_with_conditions",
    hold: "hold",
    reject: "rejected",
  };
  const current = getInitiativeById(id);
  if (!current) {
    return null;
  }
  const nextStatus = decisionToStatus[decision];
  if (!canTransitionStatus(current.status, nextStatus)) {
    return null;
  }

  return updateInitiative(
    id,
    (initiative) => {
      initiative.boardDecision = {
        decision,
        rationale: sanitizeLongText(rationale, MAX_LEN.rationale),
        decidedAt: nowIso(),
        decidedBy: normalizeActor(actor),
      };
      initiative.status = nextStatus;
      return initiative;
    },
    actor,
    "board_decision_saved",
    `Board decision: ${decision}.`
  );
}

export function listBusinessUnits() {
  const units = new Set(
    loadInitiatives()
      .map((initiative) => initiative.businessUnit)
      .filter(Boolean)
  );
  return [...units].sort((a, b) => a.localeCompare(b));
}

export function listOwners() {
  const owners = new Set(loadInitiatives().map((initiative) => initiative.owner).filter(Boolean));
  return [...owners].sort((a, b) => a.localeCompare(b));
}

export function getQueueStats() {
  const initiatives = sortByUpdatedAtDesc(loadInitiatives());
  const byStatus = {};
  WORKFLOW_STATUSES.forEach((status) => {
    byStatus[status] = 0;
  });
  initiatives.forEach((initiative) => {
    const status = normalizeStatus(initiative.status);
    byStatus[status] += 1;
  });
  return {
    total: initiatives.length,
    byStatus,
  };
}
