import assert from 'assert';
import { findBlockingOverlaps } from '../src/utils/leaseOverlap.js';
import dayjs from 'dayjs';

describe('leaseOverlap util', ()=>{
  it('should detect end-exclusive overlaps correctly', ()=>{
    const existing = [
      { lease_start: '2025-09-01', lease_end: '2025-09-10', status: 'Active', id:1, tenant_id:'t1' },
      { lease_start: '2025-09-10', lease_end: '2025-09-20', status: 'Active', id:2, tenant_id:'t2' },
      { lease_start: '2025-09-20', lease_end: '2025-09-30', status: 'Pending', id:3, tenant_id:'t3' }
    ];

    // Candidate that starts exactly at existing[0].end -> should NOT overlap due to end-exclusive semantics
    let candidate = { lease_start: '2025-09-10', lease_end: '2025-09-15' };
    let overlaps = findBlockingOverlaps(existing, candidate, { blockingStatuses: ['Active'] });
    assert.strictEqual(overlaps.length, 0, 'should not overlap when candidate starts on existing end (end-exclusive)');

    // Candidate ends exactly at existing[0].start -> should NOT overlap
    candidate = { lease_start: '2025-08-25', lease_end: '2025-09-01' };
    overlaps = findBlockingOverlaps(existing, candidate, { blockingStatuses: ['Active'] });
    assert.strictEqual(overlaps.length, 0, 'should not overlap when candidate ends on existing start (end-exclusive)');

    // Candidate fully inside existing[0]
    candidate = { lease_start: '2025-09-02', lease_end: '2025-09-08' };
    overlaps = findBlockingOverlaps(existing, candidate, { blockingStatuses: ['Active'] });
    assert.strictEqual(overlaps.length, 1, 'should detect overlap when inside existing range');

    // Candidate overlapping existing[1] which starts at 2025-09-10: starting 2025-09-09 should overlap existing[1] because existing[1].start < candidate.end and existing[1].end > candidate.start
    candidate = { lease_start: '2025-09-09', lease_end: '2025-09-11' };
    overlaps = findBlockingOverlaps(existing, candidate, { blockingStatuses: ['Active'] });
    assert.strictEqual(overlaps.length, 1, 'should detect overlap across boundary when end-exclusive semantics apply');
  });

  it('should treat Pending as blocking when requested', ()=>{
    const existing = [
      { lease_start: '2025-09-01', lease_end: '2025-09-10', status: 'Pending', id:1 }
    ];
    const candidate = { lease_start: '2025-09-05', lease_end: '2025-09-08' };
    let overlaps = findBlockingOverlaps(existing, candidate, { blockingStatuses: ['Active'] });
    assert.strictEqual(overlaps.length, 0, 'Pending should not block when only Active is blocking');
    overlaps = findBlockingOverlaps(existing, candidate, { blockingStatuses: ['Active','Pending'] });
    assert.strictEqual(overlaps.length, 1, 'Pending should block when specified in blockingStatuses');
  });
});
