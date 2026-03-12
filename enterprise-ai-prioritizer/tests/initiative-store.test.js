import test from "node:test";
import assert from "node:assert/strict";

import {
  canTransitionStatus,
  createInitiative,
  getInitiativeById,
  listInitiatives,
  normalizeInitiativePayload,
  saveBoardDecision,
  saveInitiativeAssessment,
  setInitiativeStatus,
  validateInitiativePayload,
} from "../initiative-store.js";

function localStorageMock() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test.beforeEach(() => {
  globalThis.localStorage = localStorageMock();
});

test.afterEach(() => {
  delete globalThis.localStorage;
});

test("createInitiative stores a submitted intake record with audit trail", () => {
  const created = createInitiative({
    title: "Automate contract summarization",
    businessUnit: "Legal",
    requesterName: "Ana",
    requesterEmail: "ana@company.com",
    businessOwner: "Head of Legal Ops",
    problemDescription: "Contract review and summary are manually prepared.",
    expectedOutcome: "Faster contract turnaround and reduced legal effort.",
  });

  assert.match(created.id, /^AII-\d{4}-\d{4}$/);
  assert.equal(created.status, "submitted");
  assert.equal(created.priorityLane, "Unassessed");
  assert.equal(created.auditTrail.length, 1);
  assert.equal(created.auditTrail[0].action, "initiative_created");

  const listed = listInitiatives();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);
});

test("assessment save updates lane/score and routes initiative to board_review", () => {
  const created = createInitiative({
    title: "Service desk copilot",
    businessUnit: "IT",
    requesterName: "John Reviewer",
    requesterEmail: "john.reviewer@company.com",
    businessOwner: "Head of IT",
    problemDescription: "Tickets are manually triaged and responses are inconsistent.",
    expectedOutcome: "Faster and more consistent service desk responses.",
  });

  const updated = saveInitiativeAssessment(created.id, {
    stage0Choice: "genai_rag",
    classification: {
      tier: "A",
      lane: "Prioritize now",
      css: "good",
      rationale: "Strong value and readiness.",
    },
    score: 82.5,
  });

  assert.ok(updated);
  assert.equal(updated.status, "board_review");
  assert.equal(updated.stage0Classification, "genai_rag");
  assert.equal(updated.priorityLane, "Prioritize now");
  assert.equal(updated.finalScore, 82.5);
  assert.equal(updated.auditTrail[0].action, "assessment_saved");
});

test("board decision persists rationale and maps to final workflow status", () => {
  const created = createInitiative({
    title: "Finance close variance assistant",
    businessUnit: "Finance",
    requesterName: "Maria Controller",
    requesterEmail: "maria.controller@company.com",
    businessOwner: "Finance VP",
    problemDescription: "Monthly close variance checks are manual and delayed.",
    expectedOutcome: "Automated variance checks with early anomaly detection.",
  });

  setInitiativeStatus(created.id, "board_review");
  const decided = saveBoardDecision(
    created.id,
    "approve_after_discovery",
    "Approve discovery sprint before full build.",
    "board.member"
  );

  assert.ok(decided);
  assert.equal(decided.status, "approved_with_conditions");
  assert.equal(decided.boardDecision?.decision, "approve_after_discovery");
  assert.equal(decided.boardDecision?.rationale, "Approve discovery sprint before full build.");

  const reloaded = getInitiativeById(created.id);
  assert.equal(reloaded.status, "approved_with_conditions");
  assert.equal(reloaded.auditTrail[0].action, "board_decision_saved");
});

test("validateInitiativePayload flags missing required fields and invalid email", () => {
  const payload = normalizeInitiativePayload({
    title: "",
    businessUnit: "Operations",
    requesterName: "",
    requesterEmail: "not-an-email",
    businessOwner: "",
    problemDescription: "",
    expectedOutcome: "",
  });
  const result = validateInitiativePayload(payload);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("title")));
  assert.ok(result.errors.some((error) => error.includes("requesterName")));
  assert.ok(result.errors.some((error) => error.includes("requesterEmail")));
});

test("createInitiative sanitizes and normalizes core fields", () => {
  const created = createInitiative({
    title: "  Reduce     invoice manual work   ",
    businessUnit: " Finance  ",
    requesterName: "  Alice  ",
    requesterEmail: "  ALICE@COMPANY.COM ",
    businessOwner: "  CFO Office ",
    problemDescription: "  Too many manual steps. ",
    expectedOutcome: "  Faster cycle time. ",
    owner: "  architecture.board ",
  });

  assert.equal(created.title, "Reduce invoice manual work");
  assert.equal(created.businessUnit, "Finance");
  assert.equal(created.requesterEmail, "alice@company.com");
  assert.equal(created.owner, "architecture.board");
});

test("createInitiative throws for invalid intake payload", () => {
  assert.throws(
    () =>
      createInitiative({
        title: "Incomplete request",
        businessUnit: "Operations",
      }),
    /Invalid initiative payload/
  );
});

test("setInitiativeStatus blocks invalid transitions", () => {
  const created = createInitiative({
    title: "Order exception assistant",
    businessUnit: "Operations",
    requesterName: "Paul",
    requesterEmail: "paul@company.com",
    businessOwner: "Ops Director",
    problemDescription: "Order exceptions are escalated too late.",
    expectedOutcome: "Earlier exception detection and routing.",
  });

  const invalidJump = setInitiativeStatus(created.id, "approved");
  assert.equal(invalidJump, null);

  const validStep = setInitiativeStatus(created.id, "triage");
  assert.ok(validStep);
  assert.equal(validStep.status, "triage");
});

test("canTransitionStatus follows configured workflow rules", () => {
  assert.equal(canTransitionStatus("submitted", "triage"), true);
  assert.equal(canTransitionStatus("submitted", "approved"), false);
  assert.equal(canTransitionStatus("board_review", "approved"), true);
  assert.equal(canTransitionStatus("closed", "triage"), false);
});
