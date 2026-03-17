const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test, expect } = require("@playwright/test");

const DB_PATH = path.resolve(__dirname, "..", "data", "initiatives.db");

const CRITERIA_KEYS = [
  "businessImpact",
  "strategicAlignment",
  "timeToValue",
  "platformLeverage",
  "readiness",
  "unitEconomics",
  "operatingReadiness",
  "residualRisk",
];

function runPython(script, extraEnv = {}) {
  return execFileSync("python3", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      DB_PATH,
      ...extraEnv,
    },
  }).trim();
}

function cleanupInitiative(title) {
  runPython(
    `
import os
import sqlite3

title = os.environ["INITIATIVE_TITLE"]
conn = sqlite3.connect(os.environ["DB_PATH"])
conn.execute("PRAGMA foreign_keys = ON")
with conn:
    conn.execute("DELETE FROM initiatives WHERE title = ?", (title,))
conn.close()
`,
    { INITIATIVE_TITLE: title }
  );
}

function fetchInitiativeFromDb(initiativeId) {
  const raw = runPython(
    `
import json
import os
import sqlite3

initiative_id = os.environ["INITIATIVE_ID"]
conn = sqlite3.connect(os.environ["DB_PATH"])
conn.row_factory = sqlite3.Row
row = conn.execute(
    """
    SELECT
        i.id,
        i.status,
        i.priority_lane,
        i.final_score,
        i.assessment_json,
        i.board_decision_json,
        (
            SELECT COUNT(*)
            FROM audit_events a
            WHERE a.initiative_id = i.id
        ) AS audit_count
    FROM initiatives i
    WHERE i.id = ?
    """,
    (initiative_id,),
).fetchone()
if row is None:
    print("null")
else:
    print(json.dumps({
        "id": row["id"],
        "status": row["status"],
        "priorityLane": row["priority_lane"],
        "finalScore": row["final_score"],
        "assessment": json.loads(row["assessment_json"]) if row["assessment_json"] else None,
        "boardDecision": json.loads(row["board_decision_json"]) if row["board_decision_json"] else None,
        "auditCount": row["audit_count"],
    }))
conn.close()
`,
    { INITIATIVE_ID: initiativeId }
  );
  return JSON.parse(raw);
}

test("submit, triage, assess, approve, and persist the initiative end-to-end", async ({
  page,
  request,
}) => {
  const unique = Date.now();
  const title = `E2E Smoke ${unique}`;
  const requesterEmail = `e2e.smoke+${unique}@example.com`;
  let initiativeId = null;

  cleanupInitiative(title);

  try {
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();

    await page.goto("/submit.html");

    await page.locator("#title").fill(title);
    await page.locator("#businessUnit").fill("E2E Validation");
    await page.locator("#requesterName").fill("Codex Test Runner");
    await page.locator("#requesterEmail").fill(requesterEmail);
    await page.locator("#businessOwner").fill("Test Business Owner");
    await page.locator("#desiredTimeline").fill("Q2 2026");
    await page.locator("#kpiTarget").fill("Validate full workflow");
    await page.locator("#processFrequency").fill("Daily");
    await page.locator("#problemDescription").fill(
      "This synthetic initiative exists to validate the full UI, API, and database flow."
    );
    await page.locator("#expectedOutcome").fill(
      "An auditable end-to-end flow that persists correctly from submit to board decision."
    );
    await page.locator("#systemsInvolved").fill("ServiceNow, SQLite");
    await page.locator("#dataSensitivity").fill("Internal testing data");
    await page.locator("#attachments").fill("Generated automatically by Playwright.");
    await page.locator("#owner").fill("e2e.owner");

    await page.getByRole("button", { name: "Submit Initiative" }).click();

    const submitStatus = page.locator("#submitStatus");
    await expect(submitStatus).toContainText("submitted successfully");

    const statusText = await submitStatus.textContent();
    const match = statusText && statusText.match(/Initiative (AII-\d{4}-\d{4}) submitted successfully\./);
    expect(match).not.toBeNull();
    initiativeId = match[1];

    await page.goto("/triage.html");
    await page.locator("#filterSearch").fill(initiativeId);
    const triageItem = page.locator("article.queue-item").filter({ hasText: initiativeId });
    await expect(triageItem).toContainText(title);
    await expect(triageItem).toContainText("submitted");
    await triageItem.getByRole("link", { name: "Open Assessment" }).click();

    await expect(page).toHaveURL(new RegExp(`assessment\\.html\\?id=${initiativeId}$`));
    await expect(page.locator("#initiativeContext")).toContainText(initiativeId);

    await page.locator("#useCaseType").selectOption("assistant");
    await page.locator("#stage0Fit").selectOption("genai_rag");
    await page.locator("#gateRegulatory").selectOption("pass");
    await page.locator("#gateSecurity").selectOption("pass");
    await page.locator("#gateData").selectOption("pass");
    await page.locator("#gateEconomics").selectOption("pass");

    await page.locator("#scoringDetails summary").click();
    for (const key of CRITERIA_KEYS) {
      await page.locator(`#${key}`).fill("5");
      await page.locator(`#${key}Evidence`).selectOption("validated");
    }

    await page.getByRole("button", { name: "Calculate Priority" }).click();
    await expect(page.locator("#scoreValue")).toContainText("100/100");
    await expect(page.locator("#laneValue")).toContainText("Prioritize now");

    await page.getByRole("button", { name: "Save Assessment" }).click();
    await expect(page.locator("#assessmentStatus")).toContainText("Status moved to board_review");
    await expect(page.locator("#initiativeContext")).toContainText("Status: board_review");

    await page.goto(`/board.html?id=${initiativeId}`);
    const boardItem = page.locator("article.queue-item").filter({ hasText: initiativeId });
    await expect(boardItem).toContainText(title);
    await boardItem.locator(`[data-decision-id="${initiativeId}"]`).selectOption("approve_now");
    await boardItem.locator(`[data-rationale-id="${initiativeId}"]`).fill(
      "Approved by E2E smoke test."
    );
    await boardItem.getByRole("button", { name: "Save decision" }).click();

    await expect(page.locator("#boardStatus")).toContainText(`Board decision saved for ${initiativeId}`);
    await expect(page.locator("#boardStatus")).toContainText("Current status: approved");

    const apiResponse = await request.get(`/api/initiatives/${initiativeId}`);
    expect(apiResponse.ok()).toBeTruthy();
    const apiBody = await apiResponse.json();
    expect(apiBody.status).toBe("approved");
    expect(apiBody.finalScore).toBe(100);
    expect(apiBody.priorityLane).toBe("Prioritize now");
    expect(apiBody.boardDecision && apiBody.boardDecision.decision).toBe("approve_now");

    const dbRecord = fetchInitiativeFromDb(initiativeId);
    expect(dbRecord).not.toBeNull();
    expect(dbRecord.status).toBe("approved");
    expect(dbRecord.finalScore).toBe(100);
    expect(dbRecord.priorityLane).toBe("Prioritize now");
    expect(dbRecord.assessment && dbRecord.assessment.classification && dbRecord.assessment.classification.lane).toBe("Prioritize now");
    expect(dbRecord.boardDecision && dbRecord.boardDecision.decision).toBe("approve_now");
    expect(dbRecord.auditCount).toBeGreaterThanOrEqual(5);
  } finally {
    cleanupInitiative(title);
  }
});
