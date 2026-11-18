import { createElement as h } from 'react';
import { act, create } from 'react-test-renderer';
import type { Selwise } from '../client.js';
import { SelwiseProvider, useOptionalSelwise, useSelwise } from './context.js';

/** `useOptionalSelwise` is the probe a component uses to work with or without a provider. */

const client = { marker: 'ambient' } as unknown as Selwise;

function probe(withProvider: boolean): Selwise | null | 'unset' {
  let seen: Selwise | null | 'unset' = 'unset';
  const Probe = () => {
    seen = useOptionalSelwise();
    return null;
  };
  act(() => {
    create(withProvider ? h(SelwiseProvider, { client, children: h(Probe) }) : h(Probe));
  });
  return seen;
}

describe('useOptionalSelwise', () => {
  it('is null outside a provider, where useSelwise() throws', () => {
    expect(probe(false)).toBeNull();
    const Strict = () => {
      useSelwise();
      return null;
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => act(() => void create(h(Strict)))).toThrow(/SelwiseProvider/);
    spy.mockRestore();
  });

  it('is the ambient client inside one', () => {
    expect(probe(true)).toBe(client);
  });
});
