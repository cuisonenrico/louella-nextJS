import { describe, it, expect } from 'vitest';
import { resolveDecisions } from './unknownDecisions';
import type { UnknownProduct } from '@/types';

function unknown(label: string, suggestedType: UnknownProduct['suggestedType'] = 'BREAD'): UnknownProduct {
  return {
    label,
    price: 10,
    page: 1,
    suggestedType,
    occurrences: 3,
    firstSeen: '2026-01-01',
    priceChanges: [{ price: 10, effectiveAt: '2026-01-01' }],
  };
}

describe('resolveDecisions', () => {
  it('reports nothing outstanding when there are no unknown labels', () => {
    expect(resolveDecisions([], {})).toEqual({
      createProducts: [],
      acknowledgeUnmatched: [],
      undecided: [],
    });
  });

  it('lists every undecided label so the import can be blocked', () => {
    const res = resolveDecisions([unknown('Choco Bar'), unknown('Ube Tart')], {});

    expect(res.undecided.map((u) => u.label)).toEqual(['Choco Bar', 'Ube Tart']);
  });

  it('carries the chosen type through to the create request', () => {
    const res = resolveDecisions([unknown('Choco Bar', 'BREAD')], {
      'Choco Bar': { kind: 'create', type: 'CAKE' },
    });

    expect(res.createProducts).toEqual([{ label: 'Choco Bar', type: 'CAKE' }]);
    expect(res.undecided).toEqual([]);
  });

  it('separates skipped labels from created ones', () => {
    const res = resolveDecisions([unknown('Choco Bar'), unknown('Pandesl')], {
      'Choco Bar': { kind: 'create', type: 'CAKE' },
      Pandesl: { kind: 'skip' },
    });

    expect(res.createProducts).toEqual([{ label: 'Choco Bar', type: 'CAKE' }]);
    expect(res.acknowledgeUnmatched).toEqual(['Pandesl']);
    expect(res.undecided).toEqual([]);
  });

  it('ignores a decision for a label the current preview does not contain', () => {
    // Decisions survive in component state; a fresh preview must not smuggle a
    // previous file's labels into the request, which the server would reject.
    const res = resolveDecisions([unknown('Choco Bar')], {
      'Choco Bar': { kind: 'create', type: 'CAKE' },
      Stale: { kind: 'create', type: 'BREAD' },
    });

    expect(res.createProducts).toEqual([{ label: 'Choco Bar', type: 'CAKE' }]);
  });

  it('keeps a label undecided until it is acted on, even when a type is suggested', () => {
    // The suggested type pre-fills the dropdown but must not count as a
    // decision: the operator has to look at every unknown name, because the
    // usual cause of one is a typo rather than a new product.
    const res = resolveDecisions([unknown('Pandesl')], {});

    expect(res.createProducts).toEqual([]);
    expect(res.acknowledgeUnmatched).toEqual([]);
    expect(res.undecided).toHaveLength(1);
  });
});
