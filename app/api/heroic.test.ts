import * as heroic from 'api/heroic';

import { assertModel } from './test-utils';

describe('heroic', () => {
  it('should handle Sampling', () => {
    assertModel(heroic.SumAggregation, {
      sampling: { size: 42, unit: 1 }
    }, { sampling: null });
  });

  it('should handle Query', () => {
    assertModel(heroic.Query, {
      range: { type: "absolute", start: 0, end: 1000 },
      query: "average by host",
      options: {
        ticksGoal: 1
      }
    }, { query: "foo" });
  });
});
