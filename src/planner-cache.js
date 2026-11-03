// Compare captured state, including in-place edits, rather than object identity.
export function createPlannerCache(calculate) {
  let previousKey, previousResult;
  return state => {
    const key = JSON.stringify(state);
    if (key !== previousKey) {
      const result = calculate(state);
      previousKey = key;
      previousResult = result;
    }
    return previousResult;
  };
}

// The Damage path view always reads the build at 30% Fire Resistance. A build set to 30% is that same state, so its planner
// answers without another pass; any other setting has its own cached pass. A pass costs 0.5 s or more, so a view's render
// never calls calculatePlanner directly: a tab that re-renders on every open would pay it each time.
export const damagePathState = (state) => ({ ...state, combat: { ...state.combat, targetFireResistancePercent: 30 } });
export const damagePathPlanner = (state, planner, cached) => Number(state.combat.targetFireResistancePercent) === 30 ? planner : cached(damagePathState(state));
