import assert from 'assert';
import { buildSuiteMatches } from '../src/services/genericService.js';

describe('genericService.buildSuiteMatches', () => {
  it('matches string numeric input as string and number', () => {
    const res = buildSuiteMatches('101');
    assert.ok(Array.isArray(res));
    // should include name: '101' and suite_number: '101' and suite_number: 101
    const hasName = res.some(r => r.name === '101');
    const hasStringNum = res.some(r => r.suite_number === '101');
    const hasNumberNum = res.some(r => r.suite_number === 101);
    assert.ok(hasName, 'should include { name: "101" }');
    assert.ok(hasStringNum, 'should include { suite_number: "101" }');
    assert.ok(hasNumberNum, 'should include { suite_number: 101 }');
  });

  it('matches non-numeric string only as string', () => {
    const res = buildSuiteMatches('A-1');
    assert.ok(res.some(r => r.name === 'A-1'));
    assert.ok(res.some(r => r.suite_number === 'A-1'));
    // should not include a numeric suite_number
    assert.ok(!res.some(r => typeof r.suite_number === 'number'));
  });

  it('handles numeric input (number type) correctly', () => {
    const res = buildSuiteMatches(202);
    assert.ok(res.some(r => r.name === '202'));
    assert.ok(res.some(r => r.suite_number === '202'));
    assert.ok(res.some(r => r.suite_number === 202));
  });
});
