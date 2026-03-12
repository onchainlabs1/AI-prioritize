import test from "node:test";
import assert from "node:assert/strict";

import {
  canTransitionStatus,
  createInitiative,
  normalizeInitiativePayload,
  validateInitiativePayload,
} from "../initiative-store.js";

function mockJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test.afterEach(() => {
  delete globalThis.fetch;
});

test("normalizeInitiativePayload trims and normalizes fields", () => {
  const normalized = normalizeInitiativePayload({
    title: "  Reduce    invoice work ",
    businessUnit: " Finance ",
    requesterName: " Alice ",
    requesterEmail: " ALICE@COMPANY.COM ",
    businessOwner: " CFO office ",
    problemDescription: "  Manual process ",
    expectedOutcome: " Faster cycle ",
    owner: " architecture.board ",
  });

  assert.equal(normalized.title, "Reduce invoice work");
  assert.equal(normalized.businessUnit, "Finance");
  assert.equal(normalized.requesterEmail, "alice@company.com");
  assert.equal(normalized.owner, "architecture.board");
});

test("validateInitiativePayload flags missing required fields and invalid email", () => {
  const result = validateInitiativePayload(
    normalizeInitiativePayload({
      title: "",
      businessUnit: "Ops",
      requesterName: "",
      requesterEmail: "invalid-email",
      businessOwner: "",
      problemDescription: "",
      expectedOutcome: "",
    })
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("title")));
  assert.ok(result.errors.some((error) => error.includes("requesterName")));
  assert.ok(result.errors.some((error) => error.includes("requesterEmail")));
});

test("canTransitionStatus follows configured workflow rules", () => {
  assert.equal(canTransitionStatus("submitted", "triage"), true);
  assert.equal(canTransitionStatus("submitted", "approved"), false);
  assert.equal(canTransitionStatus("board_review", "approved"), true);
  assert.equal(canTransitionStatus("closed", "triage"), false);
});

test("createInitiative calls API with normalized payload", async () => {
  let capturedUrl = "";
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return mockJsonResponse({ id: "AII-2026-0001", status: "submitted" }, 201);
  };

  const created = await createInitiative(
    {
      title: "  Service Desk Copilot ",
      businessUnit: " IT ",
      requesterName: " John ",
      requesterEmail: " JOHN@COMPANY.COM ",
      businessOwner: "Head of IT",
      problemDescription: "Manual classification and delayed responses.",
      expectedOutcome: "Faster triage and improved response quality.",
    },
    "john@company.com"
  );

  assert.equal(created.id, "AII-2026-0001");
  assert.equal(capturedUrl, "/api/initiatives");
  assert.equal(capturedOptions.method, "POST");

  const body = JSON.parse(capturedOptions.body);
  assert.equal(body.payload.title, "Service Desk Copilot");
  assert.equal(body.payload.businessUnit, "IT");
  assert.equal(body.payload.requesterEmail, "john@company.com");
});

test("createInitiative throws validation error before API call", async () => {
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };

  await assert.rejects(
    () =>
      createInitiative({
        title: "missing required",
      }),
    /Invalid initiative payload/
  );
});
