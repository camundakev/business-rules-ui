// Mock agents for the Agent Simulator tab. Each profile is hand-crafted so
// that, against the seeded DMN rules, the process produces the outcome the
// demo script expects.
//
// Tweaks vs the original CLAUDE.md fixture table:
//   • Maria  — councilStatus  "President's Council" → "No Council"
//              (so the recommendation DMN's enrollment rule fires)
//   • James  — agentTenure    "Contract <= 6 months" → "1st Prior"
//              agentProactive "Not Proactive"        → "Proactive"
//              licenseType    "Life"                 → "Life + Health"
//              (so eligibility rule 1 matches; his low attemptRate of 0.41
//               then triggers the performance recommendation)
//   • David  — agentTenure    "3rd Prior" → "1st Prior"
//              (so eligibility rule 1 matches; clean eligible, no recs)

export const AGENTS = [
  {
    agentCode: '1001',
    agentName: 'Maria Gonzalez',
    agentTenure: '1st Prior',
    agentStatus: 'Active',
    complianceRating: 4,
    agentProactiveStatus: 'Proactive',
    rollingFYC: 0,
    councilStatus: 'No Council',
    licenseType: 'Life + Health',
    attemptRate: 0.72,
    monthsBehindProactive: '',
    nylicuTraining: '',
  },
  {
    agentCode: '1002',
    agentName: 'James Okonkwo',
    agentTenure: '1st Prior',
    agentStatus: 'Active',
    complianceRating: 3,
    agentProactiveStatus: 'Proactive',
    rollingFYC: 0,
    councilStatus: 'No Council',
    licenseType: 'Life + Health',
    attemptRate: 0.41,
    monthsBehindProactive: '2 Months behind',
    nylicuTraining: '',
  },
  {
    agentCode: '1003',
    agentName: 'Susan Park',
    agentTenure: '2nd Prior',
    agentStatus: 'Active Reinstated',
    complianceRating: 2,
    agentProactiveStatus: 'Proactive',
    rollingFYC: 0,
    councilStatus: 'No Council',
    licenseType: 'Life + Health',
    attemptRate: 0.31,
    monthsBehindProactive: '4+ Months behind',
    nylicuTraining: '',
  },
  {
    agentCode: '1004',
    agentName: 'David Chen',
    agentTenure: '1st Prior',
    agentStatus: 'Active',
    complianceRating: 5,
    agentProactiveStatus: 'Proactive',
    rollingFYC: 0,
    councilStatus: "Chairman's Council",
    licenseType: 'Life + Health',
    attemptRate: 0.88,
    monthsBehindProactive: '',
    nylicuTraining: '',
  },
  {
    agentCode: '1005',
    agentName: 'Robert Mills',
    agentTenure: '1st Prior',
    agentStatus: 'Retired',
    complianceRating: 3,
    agentProactiveStatus: 'Proactive',
    rollingFYC: 0,
    councilStatus: 'Quality Council',
    licenseType: 'Life',
    attemptRate: 0.65,
    monthsBehindProactive: '',
    nylicuTraining: '',
  },
];

export const LEAD_PROGRAMS = [
  'AARP LTC Options',
  'Life Insurance Core',
  'Retirement Planning',
  'IDI Specialists',
];
