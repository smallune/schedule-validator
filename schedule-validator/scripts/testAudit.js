import { parseTime, daysOverlap, runAudit } from '../src/auditLogic.js';
import assert from 'assert';

console.log('🚀 Running Audit Logic Tests...\n');

// 1. Test parseTime
console.log('Testing parseTime...');
assert.deepStrictEqual(parseTime('0800-0920'), [480, 560]);
assert.deepStrictEqual(parseTime('1400-1520'), [840, 920]);
assert.deepStrictEqual(parseTime('invalid'), [null, null]);
assert.deepStrictEqual(parseTime('-'), [null, null]);
console.log('✅ parseTime passed');

// 2. Test daysOverlap
console.log('Testing daysOverlap...');
assert.strictEqual(daysOverlap('MW', 'M'), true);
assert.strictEqual(daysOverlap('MWF', 'TR'), false);
assert.strictEqual(daysOverlap('M', 'M'), true);
assert.strictEqual(daysOverlap('TBA', 'TBA'), true); // 'T' and 'A' overlap
console.log('✅ daysOverlap passed');

// 3. Test runAudit - Capacity
console.log('Testing runAudit: Capacity...');
const capSchedule = [
  { CRN: '123', Subject: 'CS', 'Course No': '101', 'Adj. Enrl': 30, 'Room Cap': 25, Room: 'Tyler 101' }
];
const capResults = runAudit(capSchedule, { capacity: true });
assert.strictEqual(capResults.capacity.length, 1);
assert.strictEqual(capResults.capacity[0].Deficit, 5);
console.log('✅ Capacity audit passed');

// 4. Test runAudit - Room Conflict (Edge Cases)
console.log('Testing runAudit: Room Conflict (Edge Cases)...');
const overlapSchedule = [
  // Overlap (starts during)
  { CRN: '101', Room: 'Room A', 'Days 1': 'M', 'Timeslot 1': '0900-1000', Subject: 'S1', 'Course No': '1' },
  { CRN: '102', Room: 'Room A', 'Days 1': 'M', 'Timeslot 1': '0930-1030', Subject: 'S2', 'Course No': '2' },
  // Sequential (No Overlap)
  { CRN: '103', Room: 'Room B', 'Days 1': 'M', 'Timeslot 1': '1100-1200', Subject: 'S3', 'Course No': '3' },
  { CRN: '104', Room: 'Room B', 'Days 1': 'M', 'Timeslot 1': '1200-1300', Subject: 'S4', 'Course No': '4' },
  // Entirely within
  { CRN: '105', Room: 'Room C', 'Days 1': 'M', 'Timeslot 1': '1400-1600', Subject: 'S5', 'Course No': '5' },
  { CRN: '106', Room: 'Room C', 'Days 1': 'M', 'Timeslot 1': '1430-1530', Subject: 'S6', 'Course No': '6' }
];
const overlapResults = runAudit(overlapSchedule, { rooms: true });
assert.strictEqual(overlapResults.roomConflicts.length, 2, 'Should find 2 overlaps (A and C)');
const conflictRooms = overlapResults.roomConflicts.map(c => c.Room);
assert.ok(conflictRooms.includes('Room A'));
assert.ok(conflictRooms.includes('Room C'));
assert.ok(!conflictRooms.includes('Room B'));
console.log('✅ Room conflict edge cases passed');

// 5. Test runAudit - Instructor Overlap
console.log('Testing runAudit: Instructor Overlap...');
const profSchedule = [
  { CRN: '201', 'Instr Last': 'Smith', 'Days 1': 'TR', 'Timeslot 1': '1100-1220', Subject: 'ECON', 'Course No': '101' },
  { CRN: '202', 'Instr Last': 'Smith', 'Days 1': 'R', 'Timeslot 1': '1200-1320', Subject: 'ECON', 'Course No': '301' }
];
const profResults = runAudit(profSchedule, { prof: true });
assert.strictEqual(profResults.profConflicts.length, 1);
assert.strictEqual(profResults.profConflicts[0].Instructor, 'Smith');
console.log('✅ Instructor overlap audit passed');

// 6. Test runAudit - TBA and Missing
console.log('Testing runAudit: TBA and Missing...');
const miscSchedule = [
  { CRN: '301', Room: 'TBA', Subject: 'ART', 'Course No': '100', 'Instr Last': 'Prof A' },
  { CRN: '302', Room: 'Room 1', Subject: 'MUS', 'Course No': '200', 'Instr Last': 'TBD' }
];
const miscResults = runAudit(miscSchedule, { tba: true, missing: true });
assert.strictEqual(miscResults.tbaCourses.length, 1, 'Should find 1 TBA room');
assert.strictEqual(miscResults.missingInstr.length, 1, 'Should find 1 missing instructor');
console.log('✅ TBA and Missing audit passed');

// 7. Test runAudit - Back-to-Back
console.log('Testing runAudit: Back-to-Back...');
const b2bSchedule = [
  { CRN: '401', 'Instr Last': 'Jones', 'Days 1': 'MW', 'Timeslot 1': '0900-0950' },
  { CRN: '402', 'Instr Last': 'Jones', 'Days 1': 'MW', 'Timeslot 1': '1000-1050' }
];
const b2bResults = runAudit(b2bSchedule, { backToBack: true });
assert.strictEqual(b2bResults.backToBack.length, 1);
assert.strictEqual(b2bResults.backToBack[0]['Gap (min)'], 10);
console.log('✅ Back-to-Back audit passed');

console.log('\n🎉 All tests passed successfully!');
