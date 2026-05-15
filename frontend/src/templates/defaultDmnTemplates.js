// Verbatim copies of the seed recommendation-rules and unenrollment-rules
// DMNs (see dmn/*.dmn at the repo root). Used when the New Lead Program
// flow deploys the full {eligibility, recommendation, unenrollment} triple
// for a new program: the user authors the eligibility DMN in the condition
// builder, and these two are copied verbatim and re-keyed for the new
// program's slug so each Lead Program has its own three-DMN set.
//
// Placeholder tokens (substituted by reslugDmnTemplate before deploy):
//   __DECISION_ID__       canonical decision id, e.g. "aarp-ltc-options-recommendation"
//   __DECISION_NAME__     human-readable name, e.g. "AARP LTC Options · Recommendations"
//   __DEFINITIONS_ID__    Definitions/@id, must be unique per DMN (XML id rules)
//   __NAMESPACE__         Definitions/@namespace, per-program URI
//   __DRG_NAME__          Definitions/@name, displayed by tooling
//   __DIAGRAM_ID__        DMNDIagram/@id, unique
//   __SHAPE_ID__          DMNShape/@id, unique

export const RECOMMENDATION_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/"
             xmlns:modeler="http://camunda.org/schema/modeler/1.0"
             id="__DEFINITIONS_ID__"
             name="__DRG_NAME__"
             namespace="__NAMESPACE__"
             exporter="NYL Lead Program Builder"
             exporterVersion="1.0"
             modeler:executionPlatform="Camunda Cloud"
             modeler:executionPlatformVersion="8.9.0">

  <decision id="__DECISION_ID__" name="__DECISION_NAME__">
    <decisionTable id="DecisionTable___DECISION_ID__" hitPolicy="COLLECT">

      <input id="Input_CouncilStatus" label="Council Status">
        <inputExpression id="InputExpression_CouncilStatus" typeRef="string">
          <text>councilStatus</text>
        </inputExpression>
      </input>

      <input id="Input_AttemptRate" label="Attempt Rate">
        <inputExpression id="InputExpression_AttemptRate" typeRef="number">
          <text>attemptRate</text>
        </inputExpression>
      </input>

      <input id="Input_NylicuTraining" label="NYLIC Training">
        <inputExpression id="InputExpression_NylicuTraining" typeRef="string">
          <text>nylicuTraining</text>
        </inputExpression>
      </input>

      <output id="Output_RecommendationType" label="Type" name="recommendationType" typeRef="string"/>
      <output id="Output_RecommendationText" label="Display Text" name="recommendationText" typeRef="string"/>
      <output id="Output_RecommendationLink" label="Link" name="recommendationLink" typeRef="string"/>

      <rule id="Rule_R1_Enrollment">
        <description>Agents with no council status: nudge them to enroll to grow lead pipeline.</description>
        <inputEntry id="InputEntry_R1_Council"><text>"No Council"</text></inputEntry>
        <inputEntry id="InputEntry_R1_AttemptRate"><text></text></inputEntry>
        <inputEntry id="InputEntry_R1_Training"><text></text></inputEntry>
        <outputEntry id="OutputEntry_R1_Type"><text>"enrollment"</text></outputEntry>
        <outputEntry id="OutputEntry_R1_Text"><text>"Enroll in this program to grow your lead pipeline"</text></outputEntry>
        <outputEntry id="OutputEntry_R1_Link"><text>"/programs/__DECISION_ID__"</text></outputEntry>
      </rule>

      <rule id="Rule_R2_Performance">
        <description>Attempt rate below 50% threshold: surface a call-strategy review.</description>
        <inputEntry id="InputEntry_R2_Council"><text></text></inputEntry>
        <inputEntry id="InputEntry_R2_AttemptRate"><text>&lt; 0.5</text></inputEntry>
        <inputEntry id="InputEntry_R2_Training"><text></text></inputEntry>
        <outputEntry id="OutputEntry_R2_Type"><text>"performance"</text></outputEntry>
        <outputEntry id="OutputEntry_R2_Text"><text>"Your attempt rate is below program threshold — review call strategy"</text></outputEntry>
        <outputEntry id="OutputEntry_R2_Link"><text>"/coaching/call-strategy"</text></outputEntry>
      </rule>

      <rule id="Rule_R3_Training">
        <description>NYLIC University training off-track: prompt completion to maintain eligibility.</description>
        <inputEntry id="InputEntry_R3_Council"><text></text></inputEntry>
        <inputEntry id="InputEntry_R3_AttemptRate"><text></text></inputEntry>
        <inputEntry id="InputEntry_R3_Training"><text>"Not On Track"</text></inputEntry>
        <outputEntry id="OutputEntry_R3_Type"><text>"training"</text></outputEntry>
        <outputEntry id="OutputEntry_R3_Text"><text>"Complete NYLIC University training to maintain program eligibility"</text></outputEntry>
        <outputEntry id="OutputEntry_R3_Link"><text>"/training/nylic-university"</text></outputEntry>
      </rule>

    </decisionTable>
  </decision>

  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="__DIAGRAM_ID__">
      <dmndi:DMNShape id="__SHAPE_ID__" dmnElementRef="__DECISION_ID__">
        <dc:Bounds height="80" width="180" x="160" y="100"/>
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
`;

export const UNENROLLMENT_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/"
             xmlns:modeler="http://camunda.org/schema/modeler/1.0"
             id="__DEFINITIONS_ID__"
             name="__DRG_NAME__"
             namespace="__NAMESPACE__"
             exporter="NYL Lead Program Builder"
             exporterVersion="1.0"
             modeler:executionPlatform="Camunda Cloud"
             modeler:executionPlatformVersion="8.9.0">

  <decision id="__DECISION_ID__" name="__DECISION_NAME__">
    <decisionTable id="DecisionTable___DECISION_ID__" hitPolicy="FIRST">

      <input id="Input_U_AgentStatus" label="Agent Status">
        <inputExpression id="InputExpression_U_AgentStatus" typeRef="string">
          <text>agentStatus</text>
        </inputExpression>
      </input>

      <input id="Input_U_ComplianceRating" label="Compliance Rating">
        <inputExpression id="InputExpression_U_ComplianceRating" typeRef="number">
          <text>complianceRating</text>
        </inputExpression>
      </input>

      <input id="Input_U_MonthsBehindProactive" label="Months Behind Proactive">
        <inputExpression id="InputExpression_U_MonthsBehindProactive" typeRef="string">
          <text>monthsBehindProactive</text>
        </inputExpression>
      </input>

      <input id="Input_U_AttemptRate" label="Attempt Rate">
        <inputExpression id="InputExpression_U_AttemptRate" typeRef="number">
          <text>attemptRate</text>
        </inputExpression>
      </input>

      <output id="Output_ShouldUnenroll" label="Unenroll" name="shouldUnenroll" typeRef="boolean"/>
      <output id="Output_UnenrollmentReason" label="Reason" name="unenrollmentReason" typeRef="string"/>
      <output id="Output_UnenrollmentType" label="Type" name="unenrollmentType" typeRef="string"/>

      <rule id="Rule_U1_Retired">
        <description>Retired agents are immediately unenrolled.</description>
        <inputEntry id="InputEntry_U1_Status"><text>"Retired"</text></inputEntry>
        <inputEntry id="InputEntry_U1_Compliance"><text></text></inputEntry>
        <inputEntry id="InputEntry_U1_Months"><text></text></inputEntry>
        <inputEntry id="InputEntry_U1_AttemptRate"><text></text></inputEntry>
        <outputEntry id="OutputEntry_U1_Should"><text>true</text></outputEntry>
        <outputEntry id="OutputEntry_U1_Reason"><text>"Agent retired"</text></outputEntry>
        <outputEntry id="OutputEntry_U1_Type"><text>"immediate"</text></outputEntry>
      </rule>

      <rule id="Rule_U2_CriticalCompliance">
        <description>Critical compliance failure (rating below 2): immediate unenrollment.</description>
        <inputEntry id="InputEntry_U2_Status"><text></text></inputEntry>
        <inputEntry id="InputEntry_U2_Compliance"><text>&lt; 2</text></inputEntry>
        <inputEntry id="InputEntry_U2_Months"><text></text></inputEntry>
        <inputEntry id="InputEntry_U2_AttemptRate"><text></text></inputEntry>
        <outputEntry id="OutputEntry_U2_Should"><text>true</text></outputEntry>
        <outputEntry id="OutputEntry_U2_Reason"><text>"Critical compliance failure"</text></outputEntry>
        <outputEntry id="OutputEntry_U2_Type"><text>"immediate"</text></outputEntry>
      </rule>

      <rule id="Rule_U3_ProactiveDeadline">
        <description>Proactive requirement missed for 4+ months: deadline-based unenrollment.</description>
        <inputEntry id="InputEntry_U3_Status"><text></text></inputEntry>
        <inputEntry id="InputEntry_U3_Compliance"><text></text></inputEntry>
        <inputEntry id="InputEntry_U3_Months"><text>"4+ Months behind"</text></inputEntry>
        <inputEntry id="InputEntry_U3_AttemptRate"><text></text></inputEntry>
        <outputEntry id="OutputEntry_U3_Should"><text>true</text></outputEntry>
        <outputEntry id="OutputEntry_U3_Reason"><text>"Proactive requirement not met for 4+ months"</text></outputEntry>
        <outputEntry id="OutputEntry_U3_Type"><text>"deadline"</text></outputEntry>
      </rule>

      <rule id="Rule_U4_AttemptRateLow">
        <description>Attempt rate critically low: deadline-based unenrollment.</description>
        <inputEntry id="InputEntry_U4_Status"><text></text></inputEntry>
        <inputEntry id="InputEntry_U4_Compliance"><text></text></inputEntry>
        <inputEntry id="InputEntry_U4_Months"><text></text></inputEntry>
        <inputEntry id="InputEntry_U4_AttemptRate"><text>&lt; 0.25</text></inputEntry>
        <outputEntry id="OutputEntry_U4_Should"><text>true</text></outputEntry>
        <outputEntry id="OutputEntry_U4_Reason"><text>"Attempt rate critically low"</text></outputEntry>
        <outputEntry id="OutputEntry_U4_Type"><text>"deadline"</text></outputEntry>
      </rule>

      <rule id="Rule_U5_HoldDefault">
        <description>Catch-all: ineligible but no unenrollment trigger — agent goes on hold.</description>
        <inputEntry id="InputEntry_U5_Status"><text></text></inputEntry>
        <inputEntry id="InputEntry_U5_Compliance"><text></text></inputEntry>
        <inputEntry id="InputEntry_U5_Months"><text></text></inputEntry>
        <inputEntry id="InputEntry_U5_AttemptRate"><text></text></inputEntry>
        <outputEntry id="OutputEntry_U5_Should"><text>false</text></outputEntry>
        <outputEntry id="OutputEntry_U5_Reason"><text>""</text></outputEntry>
        <outputEntry id="OutputEntry_U5_Type"><text>""</text></outputEntry>
      </rule>

    </decisionTable>
  </decision>

  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="__DIAGRAM_ID__">
      <dmndi:DMNShape id="__SHAPE_ID__" dmnElementRef="__DECISION_ID__">
        <dc:Bounds height="80" width="180" x="160" y="100"/>
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
`;

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeId(suffix, slug) {
  return `${suffix}_${slug.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

export function renderTemplate(template, { decisionId, decisionName, drgName }) {
  return template
    .replaceAll('__DECISION_ID__', decisionId)
    .replaceAll('__DECISION_NAME__', escapeXml(decisionName))
    .replaceAll('__DRG_NAME__', escapeXml(drgName))
    .replaceAll('__DEFINITIONS_ID__', safeId('Definitions', decisionId))
    .replaceAll('__NAMESPACE__', `http://camunda.org/schema/dmn/nyl/lead-program/${decisionId}`)
    .replaceAll('__DIAGRAM_ID__', safeId('Diagram', decisionId))
    .replaceAll('__SHAPE_ID__', safeId('Shape', decisionId));
}
