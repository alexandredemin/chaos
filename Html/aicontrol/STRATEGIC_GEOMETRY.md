# Strategic geometry v1: room-like regions from walls (diagnostic only)

This is intentionally **not** the strategic planner. It creates a static
segmentation of any tilemap, including handmade maps without generator metadata.
No orders, HOLD assignments, A* costs or unit state are modified.

## Algorithm

`AIStrategicGeometry` (`aistrategicgeometry.js`):

1. `free`: passability from `wallsLayer.getTileAt(x,y)?.properties.collides`.
   Entity doors, Web, fire, units, etc. do **not** affect this static map.
   Out-of-bounds is treated as a virtual wall one tile outside the map.
2. `distance`: exact Euclidean distance to the closest wall tile **center**
   or to that virtual map border. Felzenszwalb/Huttenlocher separable squared
   distance transform: O(W×H), no Dijkstra movement penalties.
3. `peaks`: 4-connected plateau maxima (adjacent equally high tiles are one
   seed), with a representative cell and clearance radius.
4. `basin`: descending marker-controlled watershed; each free tile belongs to
   one of the original maximum's basins.
5. `seams`: for each neighboring pair of preliminary basins, record the
   largest clearance saddle on their shared boundary.
6. `region`: merge adjacent basins when the weaker peak is too close to its
   saddle (absolute or relative peak prominence), or when either fragment is
   below the configured minimum area. Output a connected region ID per tile.

The merge criterion for adjacent basins A and B is:

```
weakPeak = min(peakRadius[A], peakRadius[B])
prominence = max(0, weakPeak - saddleRadius)
merge = prominence < minProminence
     || prominence/weakPeak < minRelativeProminence
     || min(area[A],area[B]) < minRegionArea
```

Initially: `minProminence=1.25`, `minRelativeProminence=.30`,
`minRegionArea=10`. These are *hypotheses for visual calibration*, not tuned
or empirically validated gameplay thresholds. Source constants are in
`aiconfig.js`; F8 exposes temporary per-session overrides.

## F8 GUI and visual testing

1. Enter a game, select a unit, open F8 > **STRATEGIC GEOMETRY**.
   A unit is needed for AITest's UI only; it is **not used** by segmentation.
2. Under **AI overlay**, select:
   - **GEOMETRY: clearance** – continuous heatmap plus numerical distances;
   - **GEOMETRY: local maxima** – all plateau maxima marked `P#`;
   - **GEOMETRY: raw watershed basins** – colored pre-merge regions, `P#` labels;
   - **GEOMETRY: merged regions** – final colored regions, `R#` labels;
   - **GEOMETRY: final boundaries / saddles** – yellow border between final
     regions, `S<clearance>` indicates approximate saddle.
3. Change the absolute/relative prominence and min basin area to see where
   two neighboring basins merge. The calculation is regenerated when thresholds
   change.
4. **Rebuild geometry (after map edits)** invalidates the static cache and
   rereads wall tiles. Press this when manually editing the map in-place.
5. **Hide overlay** removes all Phaser graphics objects and labels.

Caching is keyed on tilemap/layer identity (not unit or order). The overlay is
static: it does not automatically update for terrain changed in-place.

## What to expect / known limitations

- Two rooms with a narrow opening usually become two distinct regions; an
  empty open arena ordinarily becomes one region.
- A room with a column, a broad connection or multiple alternative passages
  may split into several basins. Try changing merge thresholds before treating
  these as graph nodes. Visually verify with real maps.
- **U-shaped/open-sided cover** and isolated walls cannot reliably be captured
  using only clearance. This is deliberately deferred to a future
  visibility/enclosure-based enhancement, per the staged design decision.
- The algorithm provides **regions**, not gateway endpoints or a navigation
  graph; areas have not yet been evaluated for military/strategic value.
- Each free region is 4-connected. Diagonal corner-touching tiles are not a
  structural connection; do not compare region IDs directly with an 8-way
  unit-specific movement map.
- A single peak may cover a very long passage: no arbitrary length-based split
  is introduced in v1.
- `minRegionArea` merge is heuristic: two very small genuine rooms may merge.

## Tests

```
node tests/ai_strategic_geometry.test.js
for f in tests/*.test.js; do node "$f"; done
```

Tests include 80 random exact-distance comparisons against brute-force EDT,
30 random region connectivity tests, narrow-door separation, empty arena,
wall-disconnected components, threshold sensitivity, static map integration
and Phaser overlay object lifecycle with mocks.
