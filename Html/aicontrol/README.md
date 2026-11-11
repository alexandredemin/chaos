# Chaos AI subsystem (post Order Model v2 refactor)

AI remains classic-script JavaScript (no ES modules, no bundler). `index.html` is
its dependency manifest: preserve the script order when adding a file.

## Runtime pipeline

```
AIControl / IndependentAIControl
  ├─ select strategic planner per player (AIStrategicPlannerRegistry)
  ├─ AILegacyStrategicPlanner -> original order-selection logic (unchanged)
  ├─ choose/maintain structured orders (AIOrder)
  ├─ AIHoldCoordinator  -> HoldArea, fixed geometry, dynamic incoming enemies
  ├─ AIGuardCoordinator -> defense scores, slot assignments
  ├─ AIMoveToNavigator -> risk-aware global A* + waypoints
  ├─ AIThreatSystem -> dynamic unit threats / danger maps
  └─ AITurnPlanner -> beam search: MOVE, ATTACK, FIRE, GAS, WEB, JUMP
       ├─ AIControl.getMultiSourceDistanceMap() -> Dijkstra / reverse Goal maps
       └─ AIPathfinder.findPath() -> macro-MOVE and global MOVE_TO
```

`IndependentAIControl` (from `independentai.js`) extends `AIControl`; its
behavior implementations live in `behaviors.js`.

## Files and owners

| File | Responsibility |
| --- | --- |
| `aistrategicplanner.js`, `ailegacystrategicplanner.js` | Strategy registry and extracted Legacy policy; Graph S1 will register separately |
| `aiconfig.js` | Shared constants: tactical profiles, HOLD/GUARD, navigation and turn defaults |
| `aiheap.js` | Shared binary min-heap used by Dijkstra and A* |
| `aislots.js` | Regret-greedy choice shared by GUARD and HOLD; scoring stays in coordinators |
| `aiorder.js` | First-class structured order model |
| `aicellpolicy.js` | Unit-sensitive hazard/slot policy and directed exit-cost transitions |
| `aipathfinder.js` | Universal forward A* with optional risk, max steps/cost, diagnostics |
| `ainavigator.js` | Risk-aware strategic MOVE_TO and intermediate waypoints |
| `aiguard.js` | Guard geometry, defensive slots and assignment |
| `aihold.js` | Area geometry, FireProtection/Control, incoming enemy direction, slots/focus |
| `aithreat.js` | Dynamic threat calculations |
| `aitraffic.js` | Movement/yield coordination |
| `aiturnplanner.js` | Short-turn tactical action search |
| `aicontrol.js` | Strategic planner dispatch, order lifecycle, Dijkstra and action executor |
| `aistrategicgeometry.js` | Wall distance transform and raw watershed room-like regions |
| `aitopologygraph.js` | Static G1 graph of zones + physical connections for generated/handmade maps |
| `aitest.js` | F6/F7/F8 diagnostic overlays in categories, per-player strategy selection and order override |
| `aimessages.js` | AI messages |
| `behaviors.js`, `independentai.js` | Independent creature behavior |
| `aitreesearch.js` | Existing tree-search subsystem, still loaded for compatibility |
| `legacy/aicontrol_old.js` | Archived AIControl; NOT loaded |

## Movement invariants

1. `AICellPolicy.transitionCost(unit, from, to)` is the shared traversal model.
   Web/Glue impose their penalty on **exit**. Risk-aware A* charges risk on
   entering the candidate position. Keep those terms separate.
2. `getMultiSourceDistanceMap({reverse:true})` computes directed costs **to**
   a destination. `getDistanceMap()` remains the compatible forward wrapper;
   the prior wave implementation remains commented within `aicontrol.js`.
3. Macro-MOVE must respect the actual one-turn physical-step and weighted-cost
   budget. Tactical MOVE, runtime movement and frontier escape have different
   responsibilities; do not merge their boundary checks blindly.
4. In Pathfinding Diagnostics only, an occupied **terminal goal cell** may be
   inspected as though its occupant were absent. All intermediate occupancy,
   hazard and terrain checks remain intact. Runtime MOVE cannot enter it.
5. HOLD's area describes its strategic responsibility, not a hard movement
   boundary; a current `focusTarget` changes the tactical goal temporarily.
6. `AIGuardCoordinator`/`AIHoldCoordinator` share the regret-greedy *selection*
   kernel but calculate slot values independently. Defensive slot choice is
   distinct from danger-aware tactical action choice.

## Testing

```sh
for t in tests/*.test.js; do node "$t"; done
```

Includes weighted A*/Dijkstra checks, the cell policy and defensive slots,
pathfinding overlays, occupied diagnostic-goal regression and script loading.
Headless JS tests do not substitute for tactical turn-by-turn Phaser tests.

## Change policy

Do not change tactical profiles while refactoring structure. Keep new AI tuning
constants in `aiconfig.js`, and add order-specific UI visualization to `aitest.js`.
For more aggressive splitting of `aicontrol.js`, first create gameplay fixtures
for MOVE_TO, GUARD, HOLD, ENGAGE, macro-MOVE, traffic/yield, abilities and
invisible-enemy detection so a regression can be diagnosed objectively.

## Strategic planner interface (S1.0)

`AIStrategicPlannerRegistry.register(id,ai=>new Planner(ai))` registers a planner;
`Planner.plan(midTurn=false)` is called from `AIControl.planning()` on normal turns
and on mid-turn invisible-unit discovery. The planner uses the existing
`AIControl.setOrder()`/`setEngageOrder()` etc. to assign orders; it does not
execute tactical actions or replace `AITurnPlanner`.

`AIControl.setStrategicPlanner(id)` selects a registered strategy for **that
player only**; selection is also stored as `player.strategicPlannerId`. F8's
**Strategy** category shows this choice and can switch it for the player's next
planning call. With only Legacy registered, that is the sole selection.
Independent creatures still use `IndependentAIControl.planning()` and their
own behavior system. The old Legacy planning logic is copied intact except
for redirecting `this` references to the owning `AIControl` instance.

Graph S1, goal allocation and maxActiveGoals tuning are **not implemented** in
this infrastructure-only step. Suggested future config: `maxActiveGoals:2`
(or `3` for comparisons), evaluated over candidate subsets with provisional
resource allocations before committing any order changes.
