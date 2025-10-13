const { parseRange, isValidProjectName } = require('../src/utils');

describe('utils', () => {
  test('isValidProjectName', () => {
    expect(isValidProjectName('proj-1')).toBe(true);
    expect(isValidProjectName('a_b.c')).toBe(true);
    expect(isValidProjectName('')).toBe(false);
    expect(isValidProjectName('x'.repeat(101))).toBe(false);
    expect(isValidProjectName('bad name')).toBe(false);
  });
  test('parseRange', () => {
    const r1 = parseRange('today');
    expect(r1).not.toBeNull();
    const r2 = parseRange('last7d');
    expect(r2).not.toBeNull();
    expect(parseRange('xxx')).toBeNull();
  });
});

