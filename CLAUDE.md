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
│   ├── Program list (from program registry — shows display names)
│   ├── Per-program: view/edit three linked DMN tables (eligibility, recommendation, unenrollment)
│   ├── Unified DMN editor: dmn-js view mode + custom UI edit mode per table
│   └── Create New Lead Program: builder form → generates + deploys three DMNs → adds to registry
└── Agent Simulator tab
    ├── Select a mock agent (hardcoded 5 agents)
    ├── Select a Lead Program (from program registry — shows display names only)
    ├── Trigger BPMN process instance (Camunda API)
    └── Show outcome: Eligible / Recommendation / Unenrolled + audit trail

Camunda SaaS (cloud.camunda.io)
├── BPMN process: lead-program-evaluation.bpmn
│   ├── Start → Evaluate Eligibility (Business Rule Task → DMN resolved from leadProgramDecisionId)
│   ├── Gateway: Eligible?
│   │   ├── Yes → Evaluate Recommendations (Business Rule Task → DMN resolved from leadProgramRecommendationId)
│   │   └── No → Evaluate Unenrollment (Business Rule Task → DMN resolved from leadProgramUnenrollmentId)
│   │       └── Gateway: Unenroll?
│   │           ├── Yes → Auto-Unenroll Task → End
│   │           └── No → Hold Status Task → End
│   └── End
├── Default Lead Program DMNs
│   ├── DMN: eligibility-rules.dmn
│   ├── DMN: recommendation-rules.dmn
│   └── DMN: unenrollment-rules.dmn
└── New Lead Program DMNs (created at runtime, one set per program)
    ├── DMN: {program-slug}-eligibility.dmn
    ├── DMN: {program-slug}-recommendation.dmn
    └── DMN: {program-slug}-unenrollment.dmn
```

All frontend interactions with Camunda go exclusively through the Camunda 8 REST API (orchestration cluster endpoint). No Zeebe gRPC client. No Web Modeler API.

---

## Program registry (central data model)

The program registry is the single source of truth for everything Lead Program related across both tabs. It maps each program's display name to its three decision IDs and is stored in shared React state (or context) so both tabs stay in sync without a page refresh.

**Seed entry — Default Lead Program:**
```js
{
  displayName: "Default Lead Program",
  slug: "default",
  eligibilityId: "eligibility-rules",
  recommendationId: "recommendation-rules",
  unenrollmentId: "unenrollment-rules"
}
```

**Entry shape for newly created programs:**
```js
{
  displayName: "<user-entered program name>",
  slug: "<slugified-name>",           // e.g. "aarp-ltc-options"
  eligibilityId: "<slug>-eligibility",
  recommendationId: "<slug>-recommendation",
  unenrollmentId: "<slug>-unenrollment"
}
```

The registry is defined in `src/data/programRegistry.js` and initialized with the Default Lead Program entry. When a new program is created and deployed successfully, it is appended to the registry in shared state immediately — no page refresh required.

**Rules for all UI that references programs:**
- Agent Simulator dropdown shows `displayName` values only — never DMN IDs or slugs
- Rule Manager program list shows `displayName` values
- Results panel audit log shows `displayName`, not decision IDs
- No raw decision IDs should be visible anywhere in the UI

---

## Camunda assets to build

### 1. BPMN: `lead-program-evaluation.bpmn`

A single process covering all three NYL use cases. All three Business Rule Tasks use FEEL expressions to resolve their decision ID dynamically from process variables — no hardcoded decision IDs anywhere in the BPMN.

Key elements:

- **Start event:** receives agent attributes and program identifiers as process variables (JSON payload)
- **Business Rule Task 1 — "Evaluate Eligibility":** decision reference bound to FEEL expression `= leadProgramDecisionId`. Outputs `isEligible` (boolean) and `ineligibilityReason` (string).
- **Exclusive gateway:** branches on `isEligible`
- **Business Rule Task 2 — "Generate Recommendation":** (eligible path) decision reference bound to FEEL expression `= leadProgramRecommendationId`. Outputs `recommendationText`, `recommendationLink`, `recommendationType`.
- **Business Rule Task 3 — "Evaluate Unenrollment":** (ineligible path) decision reference bound to FEEL expression `= leadProgramUnenrollmentId`. Outputs `shouldUnenroll` (boolean), `unenrollmentReason`, `unenrollmentType`.
- **Exclusive gateway:** branches on `shouldUnenroll`
- **Service Task — "Auto-Unenroll Agent":** sets `agentStatus = "Unenrolled"` (job worker)
- **Service Task — "Hold Agent Status":** sets `agentStatus = "Pending Review"` (job worker)
- End events with named result context

Process variable schema (passed at start):
```json
{
  "leadProgramDecisionId": "string",       // eligibility DMN decision ID for selected program
  "leadProgramRecommendationId": "string", // recommendation DMN decision ID for selected program
  "leadProgramUnenrollmentId": "string",   // unenrollment DMN decision ID for selected program
  "leadProgram": "string",                 // display name of the selected program
  "agentCode": "string",
  "agentName": "string",
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

For the five hardcoded agents using the Default Lead Program, the three decision ID variables resolve to `"eligibility-rules"`, `"recommendation-rules"`, and `"unenrollment-rules"` respectively — sourced from the program registry entry.

---

### 2. DMN: `eligibility-rules.dmn`

**Decision ID:** `eligibility-rules`
**Hit policy:** FIRST (first matching row wins)
**Inputs:**

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

**Seed rows:**

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

Both workers live in a single `workers/index.js` file. They run as a local Node process pointed at the SaaS cluster (env vars for credentials).

---

### 6. React + Vite frontend

**Two-tab layout:**

---

#### Tab 1 — Rule Manager

Sections:

- **Program list:** displays all programs from the program registry by `displayName`. Selecting a program expands its three linked DMN tables (Eligibility, Recommendation, Unenrollment).

- **Unified DMN table viewer/editor:** each DMN table has two modes toggled by a button:
  - **View mode (default):** renders the DMN XML using [dmn-js](https://github.com/bpmn-io/dmn-js) in read-only mode. Always available for inspection.
  - **Edit mode:** clicking "Edit Rules" switches to the custom condition builder UI (same attribute-driven UI used in New Lead Program, powered by `attributeSchema.js`). On save, `generateDmn.js` serializes the changes to valid DMN 1.3 XML and deploys as a new version via the Camunda REST API.
  - dmn-js must be implemented as a React component using a `useEffect`-mounted ref div with proper cleanup on unmount.

- **Deploy button:** available in edit mode — deploys the updated DMN XML as a new version, displays the new version number on success.

- **Version history:** lists prior deployed versions of any DMN table via the Camunda REST API — includes a "restore" option that redeploys a previous version.

- **Create New Lead Program:** a "New Lead Program" button opens the program builder flow (see full spec below).

Required Camunda 8 REST API capabilities (let the dev kit resolve exact endpoints):
- List all decision definitions
- Fetch a single decision definition by key
- Fetch the DMN XML for a decision requirements definition
- Deploy a new resource (BPMN or DMN) to the cluster
- List decision instances for audit history

---

#### Create New Lead Program — feature spec

This feature addresses NYL PoC scenario 1: business users creating a new Lead Program with eligibility rules via UI, without IT involvement.

**Entry point:** "New Lead Program" button in the Rule Manager tab header.

**What this feature creates:**

Creating a new Lead Program generates and deploys three linked DMN tables by copying the Default Lead Program's seed data as the starting point for recommendation and unenrollment tables. The user configures the eligibility conditions in the builder; all three tables are editable afterward via the unified DMN editor.

**Builder flow (single-page form, no modal):**

1. **Program name field** — free text; slugified to form the base for all three decision IDs (e.g. "AARP LTC Options" → `aarp-ltc-options`)
2. **Eligibility conditions builder** — a dynamic list of condition rows, each with:
   - Attribute selector (dropdown, from `attributeSchema.js`)
   - Operator selector (dropdown: `=`, `!=`, `<`, `<=`, `>`, `>=`)
   - Value input (type-aware: dropdown for enum attributes, number input for numeric attributes)
   - Remove row button
3. **Add Condition button** — appends a new empty condition row
4. **Condition relationship toggle** — AND / OR, applies globally across all conditions
5. **Output section** — fixed and hardcoded: `isEligible` (boolean), `ineligibilityReason` (string). Not configurable by the user.
6. **Save & Activate button** — on click:
   - Generates eligibility DMN XML via `generateDmn.js` from the form state
   - Copies recommendation and unenrollment DMN XML from the Default Lead Program seed data
   - Deploys all three DMNs to Camunda SaaS
   - Adds a new entry to the program registry in shared state with all three decision IDs
   - Returns to the program list where the new program appears immediately
   - The new program appears in the Agent Simulator dropdown immediately without a page refresh

**Naming convention for generated DMN decision IDs:**

| Table | Decision ID pattern | Example |
|---|---|---|
| Eligibility | `{slug}-eligibility` | `aarp-ltc-options-eligibility` |
| Recommendation | `{slug}-recommendation` | `aarp-ltc-options-recommendation` |
| Unenrollment | `{slug}-unenrollment` | `aarp-ltc-options-unenrollment` |

---

#### Attribute schema for the condition builder (single source of truth)

Defined once in `src/utils/attributeSchema.js`. Imported by `NewLeadProgram.jsx`, `DecisionTableEditor.jsx`, and `generateDmn.js`. Ensures UI input types and DMN type annotations are always consistent.

| Display label | Variable name | DMN type | Input control | Valid values / constraints |
|---|---|---|---|---|
| Agent Status | `agentStatus` | string | dropdown | "Active", "Active Reinstated", "Retired" |
| Agent Tenure | `agentTenure` | string | dropdown | "Contract <= 6 months", "1st Prior", "2nd Prior", "3rd Prior" |
| Compliance Rating | `complianceRating` | integer | number input | 1–5 |
| Proactive Status | `agentProactiveStatus` | string | dropdown | "Proactive", "Not Proactive" |
| License Type | `licenseType` | string | dropdown | "Life", "Life + Health" |
| Council Status | `councilStatus` | string | dropdown | "No Council", "Quality Council", "President's Council", "Chairman's Council" |
| Attempt Rate | `attemptRate` | double | number input | 0.0–1.0 |
| Months Behind Proactive | `monthsBehindProactive` | string | dropdown | "—", "2 Months behind", "4+ Months behind" |
| NYLIC University Training | `nylicuTraining` | string | dropdown | "On Track", "Not On Track" |
| Rolling FYC | `rollingFYC` | double | number input | any positive number |

String attributes with a fixed set of values render as dropdowns. Number attributes render as number inputs. This prevents type mismatches between what the user submits and what the DMN evaluates.

---

#### DMN XML generation

`generateDmn.js` is used for both the New Lead Program builder and the custom edit mode in the unified DMN editor. It takes program name, condition rows, AND/OR relationship, and table type (eligibility / recommendation / unenrollment) as inputs and outputs valid deployable DMN 1.3 XML with correct type annotations sourced from `attributeSchema.js`. AND logic = multiple input columns on one row; OR logic = multiple rows with the same output. Hit policy is FIRST for eligibility and unenrollment, COLLECT for recommendation.

---

#### Tab 2 — Agent Simulator

Sections:

- **Agent selector:** card grid of 5 hardcoded agents, click to select. All agents default to "Default Lead Program".
- **Lead Program selector:** dropdown populated from the program registry — shows `displayName` values only, never decision IDs or slugs. Refreshes automatically when a new program is added to the registry.
- **Run Evaluation button:** resolves all three decision IDs from the selected program's registry entry, then starts a BPMN process instance via the Camunda REST API passing the agent's attributes plus `leadProgramDecisionId`, `leadProgramRecommendationId`, and `leadProgramUnenrollmentId` as process variables.
- **Results panel:** polls for process instance completion, then renders:
  - Eligibility outcome badge (green/red)
  - Recommendation cards (if eligible)
  - Unenrollment outcome (if ineligible)
  - Audit log: program display name, DMN version evaluated, timestamp, input variables used — no raw decision IDs visible in the UI

Required Camunda 8 REST API capabilities (let the dev kit resolve exact endpoints):
- Start a process instance by process definition ID, passing variables
- Poll process instance state until completed
- Retrieve process instance variables after completion
- List decision instances filtered by process instance key (for DMN audit detail)

---

## Mock agent data (hardcoded)

All five agents default to "Default Lead Program" in the Agent Simulator.

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
        │   ├── agents.js              ← hardcoded agent profiles
        │   └── programRegistry.js     ← seeded with Default Lead Program entry
        ├── utils/
        │   ├── attributeSchema.js     ← single source of truth for attribute names, types, valid values
        │   └── generateDmn.js         ← DMN 1.3 XML generation; imports attributeSchema.js
        ├── components/
        │   ├── RuleManager/
        │   │   ├── ProgramList.jsx          ← lists all programs from registry by displayName
        │   │   ├── DmnTableViewer.jsx       ← dmn-js read-only view mode (useEffect ref mount)
        │   │   ├── DecisionTableEditor.jsx  ← custom edit mode using attributeSchema.js
        │   │   ├── NewLeadProgram.jsx       ← create new program builder form
        │   │   └── VersionHistory.jsx
        │   └── AgentSimulator/
        │       ├── AgentCard.jsx
        │       ├── ProgramSelector.jsx      ← reads from program registry, shows displayName only
        │       └── ResultsPanel.jsx
        └── index.css
```

---

## Build sequence for Claude Code

Use the `camunda-ai-dev-kit` slash commands where indicated. Work in this order — each step is independently testable:

1. **Scaffold project** — `/new-project` to initialize the repo structure; create `workers/` folder and `.env.example`
2. **Build BPMN** — `/new-process` — all three Business Rule Tasks must use FEEL expression bindings (`= leadProgramDecisionId`, `= leadProgramRecommendationId`, `= leadProgramUnenrollmentId`) — no hardcoded decision IDs
3. **Build DMNs** — `/new-dmn` for each of the three default decision tables using the seed data and hit policies defined above
4. **Deploy to SaaS** — `/deploy` to push the BPMN and all three DMNs to the Camunda SaaS cluster
5. **Build workers** — `/new-worker` for `auto-unenroll-agent` and `hold-agent-status`
6. **Build `programRegistry.js`** — seed with Default Lead Program entry mapping to the three default decision IDs
7. **Build `attributeSchema.js`** — full attribute list with types and valid value enumerations
8. **Build `generateDmn.js`** — test XML output in isolation before touching any UI
9. **Build `camunda.js` API module** — all REST calls centralised; verify each capability individually
10. **Build Agent Simulator tab** — program selector reads from registry (displayNames only), process start passes all three decision ID variables, results panel shows program display name not decision IDs
11. **Build Rule Manager tab** — program list from registry, unified DMN viewer/editor with dmn-js view mode and custom edit mode toggle, version history
12. **Build Create New Lead Program feature** — builder form, three-DMN generation and deployment, registry update on success, immediate Agent Simulator dropdown refresh
13. **Polish UI** — consistent styling, loading states, error handling, result badges
14. **End-to-end demo run** — run all five agents against Default Lead Program; create a new program and run an agent against it; verify display names appear throughout and no decision IDs are exposed in the UI

---

## PoC success criteria mapping

| NYL requirement | How it's addressed in this PoC |
|---|---|
| Business users configure rules via UI without IT | Rule Manager: edit any DMN via custom UI, deploy — no Camunda UI touched |
| Create new Lead Program with 4+ attributes via UI | New Lead Program builder: attribute selector, operators, values, AND/OR logic, Save & Activate |
| System supports adding and removing conditions | Condition builder: dynamic add/remove rows |
| Multi-condition rule logic is executed correctly | DMN tables with AND/OR logic across 4+ attributes |
| Rules saved and activated without deployment pipeline | One-click Save & Activate deploys via Camunda REST API directly |
| Version history retained for audit | Version History panel in Rule Manager; decision instances audit log |
| Prior rule config retrievable | Version selector restores previous DMN XML |
| Conditional recommendations trigger correctly | Recommendation DMN with COLLECT hit policy |
| Auto-unenrollment with deadline logic | Unenrollment DMN with `unenrollmentType` output (immediate vs. deadline) |
| Agent status updates based on rule outcome | Job workers set `agentStatus` variable; visible in Simulator results |
| REST API for rule CRUD | All frontend calls use Camunda 8 REST API directly |
| Approval & publish / RBAC | Scope for discussion: Camunda SaaS supports roles; can be demonstrated at cluster level |
| Reporting & analytics | Decision instances endpoint provides evaluation history; surfaced in audit log in results panel |

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
- Recommendation and unenrollment DMNs for new programs are copied from defaults at creation time — all three tables are editable afterward via the unified DMN editor

---

## Demo runbook outline (to be generated separately)

1. Open Agent Simulator — select David Chen — select "Default Lead Program" — Run → show green eligible card
2. Open Rule Manager — select "Default Lead Program" — open Eligibility table — view mode shows dmn-js render
3. Click "Edit Rules" — switch to custom UI — edit tenure condition (change "1st Prior" → "Contract <= 6 months") — Save & Deploy
4. Return to Agent Simulator — rerun Maria Gonzalez against "Default Lead Program" — outcome flips to ineligible — "rules changed without IT"
5. Select Susan Park — Run → show ineligible + unenrollment triggered — show audit log with program name and DMN version
6. Select James Okonkwo — Run → show eligible + performance recommendation card
7. Return to Rule Manager — click "New Lead Program" — name it, add 4+ conditions, Save & Activate
8. Return to Agent Simulator — new program appears in dropdown by display name — select it — run David Chen → show outcome against new rules
9. Return to Rule Manager — show version history for Default Lead Program eligibility table — restore previous version — redeploy — rerun Maria → eligible again