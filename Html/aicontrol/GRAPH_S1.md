# Chaos Graph S1 — first working strategic planner

**Patch base:** `chaos(20261112-213105).zip`. The old `legacy` planner remains available and its source has not been changed.

## Installation

Extract the provided original archive. From the directory containing `index.html`:

```bash
git apply --check /path/to/chaos_graph_s1.patch
git apply /path/to/chaos_graph_s1.patch
```

Alternatively, use the full updated archive `chaos_graph_s1_full.zip`.

## How to enable and inspect

1. Load the game normally using its local web server, choose any AI-controlled player's creature, open **AITest (F8) → Strategy**.
2. Change the per-player strategic planner from `legacy` to `graph`.
3. Set `Max active goals` to 1, 2 (default), or 3. This changes the next strategic planning call only.
4. Advance one AI strategic turn. Reopen **Strategy** to inspect active goals, candidate values, assigned vs required strength, PREPARING/EXECUTING, interceptors and selected soldiers.
5. Choose `Graph S1 active goals` in the Strategy overlay (or click **Show Graph S1 goals on map**). Circles mark target zones/attack locations; color-coded lines connect allocated troops to goals; `DEF` marks interceptors.
6. **Map geometry → Topology graph over map** remains available for the raw G1/G2 graph. For HOLD geometry use existing `HOLD: area and slots` with a Graph S1-assigned HOLD unit.

Independent monsters keep `IndependentAIControl`. Wizard summon/Conjure probabilities and tactical profiles have NOT been changed.

## Implemented architecture

- `AITopologyRuntime`: shared cached topology. Uses live collision layer and scenario room metadata, re-builds on map object/metadata change or collision bitmap mutation (including hidden gate reveal). Static graph is built once per snapshot, not once per unit. Zones disconnected from all known friendly locations are excluded from decisions.
- `AITopologyGraph.areaZone`: original room/basin cells, separate from `cellZone` corridor catchments.
- `HOLD(graphZone)`: real room/basin mask and 4-connected flood fill; no corridors are automatically absorbed into HOLD; the tactical HOLD slot/defensive matrices remain the same.
- `GraphStrategicPlanner`: per-player registered `graph` implementation, with `plan(midTurn=false)` calling existing shared order APIs.
- Goal types: `ATTACK_WIZARD`, `CAPTURE_ZONE`, `HOLD_ZONE`. Existing CAPTURE objectives become HOLD only after observed defenders leave/die AND a friendly unit physically arrives in the original zone.
- Independent known-enemy wizard defense: reuses existing `AIControl.assignTargets()` for interceptor orders. Its reserved troops are removed from the goal allocation, and this defense is outside `maxActiveGoals`.
- Shortlist up to eight candidate goals. Enumerates all goal combinations up to configured `maxActiveGoals`, runs a side-effect-free per-combination greedy unit/goal assignment, scores each allocated portfolio, and applies one chosen plan.
- `GoalValue` and `RequiredStrength` are separate. `Readiness` and `PREPARING` enable a meaningful goal to gather forces before attacking. PREPARING soldiers temporarily GUARD their wizard (or HOLD in place without one).
- Persistence: hysteresis, per-unit switching cost, small bonus for keeping objectives. An under-resourced major goal that makes no strength progress over five strategic turns has a short cooldown. HOLD has no automatic timeout.
- `plan(true)` for mid-turn interruptions reserves defenders among units that can still act; it does not rewrite the active strategic portfolio until the next strategic turn.
- Structured orders retain `graphGoalKey` and `graphGoalType`, so planner re-instantiation can recover the basic intent. Map geometry is recalculated from runtime state rather than serialized into save games.

### Provisional parameters

In `Html/aicontrol/aiconfig.js`: `AI_GRAPH_S1_CONFIG` (initial `maxActiveGoals=2`, `maxCandidates=8`, enemy distance and strength thresholds, switching costs, readiness, preparing timeout). These values are an uncalibrated first baseline, **not** validated combat balance.

## Verification

```bash
node tests/ai_graph_s1.test.js
node tests/ai_strategic_planner.test.js
# Run all existing Node tests:
for t in tests/*.test.js; do node "$t"; done
```

New integration test covers: shared topology cache; original room vs corridor footprint; connected components / hidden sealed rooms; side-effect-free goal combination trial; up to 1, 2, 3 active goals; no double unit allocation; CAPTURE→HOLD only after arrival; unseen enemy ignored; old orders untouched for spent units during a mid-turn defense interruption; HOLD(graphZone) geometry; stability of existing orders in repeated strategic planning.

Legacy SHA regression, topology/geometry, A*/Dijkstra, GUARD/HOLD and AITest smoke checks are retained. **These are headless Node tests, not a full Phaser game-playthrough.** First testing should be in the live game (as agreed); AI-versus-AI benchmarks come later.

## Scope / known limitations

- S1 uses a short-horizon current-state portfolio, not minimax/MCTS/turn simulation.
- The existing `assignTargets()` is used for interception; S1 does not yet extract a separate `WizardDefenseMonitor` or promise exact tactical parity with Legacy's priority calculations.
- Weighted unit-to-goal distance is computed once per available unit per strategic turn using existing distance maps. Topology edges are for visibility and reachability; their geometric length is NOT used as weighted travel cost.
- Large arenas (`area > maxHoldArea`) are excluded from gratuitous HOLD goals. Any area can still be traversed or attacked.
- Revealing hidden passages rebuilds the topology; Graph S1 invalidates old zone assignments since watershed zone IDs can change.
- Mid-turn does not globally re-optimize the goal portfolio, only immediate wizard defense. Full plan is updated next normal turn.
- If no graph can be built, known existing orders persist, and unassigned troops fall back to GUARD or an ENGAGE against the nearest known wizard.
- Per-goal state is held in the planner instance; only basic intent is recovered after re-instantiation from structured orders. Full planner-specific state serialization is not yet implemented.
- Evaluation coefficients and combat readiness need several manual rounds of testing; do not over-interpret first results.
