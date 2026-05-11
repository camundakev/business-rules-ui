## Stack defaults
- Frontend: React + Vite
- Workers: Node.js (@camunda8/sdk)
- Deploy target: Camunda SaaS (cloud.camunda.io)
- DMN editor: dmn-js (bpmn-io/dmn-js)
- All Camunda API calls proxied via Vite — never call cluster URL directly from frontend

# NYL Lead Programs Management — Camunda PoC Plan
**Handoff document for Claude Code / VS Code development**

> **Note for Claude Code:** This plan is intentionally written at the intent level for all Camunda API interactions. Do not use hardcoded endpoint paths from this document — use the `camunda-ai-dev-kit` slash commands and the `camunda-docs` MCP to resolve correct Camunda 8 REST API patterns, `@camunda8/sdk` usage, and deployment conventions. The plan specifies *what* each capability must do; the dev kit determines *how*.

---

## Engagement context

- **Customer:** New York Life (NYL)
- **Vertical:** Insurance / Field Sales Lead Management
- **Key personas:** Business users (non-IT), Enterprise Architects, CTO
- **Partner objective:** Prove that Camunda can replace a proprietary rule engine — and that NYL's business users can create, edit, deploy, and execute business rules entirely through a custom frontend, with zero reliance on Camunda Web Modeler or any Camunda-native UI
- **Demo format:** SE-guided live demo first; NYL team then accesses sandbox independently
- **Deployment target:** Camunda SaaS (cloud.camunda.io)
- **Timeframe:** 2-week build

---

## The "wow moment" (demo climax)

Two moments, sequenced:

1. **Side-by-side rule change:** A business user edits a DMN eligibility condition in the custom Rule Manager UI (e.g. changes Agent Tenure requirement from "1st Prior" to "Contract <= 6 months"), hits Deploy, then immediately re-runs the same agent through the Agent Simulator — and gets a different eligibility outcome. No IT, no redeployment, no Camunda UI touched.

2. **Full end-to-end run:** A single agent record flows through the BPMN process — eligibility evaluated by DMN, a personalized recommendation fires if eligible, and auto-unenrollment triggers if ineligibility conditions are met — all visible in the Agent Simulator with outcome cards showing results of each step.

---

## Architecture overview

```
React + Vite Frontend
├── Rule Manager tab
│   ├── List deployed DMN decision definitions (Camunda API)
│   ├── View/edit DMN XML in a table-friendly UI
│   └── Deploy new DMN version (Camunda API)
└── Agent Simulator tab
    ├── Select a mock agent (hardcoded 5 agents)
    ├── Select a Lead Program to evaluate against
    ├── Trigger BPMN process instance (Camunda API)
    └── Show outcome: Eligible / Recommendation / Unenrolled + audit trail

Camunda SaaS (cloud.camunda.io)
├── BPMN process: lead-program-evaluation.bpmn
│   ├── Start → Evaluate Eligibility (Business Rule Task → DMN)
│   ├── Gateway: Eligible?
│   │   ├── Yes → Evaluate Recommendations (Business Rule Task → DMN)
│   │   └── No → Evaluate Unenrollment (Business Rule Task → DMN)
│   │       └── Gateway: Unenroll?
│   │           ├── Yes → Auto-Unenroll Task → End
│   │           └── No → Hold Status Task → End
│   └── End
├── DMN: eligibility-rules.dmn (1 decision table)
├── DMN: recommendation-rules.dmn (1 decision table)
└── DMN: unenrollment-rules.dmn (1 decision table)
```

All frontend interactions with Camunda go exclusively through the Camunda 8 REST API (orchestration cluster endpoint). No Zeebe gRPC client. No Web Modeler API.

---

## Camunda assets to build

### 1. BPMN: `lead-program-evaluation.bpmn`

A single process covering all three NYL use cases. Key elements:

- **Start event:** receives agent attributes as process variables (JSON payload)
- **Business Rule Task 1 — "Evaluate Eligibility":** calls `eligibility-rules` DMN, outputs `isEligible` (boolean)
- **Exclusive gateway:** branches on `isEligible`
- **Business Rule Task 2 — "Generate Recommendation":** (eligible path) calls `recommendation-rules` DMN, outputs `recommendationText`, `recommendationLink`
- **Business Rule Task 3 — "Evaluate Unenrollment":** (ineligible path) calls `unenrollment-rules` DMN, outputs `shouldUnenroll` (boolean)
- **Exclusive gateway:** branches on `shouldUnenroll`
- **Service Task — "Auto-Unenroll Agent":** sets `agentStatus = "Unenrolled"` (job worker)
- **Service Task — "Hold Agent Status":** sets `agentStatus = "Pending Review"` (job worker)
- End events with named result context

Process variable schema (passed at start):
```json
{
  "agentCode": "string",
  "agentName": "string",
  "leadProgram": "string",
  "agentTenure": "string",
  "agentStatus": "string",
  "complianceRating": "number",
  "agentProactiveStatus": "string",
  "rollingFYC": "number",
  "councilStatus": "string",
  "licenseType": "string",
  "attemptRate": "number",
  "monthsBehindProactive": "string",
  "nylicuTraining": "string"
}
```

---

### 2. DMN: `eligibility-rules.dmn`

**Decision ID:** `eligibility-rules`
**Hit policy:** FIRST (first matching row wins)
**Inputs (use subset of full attribute list — keep to 4-5 for the PoC):**

| Input expression | Label | Type |
|---|---|---|
| `agentStatus` | Agent Status | string |
| `agentTenure` | Agent Tenure | string |
| `complianceRating` | Compliance Rating | number |
| `agentProactiveStatus` | Proactive Status | string |
| `licenseType` | License Type | string |

**Output:**
| Output expression | Label | Type |
|---|---|---|
| `isEligible` | Eligible | boolean |
| `ineligibilityReason` | Reason | string |

**Seed rows (minimum viable table for demo):**

| agentStatus | agentTenure | complianceRating | agentProactiveStatus | licenseType | isEligible | ineligibilityReason |
|---|---|---|---|---|---|---|
| "Active" | "1st Prior" | >= 3 | "Proactive" | "Life + Health" | true | — |
| "Active" | "Contract <= 6 months" | — | — | — | false | "Tenure too short" |
| "Active Reinstated" | — | < 3 | — | — | false | "Compliance rating below threshold" |
| "Retired" | — | — | — | — | false | "Agent retired" |
| — | — | — | "Not Proactive" | — | false | "Agent not proactive" |

The demo scenario: start with row 1 eligible; during the "side-by-side" wow moment, edit the tenure condition so a different agent profile matches or fails.

---

### 3. DMN: `recommendation-rules.dmn`

**Decision ID:** `recommendation-rules`
**Hit policy:** COLLECT (can return multiple recommendations)
**Inputs:** `councilStatus`, `attemptRate`, `nylicuTraining`

**Output:**
| Output expression | Label | Type |
|---|---|---|
| `recommendationType` | Type | string |
| `recommendationText` | Display Text | string |
| `recommendationLink` | Link | string |

**Seed rows:**

| councilStatus | attemptRate | nylicuTraining | recommendationType | recommendationText |
|---|---|---|---|---|
| "No Council" | — | — | "enrollment" | "Enroll in AARP LTC Options to grow your lead pipeline" |
| — | < 0.5 | — | "performance" | "Your attempt rate is below program threshold — review call strategy" |
| — | — | "Not On Track" | "training" | "Complete NYLIC University training to maintain program eligibility" |

---

### 4. DMN: `unenrollment-rules.dmn`

**Decision ID:** `unenrollment-rules`
**Hit policy:** FIRST
**Inputs:** `agentStatus`, `complianceRating`, `monthsBehindProactive`, `attemptRate`

**Output:**
| Output expression | Label |
|---|---|
| `shouldUnenroll` | boolean |
| `unenrollmentReason` | string |
| `unenrollmentType` | string ("immediate" or "deadline") |

**Seed rows:**

| agentStatus | complianceRating | monthsBehindProactive | attemptRate | shouldUnenroll | reason | type |
|---|---|---|---|---|---|---|
| "Retired" | — | — | — | true | "Agent retired" | "immediate" |
| — | < 2 | — | — | true | "Critical compliance failure" | "immediate" |
| — | — | "4+ Months behind" | — | true | "Proactive requirement not met for 4+ months" | "deadline" |
| — | — | — | < 0.25 | true | "Attempt rate critically low" | "deadline" |
| — | — | — | — | false | — | — |

---

### 5. Job workers (Node.js)

Two lightweight workers using `@camunda8/sdk`:

**Worker 1 — `auto-unenroll-agent`**
- Completes the Auto-Unenroll service task
- Sets output variables: `agentStatus = "Unenrolled"`, `unenrolledAt = <timestamp>`

**Worker 2 — `hold-agent-status`**
- Completes the Hold Status service task
- Sets output variable: `agentStatus = "Pending Review"`

Both workers can live in a single `workers/index.js` file. They run as a local Node process pointed at the SaaS cluster (env vars for credentials).

---

### 6. React + Vite frontend

**Two-tab layout:**

#### Tab 1 — Rule Manager

Sections:
- **Decision Definitions list:** use the Camunda 8 REST API to list all deployed decision definitions — show name, version, and deployment date for each
- **Decision table viewer/editor:** on row click, fetch the DMN XML for that definition via the Camunda 8 REST API, then render it using [dmn-js](https://github.com/bpmn-io/dmn-js) (Camunda's open source DMN renderer). Use dmn-js in editor mode so users can directly manipulate decision table rows, inputs, outputs, and values in the UI. On save, extract the updated DMN XML from the dmn-js instance and hand it to the deploy flow.
- **Deploy button:** serialize the edited table back to valid DMN XML and deploy it as a new version via the Camunda 8 REST API — display the new version number on success
- **Version history:** use the Camunda 8 REST API to list prior versions of a decision definition — include a "restore" option that redeploys a previous DMN XML version

Required Camunda 8 REST API capabilities (let the dev kit resolve exact endpoints):
- List all decision definitions
- Fetch a single decision definition by key
- Fetch the DMN XML for a decision requirements definition
- Deploy a new resource (BPMN or DMN) to the cluster
- List decision instances for audit history

#### Tab 2 — Agent Simulator

Sections:
- **Agent selector:** card grid of 5 hardcoded agents (see below), click to select
- **Lead Program selector:** dropdown (3-4 hardcoded programs: "AARP LTC Options", "Life Insurance Core", "Retirement Planning", "IDI Specialists")
- **Run Evaluation button:** start a new process instance for `lead-program-evaluation` via the Camunda 8 REST API, passing the selected agent's attributes as process variables
- **Results panel:** poll for process instance completion via the Camunda 8 REST API, then render:
  - Eligibility outcome badge (green/red)
  - Recommendation cards (if eligible)
  - Unenrollment outcome (if ineligible)
  - Audit log: which DMN version was evaluated, timestamp, input variables used

Required Camunda 8 REST API capabilities (let the dev kit resolve exact endpoints):
- Start a process instance by process definition ID, passing variables
- Poll process instance state until completed
- Retrieve process instance variables after completion
- List decision instances filtered by process instance key (for DMN audit detail)

---

## Mock agent data (hardcoded)

| # | Name | Code | Tenure | Status | Compliance | Proactive Status | Council | License | Attempt Rate | Months Behind |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Maria Gonzalez | 1001 | 1st Prior | Active | 4 | Proactive | President's Council | Life + Health | 0.72 | — |
| 2 | James Okonkwo | 1002 | Contract <= 6 months | Active | 3 | Not Proactive | No Council | Life | 0.41 | 2 Months behind |
| 3 | Susan Park | 1003 | 2nd Prior | Active Reinstated | 2 | Proactive | No Council | Life + Health | 0.31 | 4+ Months behind |
| 4 | David Chen | 1004 | 3rd Prior | Active | 5 | Proactive | Chairman's Council | Life + Health | 0.88 | — |
| 5 | Robert Mills | 1005 | 1st Prior | Retired | 3 | Proactive | Quality Council | Life | 0.65 | — |

Demo script note:
- Maria (1001) → eligible, gets enrollment recommendation
- James (1002) → eligible but gets performance recommendation (low attempt rate)
- Susan (1003) → ineligible (compliance + 4+ months behind), triggers unenrollment
- David (1004) → fully eligible, no recommendations needed (clean outcome)
- Robert (1005) → ineligible (retired), immediate unenrollment

---

## Project folder structure

```
/nyl-rules-poc/
├── CLAUDE.md                          ← paste this plan here for Claude Code
├── .env.example                       ← CAMUNDA_CLIENT_ID, SECRET, CLUSTER_ID
├── bpmn/
│   └── lead-program-evaluation.bpmn
├── dmn/
│   ├── eligibility-rules.dmn
│   ├── recommendation-rules.dmn
│   └── unenrollment-rules.dmn
├── workers/
│   ├── package.json
│   └── index.js                       ← both job workers
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/
        │   └── camunda.js             ← all Camunda REST calls in one module
        ├── data/
        │   └── agents.js              ← hardcoded agent profiles
        ├── components/
        │   ├── RuleManager/
        │   │   ├── DecisionList.jsx
        │   │   ├── DecisionTableEditor.jsx
        │   │   └── VersionHistory.jsx
        │   └── AgentSimulator/
        │       ├── AgentCard.jsx
        │       ├── ProgramSelector.jsx
        │       └── ResultsPanel.jsx
        └── index.css
```

---

## Build sequence for Claude Code

Use the `camunda-ai-dev-kit` slash commands where indicated. Work in this order — each step is independently testable:

1. **Scaffold project** — `/new-project` to initialize the repo structure; create `workers/` folder and `.env.example` with placeholder variable names
2. **Build BPMN** — `/new-process` — describe the lead program evaluation flow: eligibility Business Rule Task → gateway → recommendation Business Rule Task (eligible path) → unenrollment Business Rule Task (ineligible path) → two service tasks (auto-unenroll, hold status) → end events
3. **Build DMNs** — `/new-dmn` for each of the three decision tables (eligibility, recommendation, unenrollment) using the seed data and hit policies defined above
4. **Deploy to SaaS** — `/deploy` to push the BPMN and all three DMNs to the Camunda SaaS cluster
5. **Build workers** — `/new-worker` for `auto-unenroll-agent` and `hold-agent-status`; both can live in a single `workers/index.js`
6. **Build `camunda.js` API module** — centralise all Camunda REST calls in one module; use intent descriptions from the frontend spec above and let the dev kit resolve correct endpoint patterns; verify each capability works individually before building UI on top
7. **Build Agent Simulator tab** — hardcoded agents, program selector, process start, result polling, results panel with outcome badges and audit log
8. **Build Rule Manager tab** — decision definitions list, DMN XML fetch, editable table renderer, deploy button, version history with restore
9. **Polish UI** — consistent styling, loading states, error handling, result badges
10. **End-to-end demo run** — run each of the 5 mock agents, verify all outcomes match expected results in the demo script

---

## PoC success criteria mapping

| NYL requirement | How it's addressed in this PoC |
|---|---|
| Business users configure rules via UI without IT | Rule Manager tab: edit DMN table, deploy — no Camunda UI touched |
| Multi-condition rule logic executes correctly | DMN tables with AND/OR logic across 4+ attributes |
| Rules saved and activated without deployment pipeline | One-click Deploy button in frontend calls Camunda deployment API directly |
| Version history retained for audit | Version History panel in Rule Manager; decision instances audit log |
| Prior rule config retrievable | Version selector restores previous DMN XML |
| Conditional recommendations trigger correctly | Recommendation DMN with COLLECT hit policy |
| Auto-unenrollment with deadline logic | Unenrollment DMN with `unenrollmentType` output (immediate vs. deadline) |
| Agent status updates based on rule outcome | Job workers set `agentStatus` variable; visible in Simulator results |
| REST API for rule CRUD | All frontend calls use Camunda 8 REST API directly |
| Approval & publish / RBAC | Scope for discussion: Camunda SaaS supports roles; can be demonstrated at cluster level |
| Reporting & analytics | Decision instances endpoint provides evaluation history; can surface in a basic table in the UI |

---

## Environment variables required

The `.env.example` file should include placeholders for the following — let the dev kit generate the correct variable names and structure for `@camunda8/sdk` and Vite:

- Camunda SaaS cluster ID
- Camunda SaaS region
- OAuth client ID and client secret (for both workers and any server-side API calls)
- Cluster REST API base URL

**Architectural constraint to preserve regardless of dev kit output:** all Camunda API calls from the React frontend must be proxied through the Vite dev server to avoid CORS issues during local development. Configure a proxy in `vite.config.js` that forwards a local `/api` path to the Camunda SaaS cluster REST endpoint. The `camunda.js` API module should call `/api/...` paths, never the Camunda cluster URL directly.

---

## What this PoC intentionally excludes (keep it simple)

- No real NYL agent database integration — mock data only
- No Git integration for DMN versioning (Camunda's internal versioning covers the demo need)
- No role-based approval flow in the frontend (can be discussed conceptually; Camunda SaaS cluster roles exist)
- No deadline/timer enforcement in the BPMN (unenrollment type is surfaced as a variable only)
- No custom Connectors — job workers are the integration pattern for this PoC

---

## Demo runbook outline (to be generated separately)

1. Open Agent Simulator — select David Chen (clean eligible outcome) — Run → show green eligible card
2. Open Rule Manager — show deployed DMN versions for `eligibility-rules`
3. Edit the tenure condition (e.g. change "1st Prior" → "Contract <= 6 months") — Deploy
4. Return to Agent Simulator — rerun Maria Gonzalez — outcome flips to ineligible — "rules changed without IT"
5. Select Susan Park — Run → show ineligible + unenrollment triggered — show audit log with DMN version used
6. Select James Okonkwo — Run → show eligible + performance recommendation card
7. Return to Rule Manager — show version history — restore previous version — redeploy — rerun Maria → eligible again
