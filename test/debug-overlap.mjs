import dayjs from 'dayjs';

const existing = { lease_start: '2025-09-01', lease_end: '2025-09-10' };
const candidate = { lease_start: '2025-09-10', lease_end: '2025-09-15' };

const s = dayjs(existing.lease_start).startOf('day');
const t = dayjs(existing.lease_end).startOf('day');
const ns = dayjs(candidate.lease_start).startOf('day');
const ne = dayjs(candidate.lease_end).startOf('day');

console.log('existing start', s.format(), s.valueOf());
console.log('existing end  ', t.format(), t.valueOf());
console.log('candidate start', ns.format(), ns.valueOf());
console.log('candidate end  ', ne.format(), ne.valueOf());
console.log('s < ne ?', s.valueOf() < ne.valueOf());
console.log('t > ns ?', t.valueOf() > ns.valueOf());
console.log('t === ns ?', t.valueOf() === ns.valueOf());
