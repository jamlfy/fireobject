import { FieldValue } from '@google-cloud/firestore';
import { FireObject, field } from '../../src/orm';

interface CounterData {
  id: string;
  visits?: unknown;
  tags?: unknown;
  updatedAt?: unknown;
  legacyField?: unknown;
}

class Counter extends FireObject<CounterData> {
  @field() declare visits?: unknown;
  @field() declare tags?: unknown;
  @field() declare updatedAt?: unknown;
  @field() declare legacyField?: unknown;
}

describe('Firestore sentinels', () => {
  it('passes native FieldValue sentinels through data()', () => {
    const values = {
      visits: FieldValue.increment(1),
      tags: FieldValue.arrayUnion('beta'),
      updatedAt: FieldValue.serverTimestamp(),
      legacyField: FieldValue.delete(),
    };
    const counter = new Counter({ id: 'counter', ...values });

    expect(counter.data()).toMatchObject(values);
    expect(counter.data().visits).toBe(values.visits);
    expect(counter.data().tags).toBe(values.tags);
    expect(counter.data().updatedAt).toBe(values.updatedAt);
    expect(counter.data().legacyField).toBe(values.legacyField);
  });
});
