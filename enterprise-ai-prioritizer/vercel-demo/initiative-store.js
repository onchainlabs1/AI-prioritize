const STORAGE_KEY = "ai-prioritizer-demo:initiatives:v1";
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

export const BOARD_DECISIONS = ["approve_now", "approve_after_discovery", "hold", "reject"];

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

const DECISION_TO_STATUS = {
  approve_now: "approved",
  approve_after_discovery: "approved_with_conditions",
  hold: "hold",
  reject: "rejected",
};

let memoryStore = null;

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

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function shiftIso(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeStatus(value) {
  const raw = sanitizeShortText(value, 64);
  return WORKFLOW_STATUSES.includes(raw) ? raw : "draft";
}

export function canTransitionStatus(currentStatus, nextStatus) {
  const from = normalizeStatus(currentStatus);
  const to = normalizeStatus(nextStatus);
  if (from === to) {
    return true;
  }
  return Array.isArray(STATUS_TRANSITIONS[from]) && STATUS_TRANSITIONS[from].includes(to);
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

function appendAudit(initiative, actor, action, note, payload = null) {
  initiative.auditTrail = Array.isArray(initiative.auditTrail) ? initiative.auditTrail : [];
  initiative.auditTrail.unshift({
    timestamp: nowIso(),
    actor: sanitizeShortText(actor, 120) || "system",
    action: sanitizeShortText(action, 120) || "updated",
    note: sanitizeLongText(note, 500),
    payload,
  });
  initiative.auditTrail = initiative.auditTrail.slice(0, MAX_AUDIT_ENTRIES);
}

function stripAudit(initiative) {
  const copy = deepCopy(initiative);
  delete copy.auditTrail;
  return copy;
}

function createSeedData() {
  const approvedAssessment = {
    savedAt: shiftIso(10),
    stage0Choice: "genai_rag",
    project: {
      projectName: "Policy Assistant",
      businessUnit: "Operations",
      useCaseType: "assistant",
      region: "eu-us",
    },
    score: 82,
    rawScore: 84,
    confidenceIndex: 78,
    classification: {
      lane: "Prioritize now",
      blocked: false,
      rationale: "Strong value signal, clear use case, and manageable delivery constraints.",
    },
  };

  const boardReadyAssessment = {
    savedAt: shiftIso(4),
    stage0Choice: "agentic",
    project: {
      projectName: "Service Recovery Copilot",
      businessUnit: "Customer Care",
      useCaseType: "customer_support",
      region: "global",
    },
    score: 74,
    rawScore: 76,
    confidenceIndex: 71,
    classification: {
      lane: "Plan next",
      blocked: false,
      rationale: "Good momentum and a credible path, but needs a sharper rollout plan.",
    },
  };

  const holdAssessment = {
    savedAt: shiftIso(2),
    stage0Choice: "deterministic",
    project: {
      projectName: "Invoice Exception Routing",
      businessUnit: "Finance",
      useCaseType: "automation",
      region: "eu",
    },
    score: 61,
    rawScore: 67,
    confidenceIndex: 63,
    classification: {
      lane: "Incubate",
      blocked: false,
      rationale: "Interesting opportunity, but ownership and data prep still need work.",
    },
  };

  return [
    {
      id: "AII-2026-0001",
      createdAt: shiftIso(14),
      updatedAt: shiftIso(8),
      status: "approved_with_conditions",
      owner: "Maria Novak",
      priorityLane: "Prioritize now",
      finalScore: 82,
      stage0Classification: "genai_rag",
      assessment: approvedAssessment,
      boardDecision: {
        decision: "approve_after_discovery",
        rationale: "Proceed with a 4-week discovery focused on source quality and adoption plan.",
        decidedAt: shiftIso(8),
        decidedBy: "board.reviewer",
      },
      title: "Policy Assistant For Shared Services",
      businessUnit: "Operations",
      requesterName: "Elena Varga",
      requesterEmail: "elena.varga@example.com",
      businessOwner: "Pavel Horvat",
      problemDescription: "Employees lose time searching policies and asking repetitive support questions.",
      expectedOutcome: "Cut internal support turnaround time and reduce repeat requests.",
      kpiTarget: "Reduce average resolution time by 25%",
      processFrequency: "Daily",
      systemsInvolved: "SharePoint, ServiceNow, Confluence",
      dataSensitivity: "Internal only",
      desiredTimeline: "Q2 pilot",
      attachments: "",
      auditTrail: [
        {
          timestamp: shiftIso(14),
          actor: "elena.varga@example.com",
          action: "initiative_created",
          note: "Initiative submitted through intake form.",
          payload: null,
        },
        {
          timestamp: shiftIso(10),
          actor: "reviewer",
          action: "assessment_saved",
          note: "Stage 0, gates, and scoring assessment saved.",
          payload: null,
        },
        {
          timestamp: shiftIso(8),
          actor: "board.reviewer",
          action: "board_decision_saved",
          note: "Board decision: approve_after_discovery.",
          payload: null,
        },
      ],
    },
    {
      id: "AII-2026-0002",
      createdAt: shiftIso(6),
      updatedAt: shiftIso(1),
      status: "board_review",
      owner: "Tomas Szabo",
      priorityLane: "Plan next",
      finalScore: 74,
      stage0Classification: "agentic",
      assessment: boardReadyAssessment,
      boardDecision: null,
      title: "Service Recovery Copilot",
      businessUnit: "Customer Care",
      requesterName: "Irene Foster",
      requesterEmail: "irene.foster@example.com",
      businessOwner: "Levente Kiss",
      problemDescription: "Escalations take too long because teams have to stitch together previous cases manually.",
      expectedOutcome: "Accelerate case recovery plans and surface next best actions.",
      kpiTarget: "Reduce escalation handling time by 20%",
      processFrequency: "Continuous",
      systemsInvolved: "Zendesk, CRM, knowledge base",
      dataSensitivity: "Customer operational data",
      desiredTimeline: "Next quarter",
      attachments: "",
      auditTrail: [
        {
          timestamp: shiftIso(6),
          actor: "irene.foster@example.com",
          action: "initiative_created",
          note: "Initiative submitted through intake form.",
          payload: null,
        },
        {
          timestamp: shiftIso(1),
          actor: "reviewer",
          action: "assessment_saved",
          note: "Stage 0, gates, and scoring assessment saved.",
          payload: null,
        },
      ],
    },
    {
      id: "AII-2026-0003",
      createdAt: shiftIso(1),
      updatedAt: shiftIso(1),
      status: "submitted",
      owner: "unassigned",
      priorityLane: "Unassessed",
      finalScore: null,
      stage0Classification: null,
      assessment: null,
      boardDecision: null,
      title: "Claims Intake Triage",
      businessUnit: "Insurance Ops",
      requesterName: "Nora Sandor",
      requesterEmail: "nora.sandor@example.com",
      businessOwner: "Daniel Roman",
      problemDescription: "Manual claims intake triage creates delays and inconsistent routing.",
      expectedOutcome: "Speed up intake routing and reduce preventable handoffs.",
      kpiTarget: "Improve first-touch routing accuracy",
      processFrequency: "Daily",
      systemsInvolved: "Claims platform, email",
      dataSensitivity: "PII and claims data",
      desiredTimeline: "Pilot in 6 weeks",
      attachments: "",
      auditTrail: [
        {
          timestamp: shiftIso(1),
          actor: "nora.sandor@example.com",
          action: "initiative_created",
          note: "Initiative submitted through intake form.",
          payload: null,
        },
      ],
    },
    {
      id: "AII-2026-0004",
      createdAt: shiftIso(9),
      updatedAt: shiftIso(2),
      status: "hold",
      owner: "Ava Green",
      priorityLane: "Incubate",
      finalScore: 61,
      stage0Classification: "deterministic",
      assessment: holdAssessment,
      boardDecision: {
        decision: "hold",
        rationale: "Pause until source systems and ownership model are confirmed.",
        decidedAt: shiftIso(2),
        decidedBy: "board.reviewer",
      },
      title: "Invoice Exception Routing",
      businessUnit: "Finance",
      requesterName: "Jonas Ward",
      requesterEmail: "jonas.ward@example.com",
      businessOwner: "Marta Fekete",
      problemDescription: "Exception handling is too manual and queues spike at month end.",
      expectedOutcome: "Route invoice exceptions faster with clear ownership and SLA visibility.",
      kpiTarget: "Reduce backlog by 30%",
      processFrequency: "Month-end heavy",
      systemsInvolved: "ERP, AP inbox, shared mailbox",
      dataSensitivity: "Financial operational data",
      desiredTimeline: "After ERP cleanup",
      attachments: "",
      auditTrail: [
        {
          timestamp: shiftIso(9),
          actor: "jonas.ward@example.com",
          action: "initiative_created",
          note: "Initiative submitted through intake form.",
          payload: null,
        },
        {
          timestamp: shiftIso(3),
          actor: "reviewer",
          action: "assessment_saved",
          note: "Stage 0, gates, and scoring assessment saved.",
          payload: null,
        },
        {
          timestamp: shiftIso(2),
          actor: "board.reviewer",
          action: "board_decision_saved",
          note: "Board decision: hold.",
          payload: null,
        },
      ],
    },
  ];
}

function readPersistedItems() {
  if (typeof window === "undefined" || !window.localStorage) {
    if (!memoryStore) {
      memoryStore = createSeedData();
    }
    return deepCopy(memoryStore);
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createSeedData();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return deepCopy(seeded);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("invalid demo store");
    }
    return deepCopy(parsed);
  } catch {
    const seeded = createSeedData();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return deepCopy(seeded);
  }
}

function writePersistedItems(items) {
  const safeCopy = deepCopy(items);
  memoryStore = safeCopy;
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeCopy));
  }
}

function parseSequence(id) {
  const match = /^AII-(\d{4})-(\d{4,})$/.exec(String(id || ""));
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    seq: Number(match[2]),
  };
}

function nextInitiativeId(items) {
  const currentYear = new Date().getUTCFullYear();
  const maxSeq = items.reduce((highest, initiative) => {
    const parsed = parseSequence(initiative.id);
    if (!parsed || parsed.year !== currentYear) {
      return highest;
    }
    return Math.max(highest, parsed.seq);
  }, 0);
  return `AII-${currentYear}-${String(maxSeq + 1).padStart(4, "0")}`;
}

function findInitiative(items, id) {
  return items.find((initiative) => initiative.id === id) || null;
}

function applyFilters(items, filters = {}) {
  const search = sanitizeShortText(filters.search, 120).toLowerCase();
  const status = sanitizeShortText(filters.status, 32);
  const businessUnit = sanitizeShortText(filters.businessUnit, 100);
  const lane = sanitizeShortText(filters.lane, 80);
  const owner = sanitizeShortText(filters.owner, 120);

  return items
    .filter((initiative) => {
      if (status && status !== "all" && initiative.status !== status) {
        return false;
      }
      if (businessUnit && businessUnit !== "all" && initiative.businessUnit !== businessUnit) {
        return false;
      }
      if (lane && lane !== "all" && String(initiative.priorityLane || "").toLowerCase() !== lane.toLowerCase()) {
        return false;
      }
      if (owner && owner !== "all" && initiative.owner !== owner) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = [
        initiative.id,
        initiative.title,
        initiative.businessUnit,
        initiative.businessOwner,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function createInitiative(payload, actor = "submitter") {
  const normalizedPayload = normalizeInitiativePayload(payload);
  const validation = validateInitiativePayload(normalizedPayload);
  if (!validation.valid) {
    throw new Error(`Invalid initiative payload: ${validation.errors.join("; ")}`);
  }

  const items = readPersistedItems();
  const timestamp = nowIso();
  const initiative = {
    id: nextInitiativeId(items),
    createdAt: timestamp,
    updatedAt: timestamp,
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
  appendAudit(initiative, actor, "initiative_created", "Initiative submitted through intake form.");
  items.unshift(initiative);
  writePersistedItems(items);
  return deepCopy(initiative);
}

export async function listInitiatives(filters = {}) {
  const items = readPersistedItems();
  return applyFilters(items, filters).map(stripAudit);
}

export async function getInitiativeById(id) {
  const normalizedId = sanitizeShortText(id, 64);
  if (!normalizedId) {
    return null;
  }
  const items = readPersistedItems();
  const initiative = findInitiative(items, normalizedId);
  return initiative ? deepCopy(initiative) : null;
}

export async function setInitiativeStatus(id, status, actor = "reviewer", note = "") {
  const normalizedId = sanitizeShortText(id, 64);
  if (!normalizedId) {
    return null;
  }

  const items = readPersistedItems();
  const initiative = findInitiative(items, normalizedId);
  if (!initiative) {
    return null;
  }

  const nextStatus = normalizeStatus(status);
  if (!canTransitionStatus(initiative.status, nextStatus)) {
    throw new Error(`Invalid status transition: ${initiative.status} -> ${nextStatus}`);
  }

  initiative.status = nextStatus;
  initiative.updatedAt = nowIso();
  appendAudit(
    initiative,
    actor,
    "status_changed",
    sanitizeLongText(note, 500) || `Status updated to ${nextStatus}.`
  );
  writePersistedItems(items);
  return deepCopy(initiative);
}

export async function saveInitiativeAssessment(id, assessment, actor = "reviewer") {
  const normalizedId = sanitizeShortText(id, 64);
  if (!normalizedId || !assessment || typeof assessment !== "object") {
    return null;
  }

  const items = readPersistedItems();
  const initiative = findInitiative(items, normalizedId);
  if (!initiative) {
    return null;
  }

  const lane = sanitizeShortText(assessment?.classification?.lane, 80) || "Unassessed";
  const score = Number.isFinite(Number(assessment?.score)) ? Number(assessment.score) : null;
  const stage0Choice = sanitizeShortText(assessment?.stage0Choice, 64) || null;
  let nextStatus = initiative.status;
  if (
    ["submitted", "triage", "assessment"].includes(initiative.status) &&
    canTransitionStatus(initiative.status, "board_review")
  ) {
    nextStatus = "board_review";
  }

  initiative.updatedAt = nowIso();
  initiative.status = nextStatus;
  initiative.stage0Classification = stage0Choice;
  initiative.priorityLane = lane;
  initiative.finalScore = score;
  initiative.assessment = deepCopy(assessment);
  appendAudit(initiative, actor, "assessment_saved", "Stage 0, gates, and scoring assessment saved.");
  writePersistedItems(items);
  return deepCopy(initiative);
}

export async function saveBoardDecision(id, decision, rationale, actor = "board_reviewer") {
  const normalizedId = sanitizeShortText(id, 64);
  const normalizedDecision = sanitizeShortText(decision, 64);
  const normalizedRationale = sanitizeLongText(rationale, MAX_LEN.rationale);
  if (!normalizedId) {
    return null;
  }
  if (!BOARD_DECISIONS.includes(normalizedDecision)) {
    throw new Error("Invalid board decision");
  }

  const items = readPersistedItems();
  const initiative = findInitiative(items, normalizedId);
  if (!initiative) {
    return null;
  }

  const nextStatus = DECISION_TO_STATUS[normalizedDecision];
  if (!canTransitionStatus(initiative.status, nextStatus)) {
    throw new Error(`Invalid status transition: ${initiative.status} -> ${nextStatus}`);
  }

  initiative.updatedAt = nowIso();
  initiative.status = nextStatus;
  initiative.boardDecision = {
    decision: normalizedDecision,
    rationale: normalizedRationale,
    decidedAt: nowIso(),
    decidedBy: sanitizeShortText(actor, 120) || "board_reviewer",
  };
  appendAudit(
    initiative,
    actor,
    "board_decision_saved",
    `Board decision: ${normalizedDecision}.`
  );
  writePersistedItems(items);
  return deepCopy(initiative);
}

export async function listBusinessUnits() {
  const items = readPersistedItems();
  return Array.from(
    new Set(items.map((initiative) => initiative.businessUnit).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

export async function listOwners() {
  const items = readPersistedItems();
  return Array.from(new Set(items.map((initiative) => initiative.owner).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export async function getQueueStats() {
  const items = readPersistedItems();
  const byStatus = Object.fromEntries(WORKFLOW_STATUSES.map((status) => [status, 0]));
  items.forEach((initiative) => {
    if (Object.prototype.hasOwnProperty.call(byStatus, initiative.status)) {
      byStatus[initiative.status] += 1;
    }
  });
  return {
    total: items.length,
    byStatus,
  };
}

export function resetDemoData() {
  const seeded = createSeedData();
  writePersistedItems(seeded);
  return deepCopy(seeded);
}
