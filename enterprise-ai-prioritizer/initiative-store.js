const API_BASE = "/api";

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

export function canTransitionStatus(currentStatus, nextStatus) {
  const from = WORKFLOW_STATUSES.includes(currentStatus) ? currentStatus : "draft";
  const to = WORKFLOW_STATUSES.includes(nextStatus) ? nextStatus : "draft";
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

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return body;
}

function toQueryString(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      params.set(key, normalized);
    }
  });
  const raw = params.toString();
  return raw ? `?${raw}` : "";
}

export async function createInitiative(payload, actor = "submitter") {
  const normalizedPayload = normalizeInitiativePayload(payload);
  const validation = validateInitiativePayload(normalizedPayload);
  if (!validation.valid) {
    throw new Error(`Invalid initiative payload: ${validation.errors.join("; ")}`);
  }

  return apiRequest("/initiatives", {
    method: "POST",
    body: JSON.stringify({
      payload: normalizedPayload,
      actor: sanitizeShortText(actor, 120) || "submitter",
    }),
  });
}

export async function listInitiatives(filters = {}) {
  return apiRequest(`/initiatives${toQueryString(filters)}`, {
    method: "GET",
  });
}

export async function getInitiativeById(id) {
  const normalizedId = sanitizeShortText(id, 64);
  if (!normalizedId) {
    return null;
  }
  return apiRequest(`/initiatives/${encodeURIComponent(normalizedId)}`, {
    method: "GET",
  });
}

export async function setInitiativeStatus(id, status, actor = "reviewer", note = "") {
  const normalizedId = sanitizeShortText(id, 64);
  if (!normalizedId) {
    return null;
  }
  return apiRequest(`/initiatives/${encodeURIComponent(normalizedId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status: sanitizeShortText(status, 64),
      actor: sanitizeShortText(actor, 120) || "reviewer",
      note: sanitizeLongText(note, 500),
    }),
  });
}

export async function saveInitiativeAssessment(id, assessment, actor = "reviewer") {
  const normalizedId = sanitizeShortText(id, 64);
  if (!normalizedId || !assessment || typeof assessment !== "object") {
    return null;
  }
  return apiRequest(`/initiatives/${encodeURIComponent(normalizedId)}/assessment`, {
    method: "POST",
    body: JSON.stringify({
      assessment,
      actor: sanitizeShortText(actor, 120) || "reviewer",
    }),
  });
}

export async function saveBoardDecision(id, decision, rationale, actor = "board_reviewer") {
  const normalizedId = sanitizeShortText(id, 64);
  if (!normalizedId) {
    return null;
  }
  return apiRequest(`/initiatives/${encodeURIComponent(normalizedId)}/board-decision`, {
    method: "POST",
    body: JSON.stringify({
      decision: sanitizeShortText(decision, 64),
      rationale: sanitizeLongText(rationale, 1000),
      actor: sanitizeShortText(actor, 120) || "board_reviewer",
    }),
  });
}

export async function listBusinessUnits() {
  const result = await apiRequest("/initiatives/meta", { method: "GET" });
  return Array.isArray(result?.businessUnits) ? result.businessUnits : [];
}

export async function listOwners() {
  const result = await apiRequest("/initiatives/meta", { method: "GET" });
  return Array.isArray(result?.owners) ? result.owners : [];
}

export async function getQueueStats() {
  const result = await apiRequest("/initiatives/stats", { method: "GET" });
  return {
    total: Number(result?.total || 0),
    byStatus: result?.byStatus || {},
  };
}
