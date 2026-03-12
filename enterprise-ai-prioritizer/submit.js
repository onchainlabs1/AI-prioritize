import { createInitiative } from "./initiative-store.js";

const form = document.getElementById("submitForm");
const statusEl = document.getElementById("submitStatus");

function readValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  statusEl.classList.remove("status-ok", "status-warn");

  try {
    const initiative = createInitiative(
      {
        title: readValue("title"),
        businessUnit: readValue("businessUnit"),
        requesterName: readValue("requesterName"),
        requesterEmail: readValue("requesterEmail"),
        businessOwner: readValue("businessOwner"),
        problemDescription: readValue("problemDescription"),
        expectedOutcome: readValue("expectedOutcome"),
        kpiTarget: readValue("kpiTarget"),
        processFrequency: readValue("processFrequency"),
        systemsInvolved: readValue("systemsInvolved"),
        dataSensitivity: readValue("dataSensitivity"),
        desiredTimeline: readValue("desiredTimeline"),
        attachments: readValue("attachments"),
        owner: readValue("owner"),
      },
      readValue("requesterEmail") || "submitter"
    );

    form.reset();
    statusEl.textContent = `Initiative ${initiative.id} submitted successfully.`;
    statusEl.classList.add("status-ok");
  } catch (error) {
    statusEl.textContent = error?.message || "Failed to submit initiative.";
    statusEl.classList.add("status-warn");
  }
});
