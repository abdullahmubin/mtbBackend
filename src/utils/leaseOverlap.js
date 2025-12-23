import dayjs from 'dayjs';

// Returns an array of existing leases that overlap the candidate lease using end-exclusive semantics.
// existingLeases: array of { lease_start, lease_end, status, ... }
// candidate: { lease_start, lease_end }
// options.blockingStatuses: array of statuses to treat as blocking (default ['Active','Pending'])
export function findBlockingOverlaps(existingLeases = [], candidate = {}, options = {}) {
  const blocking = options.blockingStatuses || ['Active', 'Pending'];
  const startNew = dayjs(candidate.lease_start);
  const endNew = dayjs(candidate.lease_end);
  if (!startNew.isValid() || !endNew.isValid()) return [];
  const newStartMs = startNew.startOf('day').valueOf();
  const newEndMs = endNew.startOf('day').valueOf();

  return existingLeases.filter(e => {
    if (!e) return false;
    if (!blocking.includes(e.status)) return false;
    const s = dayjs(e.lease_start);
    const t = dayjs(e.lease_end);
    if (!s.isValid() || !t.isValid()) return false;
    const sMs = s.startOf('day').valueOf();
    const tMs = t.startOf('day').valueOf();
    // End-exclusive overlap: existingStart < newEnd AND existingEnd > newStart
    return (sMs < newEndMs) && (tMs > newStartMs);
  });
}

export default { findBlockingOverlaps };
