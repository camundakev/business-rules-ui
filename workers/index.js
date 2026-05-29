// Lead Programs Management — Job Workers
//
// Run from this folder: `npm start` (loads ../.env via Node's --env-file flag).

import { Camunda8 } from '@camunda8/sdk';

const c8 = new Camunda8();
const zeebe = c8.getZeebeGrpcApiClient();

zeebe.createWorker({
  taskType: 'auto-unenroll-agent',
  taskHandler: async (job) => {
    const { agentCode, agentName } = job.variables ?? {};
    const unenrolledAt = new Date().toISOString();
    console.log(`[auto-unenroll-agent] ${agentCode} ${agentName} → Unenrolled @ ${unenrolledAt}`);
    return job.complete({
      agentStatus: 'Unenrolled',
      unenrolledAt,
    });
  },
});

zeebe.createWorker({
  taskType: 'hold-agent-status',
  taskHandler: async (job) => {
    const { agentCode, agentName } = job.variables ?? {};
    console.log(`[hold-agent-status] ${agentCode} ${agentName} → Pending Review`);
    return job.complete({
      agentStatus: 'Pending Review',
    });
  },
});

console.log('Workers ready: auto-unenroll-agent, hold-agent-status');
