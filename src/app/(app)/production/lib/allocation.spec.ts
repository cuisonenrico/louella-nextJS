import { describe, expect, it } from 'vitest';
import { allocation, startingYield } from './allocation';

describe('allocation', () => {
  it('flags branches given more than was baked', () => {
    expect(allocation(10, [8, 5])).toEqual({ assigned: 13, over: true });
    expect(allocation(13, [8, 5])).toEqual({ assigned: 13, over: false });
    expect(allocation(0, [])).toEqual({ assigned: 0, over: false });
  });
});

describe('startingYield', () => {
  it('starts from the plan when nothing is stored yet', () => {
    expect(startingYield(0, 24)).toEqual({ value: 24, fromPlan: true });
  });
  it('keeps a stored yield', () => {
    expect(startingYield(30, 24)).toEqual({ value: 30, fromPlan: false });
    expect(startingYield(0, 0)).toEqual({ value: 0, fromPlan: false });
  });
});
