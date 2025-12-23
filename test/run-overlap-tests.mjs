import assert from 'assert';
import { findBlockingOverlaps } from '../src/utils/leaseOverlap.js';

function run() {
  console.log('Running lease overlap inline tests...');

  // Test 1
  const existing = [
    { lease_start: '2025-09-01', lease_end: '2025-09-10', status: 'Active', id:1, tenant_id:'t1' },
    { lease_start: '2025-09-10', lease_end: '2025-09-20', status: 'Active', id:2, tenant_id:'t2' },
    { lease_start: '2025-09-20', lease_end: '2025-09-30', status: 'Pending', id:3, tenant_id:'t3' }
  ];

  // Candidate that starts exactly at existing[0].end against only existing[0] -> should NOT overlap due to end-exclusive semantics
  let existingSingle = [ existing[0] ];
  let candidate = { lease_start: '2025-09-10', lease_end: '2025-09-15' };
  let overlaps = findBlockingOverlaps(existingSingle, candidate, { blockingStatuses: ['Active'] });
  assert.strictEqual(overlaps.length, 0, 'should not overlap when candidate starts on existing end (end-exclusive)');

  // Candidate fully inside existing[0]
  candidate = { lease_start: '2025-09-02', lease_end: '2025-09-08' };
  overlaps = findBlockingOverlaps(existing, candidate, { blockingStatuses: ['Active'] });
  assert.strictEqual(overlaps.length, 1, 'should detect overlap when inside existing range');

  // With both existing leases present, a candidate starting at 2025-09-10 should overlap the second lease that starts same day
  overlaps = findBlockingOverlaps(existing, candidate, { blockingStatuses: ['Active'] });
  assert.strictEqual(overlaps.length, 1, 'should detect overlap when another lease starts on the candidate start date');

  // Pending blocking test
  const existing2 = [{ lease_start: '2025-09-01', lease_end: '2025-09-10', status: 'Pending', id:1 }];
  const candidate2 = { lease_start: '2025-09-05', lease_end: '2025-09-08' };
  let overlaps2 = findBlockingOverlaps(existing2, candidate2, { blockingStatuses: ['Active'] });
  assert.strictEqual(overlaps2.length, 0, 'Pending should not block when only Active is blocking');
  overlaps2 = findBlockingOverlaps(existing2, candidate2, { blockingStatuses: ['Active','Pending'] });
  assert.strictEqual(overlaps2.length, 1, 'Pending should block when specified in blockingStatuses');

  console.log('All inline lease overlap tests passed');
}

try { run(); process.exit(0); } catch (e) { console.error('Test failure', e); process.exit(2); }
