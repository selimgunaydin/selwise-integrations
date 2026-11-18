import { asRecord, isRecord } from './records.js';

describe('records', () => {
  it('takes a plain object and nothing else for a record', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('text')).toBe(false);
    expect(isRecord(3)).toBe(false);
  });

  it('answers an empty record for what is not one, and the same object for what is', () => {
    const value = { a: 1 };
    expect(asRecord(value)).toBe(value);
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord(null)).toEqual({});
    expect(asRecord('x')).toEqual({});
  });
});
