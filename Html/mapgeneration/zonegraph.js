// Chaos universal map generation: ZoneGraph infrastructure (v5.7)
// Ported from the validated standalone simulator. Keep this layer game-agnostic.

const DIR4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
const LOOP_RNG_SALT = 0xA511E9B3;
const ALCOVE_RNG_SALT = 0x6C8E9CF5;
const LAYOUT_RETRY_STEP = 0x9E3779B1;
const SKIRMISH_SPEC_RNG_SALT = 0x3C6EF372;
const SUPPORTED_ZONE_GENERATORS = Object.freeze(new Set(['bsp', 'special', 'arena']));

function cloneJSON(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function isInt(value) {
    return Number.isInteger(value);
}
class RectGeometry {
    static sharedBoundary(a, b) {
        const ar = a.rect, br = b.rect;
        const arx = ar.x + ar.w, ary = ar.y + ar.h, brx = br.x + br.w, bry = br.y + br.h;
        if (arx === br.x || brx === ar.x) {
            const y1 = Math.max(ar.y, br.y), y2 = Math.min(ary, bry);
            if (y2 <= y1) return null;
            const aLeft = arx === br.x;
            return { orientation: 'vertical', start: y1, end: y2 - 1, aSide: aLeft ? 'E' : 'W', bSide: aLeft ? 'W' : 'E' };
        }
        if (ary === br.y || bry === ar.y) {
            const x1 = Math.max(ar.x, br.x), x2 = Math.min(arx, brx);
            if (x2 <= x1) return null;
            const aTop = ary === br.y;
            return { orientation: 'horizontal', start: x1, end: x2 - 1, aSide: aTop ? 'S' : 'N', bSide: aTop ? 'N' : 'S' };
        }
        return null;
    }
    static safeGateRange(a, b, shared) {
        if (!shared) return null;
        const axisRange = z => shared.orientation === 'vertical'
            ? { lo: z.rect.y + 2, hi: z.rect.y + z.rect.h - 3 }
            : { lo: z.rect.x + 2, hi: z.rect.x + z.rect.w - 3 };
        const ra = axisRange(a), rb = axisRange(b);
        const lo = Math.max(shared.start, ra.lo, rb.lo), hi = Math.min(shared.end, ra.hi, rb.hi);
        return hi >= lo ? { lo, hi } : null;
    }
    static overlaps(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }
    static inside(outer, inner) {
        return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
    }
}
class GridAllocator {
    static allocate(total, weights) {
        const sum = weights.reduce((a, b) => a + b, 0);
        const raw = weights.map(v => total * v / sum), sizes = raw.map(Math.floor);
        let left = total - sizes.reduce((a, b) => a + b, 0);
        const order = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i);
        for (let k = 0; k < left; k++) sizes[order[k % order.length].i]++;
        return sizes;
    }
    static offsets(sizes, start) {
        const out = [start];
        for (const n of sizes) out.push(out[out.length - 1] + n);
        return out;
    }
    static allocateWithMinimum(total, weights, minimums) {
        const mins = minimums.slice();
        const minTotal = mins.reduce((a, b) => a + b, 0);
        if (minTotal > total) throw new Error('Automatic layout needs at least ' + minTotal + ' cells, but only ' + total + ' are available');
        const rest = total - minTotal;
        if (!rest) return mins;
        const extra = this.allocate(rest, weights);
        return mins.map((v, i) => v + extra[i]);
    }
}
class ZoneGraphSpecValidator {
    static _assert(ok, message) {
        if (!ok) throw new Error('Invalid ZoneGraphSpec: ' + message);
    }
    static _validatePositiveWeights(value, label) {
        if (Array.isArray(value)) {
            this._assert(value.length > 0, label + ' must not be empty');
            for (let i = 0; i < value.length; i++)
                this._assert(isFiniteNumber(value[i]) && value[i] > 0, label + '[' + i + '] must be a positive number');
            return value.length;
        }
        this._assert(isInt(value) && value > 0, label + ' must be a positive integer or an array of positive weights');
        return value;
    }
    static _validateGeneration(generation = {}) {
        const bounded = (name, lo, hi) => {
            if (generation[name] == null) return;
            this._assert(isFiniteNumber(generation[name]) && generation[name] >= lo && generation[name] <= hi, 'generation.' + name + ' must be in [' + lo + ', ' + hi + ']');
        };
        const pos = name => {
            if (generation[name] == null) return;
            this._assert(isFiniteNumber(generation[name]) && generation[name] > 0, 'generation.' + name + ' must be > 0');
        };
        const nonNegInt = name => {
            if (generation[name] == null) return;
            this._assert(isInt(generation[name]) && generation[name] >= 0, 'generation.' + name + ' must be a non-negative integer');
        };
        bounded('loopRatio', 0, 1);
        if (generation.zoneAttempts != null)
            this._assert(isInt(generation.zoneAttempts) && generation.zoneAttempts >= 1, 'generation.zoneAttempts must be a positive integer');
        pos('roomAreaTarget');
        for (const n of ['alcoveRoomCount','alcoveNicheCount','alcoveRoomTunnel','alcoveNicheTunnel']) nonNegInt(n);
        for (const n of ['alcoveRoomMin','alcoveRoomMax','alcoveNicheMin','alcoveNicheMax']) {
            if (generation[n] != null) this._assert(isInt(generation[n]) && generation[n] >= 1, 'generation.' + n + ' must be a positive integer');
        }
        if (generation.alcoveRoomMin != null && generation.alcoveRoomMax != null)
            this._assert(generation.alcoveRoomMin <= generation.alcoveRoomMax, 'alcoveRoomMin must be <= alcoveRoomMax');
        if (generation.alcoveNicheMin != null && generation.alcoveNicheMax != null)
            this._assert(generation.alcoveNicheMin <= generation.alcoveNicheMax, 'alcoveNicheMin must be <= alcoveNicheMax');
    }
    static validate(spec, { width, height, margin, layoutMode = 'manual' } = {}) {
        this._assert(spec instanceof ZoneGraphSpec, 'expected ZoneGraphSpec');
        this._assert(layoutMode === 'manual' || layoutMode === 'auto', 'layoutMode must be manual or auto');
        this._assert(isInt(width) && width > 0, 'map.width must be a positive integer');
        this._assert(isInt(height) && height > 0, 'map.height must be a positive integer');
        this._assert(isInt(margin) && margin >= 1, 'map.margin must be an integer >= 1');
        this._assert(width - margin * 2 >= 3 && height - margin * 2 >= 3, 'map interior is too small');
        this._validateGeneration(spec.generation || {});
        this._assert(Array.isArray(spec.zones) && spec.zones.length > 0, 'zones must contain at least one zone');
        const ids = new Set();
        for (let i = 0; i < spec.zones.length; i++) {
            const z = spec.zones[i];
            this._assert(typeof z.id === 'string' && z.id.trim().length > 0, 'zones[' + i + '].id must be a non-empty string');
            this._assert(!ids.has(z.id), 'duplicate zone id "' + z.id + '"');
            ids.add(z.id);
            if (z.generator != null)
                this._assert(SUPPORTED_ZONE_GENERATORS.has(z.generator), 'zone ' + z.id + ' uses unsupported generator "' + z.generator + '"');
            const l = z.layout || {};
            const hasGrid = l.grid != null, hasRect = l.rect != null;
            if (layoutMode === 'manual')
                this._assert(hasGrid !== hasRect, 'zone ' + z.id + ' must define exactly one of layout.grid or layout.rect');
            else
                this._assert(!hasGrid && !hasRect, 'zone ' + z.id + ' must omit layout.grid/layout.rect in automatic layout mode');
            if (z.size != null) {
                this._assert(typeof z.size === 'object' && !Array.isArray(z.size), 'zone ' + z.id + ' size must be an object');
                if (z.size.weight != null) this._assert(isFiniteNumber(z.size.weight) && z.size.weight > 0, 'zone ' + z.id + ' size.weight must be > 0');
                for (const key of ['minWidth','minHeight']) if (z.size[key] != null)
                    this._assert(isInt(z.size[key]) && z.size[key] >= 3, 'zone ' + z.id + ' size.' + key + ' must be an integer >= 3');
            }
            const prefer = z.layoutHints && z.layoutHints.prefer;
            if (prefer != null) this._assert(['north','south','west','east','center'].includes(prefer), 'zone ' + z.id + ' layoutHints.prefer must be north/south/west/east/center');
            if (hasGrid) {
                const g = l.grid;
                const col = g.col ?? g.x ?? 0, row = g.row ?? g.y ?? 0, colSpan = g.colSpan ?? g.w ?? 1, rowSpan = g.rowSpan ?? g.h ?? 1;
                this._assert(isInt(col) && col >= 0, 'zone ' + z.id + ' grid.col must be a non-negative integer');
                this._assert(isInt(row) && row >= 0, 'zone ' + z.id + ' grid.row must be a non-negative integer');
                this._assert(isInt(colSpan) && colSpan >= 1, 'zone ' + z.id + ' grid.colSpan must be a positive integer');
                this._assert(isInt(rowSpan) && rowSpan >= 1, 'zone ' + z.id + ' grid.rowSpan must be a positive integer');
            }
            if (hasRect) {
                const r = l.rect;
                for (const k of ['x','y','w','h']) this._assert(isInt(r[k]), 'zone ' + z.id + ' rect.' + k + ' must be an integer');
                this._assert(r.w >= 3 && r.h >= 3, 'zone ' + z.id + ' rect must be at least 3x3');
            }
        }
        const usesGrid = spec.zones.some(z => z.layout && z.layout.grid);
        if (layoutMode === 'auto') {
            const type = spec.layout && spec.layout.type;
            this._assert(type == null || type === 'auto', 'layout.type must be "auto" in automatic layout mode');
            const auto = spec.layout && spec.layout.auto || {};
            if (auto.maxBacktracks != null) this._assert(isInt(auto.maxBacktracks) && auto.maxBacktracks >= 100, 'layout.auto.maxBacktracks must be an integer >= 100');
            if (auto.seed != null) this._assert(isInt(auto.seed) && auto.seed >= 1, 'layout.auto.seed must be a positive integer');
        }
        if (usesGrid) {
            const type = spec.layout && spec.layout.type;
            this._assert(type == null || type === 'grid', 'layout.type must be "grid" when grid placement is used');
            const grid = spec.layout && spec.layout.grid;
            this._assert(grid && grid.columns != null && grid.rows != null, 'layout.grid.columns and layout.grid.rows are required');
            this._validatePositiveWeights(grid.columns, 'layout.grid.columns');
            this._validatePositiveWeights(grid.rows, 'layout.grid.rows');
        }
        const edgeKeys = new Set(), edgeIds = new Set(), degrees = new Map([...ids].map(id => [id, 0]));
        this._assert(Array.isArray(spec.edges), 'edges must be an array');
        for (let i = 0; i < spec.edges.length; i++) {
            const e = spec.edges[i];
            this._assert(ids.has(e.a) && ids.has(e.b), 'edge ' + i + ' references unknown zone: ' + e.a + ' ↔ ' + e.b);
            this._assert(e.a !== e.b, 'self-edge is not allowed for zone ' + e.a);
            const connection = e.connection || 'boundary';
            this._assert(connection === 'boundary', 'edge ' + e.a + ' ↔ ' + e.b + ' uses unsupported connection "' + connection + '"');
            this._assert(e.required !== false, 'optional graph edges are not implemented yet; omit required or set it to true for ' + e.a + ' ↔ ' + e.b);
            const key = e.a < e.b ? e.a + '\u0000' + e.b : e.b + '\u0000' + e.a;
            this._assert(!edgeKeys.has(key), 'duplicate edge ' + e.a + ' ↔ ' + e.b);
            edgeKeys.add(key);
            if (e.id != null) {
                this._assert(typeof e.id === 'string' && e.id.length > 0, 'edge id must be a non-empty string');
                this._assert(!edgeIds.has(e.id), 'duplicate edge id "' + e.id + '"');
                edgeIds.add(e.id);
            }
            degrees.set(e.a, degrees.get(e.a) + 1); degrees.set(e.b, degrees.get(e.b) + 1);
        }
        if (spec.zones.length > 1) {
            const adj = new Map([...ids].map(id => [id, []]));
            for (const e of spec.edges) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); }
            const start = spec.zones[0].id, seen = new Set([start]), q = [start];
            for (let qi = 0; qi < q.length; qi++) for (const n of adj.get(q[qi])) if (!seen.has(n)) { seen.add(n); q.push(n); }
            this._assert(seen.size === spec.zones.length, 'zone graph is disconnected');
        }
        for (const z of spec.zones) {
            const isSpecial = z.generator === 'special' || z.role === 'special' || z.specialType;
            if (isSpecial) this._assert((degrees.get(z.id) || 0) >= 1, 'special zone ' + z.id + ' must have at least one graph edge');
        }
        return true;
    }
}

class RNG {
    constructor(seed = 1) { this.state = (seed >>> 0) || 1; }
    next() { let t = this.state += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    int(a, b) { if (b <= a)
        return a; return Math.floor(this.next() * (b - a + 1)) + a; }
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) {
        const j = this.int(0, i), t = a[i];
        a[i] = a[j];
        a[j] = t;
    } return a; }
}
class MinHeap {
    constructor() { this.data = []; }
    get length() { return this.data.length; }
    push(item) { const a = this.data; a.push(item); let i = a.length - 1; while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= item.f)
            break;
        a[i] = a[p];
        i = p;
    } a[i] = item; }
    pop() { const a = this.data; if (!a.length)
        return null; const root = a[0], last = a.pop(); if (!a.length)
        return root; let i = 0; while (true) {
        let l = i * 2 + 1, r = l + 1;
        if (l >= a.length)
            break;
        let c = r < a.length && a[r].f < a[l].f ? r : l;
        if (a[c].f >= last.f)
            break;
        a[i] = a[c];
        i = c;
    } a[i] = last; return root; }
}

class ZoneGraphSpec {
    constructor({ id = 'map', map = {}, generation = {}, layout = {}, zones = [], edges = [], meta = {} } = {}) {
        if (!Array.isArray(zones)) throw new Error('Invalid ZoneGraphSpec: zones must be an array');
        if (!Array.isArray(edges)) throw new Error('Invalid ZoneGraphSpec: edges must be an array');
        this.id = id;
        this.map = { ...map };
        this.generation = { ...generation };
        this.layout = cloneJSON(layout || {});
        this.zones = zones.map(z => ({
            ...z,
            size: z.size ? { ...z.size } : undefined,
            layout: cloneJSON(z.layout),
            layoutHints: z.layoutHints ? { ...z.layoutHints } : undefined
        }));
        this.edges = edges.map(e => ({ ...e }));
        this.meta = { ...meta };
    }
    toJSON() {
        return {
            id: this.id,
            map: { ...this.map },
            generation: { ...this.generation },
            layout: cloneJSON(this.layout || {}),
            zones: cloneJSON(this.zones),
            edges: this.edges.map(e => ({ ...e })),
            meta: { ...this.meta }
        };
    }
}
class ZoneLayout {
    constructor({ width, height, zones = [], edges = [], spec = null, meta = {} } = {}) {
        this.width = width;
        this.height = height;
        this.spec = spec || null;
        this.meta = { ...meta };
        this.zones = zones.map(z => ({
            ...z,
            rect: { ...z.rect },
            gates: []
        }));
        this.edges = edges.map(e => ({
            ...e,
            gates: [],
            gate: null
        }));
    }
    cloneForGeneration() {
        return new ZoneLayout({
            width: this.width,
            height: this.height,
            zones: this.zones,
            edges: this.edges,
            spec: this.spec,
            meta: this.meta
        });
    }
    toJSON() {
        return {
            width: this.width,
            height: this.height,
            zones: this.zones.map(z => {
                const out = { ...z, rect: { ...z.rect } };
                delete out.gates;
                delete out.rooms;
                delete out.floor;
                delete out.fallback;
                return out;
            }),
            edges: this.edges.map(e => ({ id: e.id, a: e.a, b: e.b, type: e.type || 'required' })),
            meta: { ...this.meta }
        };
    }
}
class SkirmishZoneGraphFactory {
    static create(template, cfg = {}, specialCount = null, seed = null) {
        const raw = template instanceof ZoneGraphSpec ? template.toJSON() : cloneJSON(template || SKIRMISH_ARENA_TEMPLATE);
        const actualSeed = seed ?? cfg.seed ?? 1;
        const requestedSpecial = Math.max(0, Math.min(8, specialCount ?? cfg.specialCount ?? raw.meta?.defaultSpecialCount ?? 2));
        raw.id = raw.id || 'skirmish-arena-auto';
        raw.map = { ...(raw.map || {}), width: cfg.width ?? raw.map?.width ?? 40, height: cfg.height ?? raw.map?.height ?? 40, margin: raw.map?.margin ?? 1 };
        raw.layout = cloneJSON(raw.layout || {});
        raw.layout.type = 'auto';
        raw.layout.auto = { ...(raw.layout.auto || {}), maxBacktracks: raw.layout.auto?.maxBacktracks ?? 50000 };
        delete raw.layout.auto.seed;
        raw.generation = {
            ...(raw.generation || {}),
            loopRatio: cfg.loopRatio ?? raw.generation?.loopRatio ?? .15,
            zoneAttempts: cfg.zoneAttempts ?? raw.generation?.zoneAttempts ?? 40,
            roomAreaTarget: cfg.roomAreaTarget ?? raw.generation?.roomAreaTarget ?? 68,
            alcoveRoomCount: cfg.alcoveRoomCount ?? raw.generation?.alcoveRoomCount ?? 2,
            alcoveRoomMin: cfg.alcoveRoomMin ?? raw.generation?.alcoveRoomMin ?? 2,
            alcoveRoomMax: cfg.alcoveRoomMax ?? raw.generation?.alcoveRoomMax ?? 3,
            alcoveRoomTunnel: cfg.alcoveRoomTunnel ?? raw.generation?.alcoveRoomTunnel ?? 4,
            alcoveNicheCount: cfg.alcoveNicheCount ?? raw.generation?.alcoveNicheCount ?? 3,
            alcoveNicheMin: cfg.alcoveNicheMin ?? raw.generation?.alcoveNicheMin ?? 1,
            alcoveNicheMax: cfg.alcoveNicheMax ?? raw.generation?.alcoveNicheMax ?? 2,
            alcoveNicheTunnel: cfg.alcoveNicheTunnel ?? raw.generation?.alcoveNicheTunnel ?? 1
        };
        const arena = raw.zones.find(z => z.id === 'arena' || z.role === 'arena' || z.generator === 'arena');
        if (!arena) throw new Error('Skirmish template requires one arena zone');
        arena.size = { ...(arena.size || {}), weight: cfg.arenaWeight ?? arena.size?.weight ?? 4 };
        const candidates = raw.zones.filter(z => z.metadata?.skirmishSlot);
        for (const z of candidates) {
            z.role = 'normal';
            z.generator = 'bsp';
            delete z.specialType;
        }
        // The template is a fixed 3x3 logical graph. Estimate its resolved row/column spans
        // with the same allocator used by AutomaticZoneLayoutPlanner, without invoking a second planner.
        const margin = raw.map.margin ?? 1, innerW = raw.map.width - margin * 2, innerH = raw.map.height - margin * 2;
        const centerWeight = Math.sqrt(arena.size?.weight || 4);
        const colSizes = GridAllocator.allocateWithMinimum(innerW, [1, centerWeight, 1], [5, 8, 5]);
        const rowSizes = GridAllocator.allocateWithMinimum(innerH, [1, centerWeight, 1], [5, 8, 5]);
        const slotCell = { nw:[0,0], n:[1,0], ne:[2,0], w:[0,1], e:[2,1], sw:[0,2], s:[1,2], se:[2,2] };
        const feasible = candidates.filter(z => {
            const cell = slotCell[z.metadata?.skirmishSlot];
            if (!cell) return false;
            const rw = colSizes[cell[0]], rh = rowSizes[cell[1]];
            return z.metadata?.slotClass === 'corner' ? Math.min(rw, rh) >= 5 : Math.min(rw, rh) >= 7;
        });
        if (feasible.length < requestedSpecial)
            throw new Error('Skirmish template has only ' + feasible.length + ' geometrically feasible special slots at ' + raw.map.width + 'x' + raw.map.height + ', requested ' + requestedSpecial);
        const rng = new RNG((actualSeed ^ SKIRMISH_SPEC_RNG_SALT) >>> 0);
        const shuffled = rng.shuffle(feasible.slice());
        const selected = shuffled.slice(0, requestedSpecial);
        const types = ['treasury', 'library'];
        selected.forEach((z, i) => {
            const t = types[i % types.length];
            z.role = t;
            z.generator = 'special';
            z.specialType = t;
        });
        raw.meta = {
            ...(raw.meta || {}),
            generatedBy: 'SkirmishZoneGraphFactory',
            template: raw.meta?.template || 'skirmish-arena-3x3-auto',
            requestedSpecialCount: requestedSpecial,
            selectedSpecialSlots: selected.map(z => z.metadata.skirmishSlot),
            feasibleSpecialSlots: feasible.map(z => z.metadata.skirmishSlot)
        };
        return new ZoneGraphSpec(raw);
    }
}
class ManualZoneLayoutPlanner {
    constructor(spec, cfg = {}) {
        this.spec = spec instanceof ZoneGraphSpec ? spec : new ZoneGraphSpec(spec || {});
        this.width = this.spec.map.width ?? cfg.width ?? 40;
        this.height = this.spec.map.height ?? cfg.height ?? 40;
        this.margin = this.spec.map.margin ?? 1;
    }
    _allocate(total, weights) { return GridAllocator.allocate(total, weights); }
    _offsets(sizes, start) { return GridAllocator.offsets(sizes, start); }
    _sharedBoundary(a, b) { return RectGeometry.sharedBoundary(a, b); }
    _safeGateRange(a, b, s) { return RectGeometry.safeGateRange(a, b, s); }
    _zoneType(z) {
        if (z.generator === 'arena' || z.role === 'arena') return 'arena';
        if (z.generator === 'special' || z.role === 'special' || z.specialType) return 'special';
        return 'normal';
    }
    _gridRect(z, grid, xOff, yOff) {
        const g = z.layout && z.layout.grid;
        if (!g) return null;
        const col = g.col ?? g.x ?? 0, row = g.row ?? g.y ?? 0, colSpan = g.colSpan ?? g.w ?? 1, rowSpan = g.rowSpan ?? g.h ?? 1;
        if (col < 0 || row < 0 || colSpan < 1 || rowSpan < 1 || col + colSpan > grid.cols || row + rowSpan > grid.rows)
            throw new Error('Invalid grid placement for zone ' + z.id);
        return { x: xOff[col], y: yOff[row], w: xOff[col + colSpan] - xOff[col], h: yOff[row + rowSpan] - yOff[row] };
    }
    _validateRects(zones, root) {
        for (const z of zones) {
            const r = z.rect;
            if (!r || r.w < 3 || r.h < 3) throw new Error('Zone ' + z.id + ' is too small or has no rect');
            if (!RectGeometry.inside(root, r))
                throw new Error('Zone ' + z.id + ' lies outside the map interior');
        }
        for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
            const a = zones[i].rect, b = zones[j].rect;
            if (RectGeometry.overlaps(a, b))
                throw new Error('Zones overlap: ' + zones[i].id + ' and ' + zones[j].id);
        }
    }
    plan() {
        ZoneGraphSpecValidator.validate(this.spec, { width: this.width, height: this.height, margin: this.margin, layoutMode: 'manual' });
        const root = { x: this.margin, y: this.margin, w: this.width - this.margin * 2, h: this.height - this.margin * 2 };
        if (root.w < 3 || root.h < 3) throw new Error('Map is too small');
        const layoutCfg = this.spec.layout || {}, gridCfg = layoutCfg.grid || {};
        let grid = null, xOff = null, yOff = null;
        const usesGrid = this.spec.zones.some(z => z.layout && z.layout.grid);
        if (usesGrid) {
            const colWeights = Array.isArray(gridCfg.columns) ? gridCfg.columns.slice() : Array(gridCfg.columns).fill(1);
            const rowWeights = Array.isArray(gridCfg.rows) ? gridCfg.rows.slice() : Array(gridCfg.rows).fill(1);
            grid = { cols: colWeights.length, rows: rowWeights.length };
            const colSizes = this._allocate(root.w, colWeights), rowSizes = this._allocate(root.h, rowWeights);
            xOff = this._offsets(colSizes, root.x); yOff = this._offsets(rowSizes, root.y);
        }
        const zones = this.spec.zones.map((z, i) => {
            const explicit = z.layout && z.layout.rect ? { ...z.layout.rect } : null;
            const rect = explicit || (usesGrid ? this._gridRect(z, grid, xOff, yOff) : null);
            if (!rect) throw new Error('Zone ' + z.id + ' needs layout.rect or layout.grid');
            const type = this._zoneType(z), hints = z.layoutHints || {};
            return {
                id: z.id,
                type,
                role: z.role || type,
                generator: z.generator || (type === 'special' ? 'special' : type === 'arena' ? 'arena' : 'bsp'),
                roomType: type === 'special' ? (z.specialType || (z.role && z.role !== 'special' ? z.role : 'treasury')) : undefined,
                specialType: z.specialType || null,
                rect,
                sourceZone: hints.sourceZone || null,
                slot: hints.slot || null,
                corner: hints.slot || null,
                slotClass: hints.slotClass || null,
                slotAxis: hints.slotAxis || null,
                metadata: cloneJSON(z.metadata)
            };
        });
        this._validateRects(zones, root);
        const byId = new Map(zones.map(z => [z.id, z]));
        const reservedEdgeIds = new Set(this.spec.edges.filter(e => e.id != null).map(e => e.id));
        const allocatedEdgeIds = new Set();
        const edgeIdFor = (e, i) => {
            if (e.id != null) { allocatedEdgeIds.add(e.id); return e.id; }
            let candidate = 'e' + i, suffix = 0;
            while (reservedEdgeIds.has(candidate) || allocatedEdgeIds.has(candidate))
                candidate = 'auto_e' + i + (suffix++ ? '_' + suffix : '');
            allocatedEdgeIds.add(candidate);
            return candidate;
        };
        const edges = this.spec.edges.map((e, i) => {
            const a = byId.get(e.a), b = byId.get(e.b);
            if (!a || !b) throw new Error('Edge references unknown zone: ' + e.a + ' ↔ ' + e.b);
            const connection = e.connection || 'boundary';
            if (connection !== 'boundary') throw new Error('v5.5 supports only boundary edges; unsupported connection=' + connection + ' for ' + e.a + ' ↔ ' + e.b);
            const shared = this._sharedBoundary(a, b);
            if (!shared) throw new Error('Boundary edge zones do not share a side: ' + e.a + ' ↔ ' + e.b);
            if (!this._safeGateRange(a, b, shared)) throw new Error('Shared boundary is too short for a safe gate: ' + e.a + ' ↔ ' + e.b);
            return { id: edgeIdFor(e, i), a: e.a, b: e.b, type: 'required', connection, gate: null, gates: [] };
        });
        const layout = new ZoneLayout({
            width: this.width,
            height: this.height,
            zones,
            edges,
            spec: this.spec,
            meta: { planner: 'ManualZoneLayoutPlanner', root, grid: grid ? { ...grid } : null }
        });
        return { spec: this.spec, layout, root, selected: [] };
    }
}


class AutomaticZoneLayoutPlanner {
    constructor(spec, cfg = {}) {
        this.spec = spec instanceof ZoneGraphSpec ? spec : new ZoneGraphSpec(spec || {});
        this.width = this.spec.map.width ?? cfg.width ?? 40;
        this.height = this.spec.map.height ?? cfg.height ?? 40;
        this.margin = this.spec.map.margin ?? 1;
        this.seed = this.spec.layout?.auto?.seed ?? cfg.seed ?? 1;
        this.maxBacktracks = this.spec.layout?.auto?.maxBacktracks ?? 50000;
        this.rng = new RNG((this.seed ^ 0x41C64E6D) >>> 0);
    }
    _zoneType(z) {
        if (z.generator === 'arena' || z.role === 'arena') return 'arena';
        if (z.generator === 'special' || z.role === 'special' || z.specialType) return 'special';
        return 'normal';
    }
    _adjacency() {
        const adj = new Map(this.spec.zones.map(z => [z.id, []]));
        for (const e of this.spec.edges) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); }
        return adj;
    }
    _pickRoot(adj) {
        const centered = this.spec.zones.filter(z => z.layoutHints?.prefer === 'center');
        const pool = centered.length ? centered : this.spec.zones;
        return pool.slice().sort((a, b) => (adj.get(b.id).length - adj.get(a.id).length) || ((b.size?.weight || 1) - (a.size?.weight || 1)) || a.id.localeCompare(b.id))[0];
    }
    _hintPenalty(zone, p) {
        const pref = zone.layoutHints?.prefer;
        if (!pref || pref === 'center') return 0;
        if (pref === 'north') return p.y * 8 + Math.abs(p.x);
        if (pref === 'south') return -p.y * 8 + Math.abs(p.x);
        if (pref === 'west') return p.x * 8 + Math.abs(p.y);
        if (pref === 'east') return -p.x * 8 + Math.abs(p.y);
        return 0;
    }
    _boundingScore(positions, candidate) {
        let minX = candidate.x, maxX = candidate.x, minY = candidate.y, maxY = candidate.y;
        for (const p of positions.values()) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        }
        const w = maxX - minX + 1, h = maxY - minY + 1;
        return w * h * 20 + (w + h) * 2;
    }
    _embed(adj) {
        const color = new Map();
        for (const start of this.spec.zones.map(z => z.id)) if (!color.has(start)) {
            color.set(start, 0); const q = [start];
            for (let qi = 0; qi < q.length; qi++) {
                const id = q[qi];
                for (const n of adj.get(id)) {
                    if (!color.has(n)) { color.set(n, 1 - color.get(id)); q.push(n); }
                    else if (color.get(n) === color.get(id))
                        throw new Error('Automatic orthogonal layout cannot embed an odd cycle (' + id + ' ↔ ' + n + '). Use Manual/Grid for this graph.');
                }
            }
        }
        for (const z of this.spec.zones) if (adj.get(z.id).length > 4)
            throw new Error('Automatic layout cannot embed zone ' + z.id + ' with degree ' + adj.get(z.id).length + '; orthogonal auto layout supports degree <= 4. Use Manual/Grid for this graph.');
        const root = this._pickRoot(adj), byId = new Map(this.spec.zones.map(z => [z.id, z]));
        const positions = new Map([[root.id, { x: 0, y: 0 }]]), occupied = new Map([['0,0', root.id]]);
        let backtracks = 0;
        const neighborsOfCell = p => DIR4.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }));
        const key = p => p.x + ',' + p.y;
        const candidateIntersection = id => {
            const placedNeighbors = adj.get(id).filter(n => positions.has(n));
            if (!placedNeighbors.length) return [];
            let candidates = neighborsOfCell(positions.get(placedNeighbors[0]));
            for (let i = 1; i < placedNeighbors.length; i++) {
                const allowed = new Set(neighborsOfCell(positions.get(placedNeighbors[i])).map(key));
                candidates = candidates.filter(p => allowed.has(key(p)));
            }
            return candidates.filter(p => !occupied.has(key(p)));
        };
        const chooseNext = () => {
            const unplaced = this.spec.zones.filter(z => !positions.has(z.id));
            unplaced.sort((a, b) => {
                const ap = adj.get(a.id).filter(n => positions.has(n)).length, bp = adj.get(b.id).filter(n => positions.has(n)).length;
                return (bp - ap) || (adj.get(b.id).length - adj.get(a.id).length) || a.id.localeCompare(b.id);
            });
            return unplaced[0];
        };
        const recurse = () => {
            if (positions.size === this.spec.zones.length) return true;
            if (++backtracks > this.maxBacktracks) return false;
            const zone = chooseNext(), candidates = candidateIntersection(zone.id);
            if (!candidates.length) return false;
            const jitter = new Map(candidates.map(p => [key(p), this.rng.next()]));
            candidates.sort((a, b) => {
                const sa = this._hintPenalty(zone, a) * 100 + this._boundingScore(positions, a);
                const sb = this._hintPenalty(zone, b) * 100 + this._boundingScore(positions, b);
                return sa - sb || jitter.get(key(a)) - jitter.get(key(b));
            });
            for (const p of candidates) {
                positions.set(zone.id, p); occupied.set(key(p), zone.id);
                if (recurse()) return true;
                positions.delete(zone.id); occupied.delete(key(p));
            }
            return false;
        };
        if (!recurse()) throw new Error('Automatic layout could not embed this graph on an orthogonal grid after ' + backtracks + ' search steps. The graph may be non-grid-embeddable (for example a triangle/odd cycle) or over-constrained by layout hints. Use Manual/Grid for exact placement.');
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of positions.values()) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
        const normalized = new Map();
        for (const [id, p] of positions) normalized.set(id, { col: p.x - minX, row: p.y - minY });
        return { rootId: root.id, positions: normalized, cols: maxX - minX + 1, rows: maxY - minY + 1, searchSteps: backtracks };
    }
    _weightsAndMinimums(embedding) {
        const byId = new Map(this.spec.zones.map(z => [z.id, z]));
        const colWeights = Array(embedding.cols).fill(1), rowWeights = Array(embedding.rows).fill(1);
        const colMins = Array(embedding.cols).fill(5), rowMins = Array(embedding.rows).fill(5);
        for (const [id, pos] of embedding.positions) {
            const z = byId.get(id), w = Math.sqrt(z.size?.weight || 1);
            colWeights[pos.col] = Math.max(colWeights[pos.col], w);
            rowWeights[pos.row] = Math.max(rowWeights[pos.row], w);
            colMins[pos.col] = Math.max(colMins[pos.col], z.size?.minWidth || 5);
            rowMins[pos.row] = Math.max(rowMins[pos.row], z.size?.minHeight || 5);
        }
        return { colWeights, rowWeights, colMins, rowMins };
    }
    plan() {
        ZoneGraphSpecValidator.validate(this.spec, { width: this.width, height: this.height, margin: this.margin, layoutMode: 'auto' });
        const root = { x: this.margin, y: this.margin, w: this.width - this.margin * 2, h: this.height - this.margin * 2 };
        const adj = this._adjacency(), embedding = this._embed(adj), wm = this._weightsAndMinimums(embedding);
        const colSizes = GridAllocator.allocateWithMinimum(root.w, wm.colWeights, wm.colMins);
        const rowSizes = GridAllocator.allocateWithMinimum(root.h, wm.rowWeights, wm.rowMins);
        const xOff = GridAllocator.offsets(colSizes, root.x), yOff = GridAllocator.offsets(rowSizes, root.y);
        const zones = this.spec.zones.map(z => {
            const p = embedding.positions.get(z.id), rect = { x: xOff[p.col], y: yOff[p.row], w: colSizes[p.col], h: rowSizes[p.row] };
            const type = this._zoneType(z), hints = z.layoutHints || {};
            return {
                id: z.id,
                type,
                role: z.role || type,
                generator: z.generator || (type === 'special' ? 'special' : type === 'arena' ? 'arena' : 'bsp'),
                roomType: type === 'special' ? (z.specialType || (z.role && z.role !== 'special' ? z.role : 'treasury')) : undefined,
                specialType: z.specialType || null,
                rect,
                sourceZone: hints.sourceZone || null,
                slot: hints.slot || null,
                corner: hints.slot || null,
                slotClass: hints.slotClass || null,
                slotAxis: hints.slotAxis || null,
                metadata: cloneJSON(z.metadata)
            };
        });
        const byId = new Map(zones.map(z => [z.id, z]));
        const edgeIds = new Set(), reserved = new Set(this.spec.edges.filter(e => e.id != null).map(e => e.id));
        const edgeIdFor = (e, i) => {
            if (e.id != null) { edgeIds.add(e.id); return e.id; }
            let id = 'e' + i, suffix = 0;
            while (reserved.has(id) || edgeIds.has(id)) id = 'auto_e' + i + (suffix++ ? '_' + suffix : '');
            edgeIds.add(id); return id;
        };
        const edges = this.spec.edges.map((e, i) => {
            const a = byId.get(e.a), b = byId.get(e.b), shared = RectGeometry.sharedBoundary(a, b);
            if (!shared) throw new Error('Automatic embedding bug: graph edge zones are not adjacent: ' + e.a + ' ↔ ' + e.b);
            if (!RectGeometry.safeGateRange(a, b, shared)) throw new Error('Automatic layout produced a boundary too short for a safe gate: ' + e.a + ' ↔ ' + e.b);
            return { id: edgeIdFor(e, i), a: e.a, b: e.b, type: 'required', connection: 'boundary', gate: null, gates: [] };
        });
        const layout = new ZoneLayout({
            width: this.width,
            height: this.height,
            zones,
            edges,
            spec: this.spec,
            meta: {
                planner: 'AutomaticZoneLayoutPlanner',
                root,
                embedding: {
                    cols: embedding.cols,
                    rows: embedding.rows,
                    rootId: embedding.rootId,
                    searchSteps: embedding.searchSteps,
                    positions: Object.fromEntries([...embedding.positions.entries()].map(([id, p]) => [id, { ...p }]))
                },
                columnSizes: colSizes.slice(),
                rowSizes: rowSizes.slice()
            }
        });
        return { spec: this.spec, layout, root, selected: [] };
    }
}

globalThis.ZoneGraphSpecValidator = ZoneGraphSpecValidator;
globalThis.RectGeometry = RectGeometry;
globalThis.GridAllocator = GridAllocator;
globalThis.ZoneGraphSpec = ZoneGraphSpec;
globalThis.ZoneLayout = ZoneLayout;
globalThis.SkirmishZoneGraphFactory = SkirmishZoneGraphFactory;
globalThis.ManualZoneLayoutPlanner = ManualZoneLayoutPlanner;
globalThis.AutomaticZoneLayoutPlanner = AutomaticZoneLayoutPlanner;
