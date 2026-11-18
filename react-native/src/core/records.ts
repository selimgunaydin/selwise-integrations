/**
 * The one "is this a plain object" test the package shares. An array is not a
 * record: a server answer that should be an object but arrives as a list is
 * treated as missing, never indexed by key.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value as a record, or an empty one when it is not (never null, never an array). */
export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
