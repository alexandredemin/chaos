// Default skirmish topology for the universal ZoneGraph pipeline.
// Numeric generation/layout tuning lives in mapgenerationconfig.js.

var SKIRMISH_ARENA_TEMPLATE = {
	"id": "skirmish-arena-template",
	"zones": [
		{
			"id": "nw",
			"role": "treasury",
			"generator": "special",
			"metadata": {
				"skirmishSlot": "nw",
				"slotClass": "corner"
			},
			"layoutHints": {
				"slot": "nw",
				"slotClass": "corner"
			},
			"specialType": "treasury"
		},
		{
			"id": "north",
			"role": "normal",
			"generator": "bsp",
			"metadata": {
				"skirmishSlot": "n",
				"slotClass": "middle",
				"slotAxis": "horizontal"
			},
			"layoutHints": {
				"prefer": "north",
				"slot": "n",
				"slotClass": "middle",
				"slotAxis": "horizontal"
			}
		},
		{
			"id": "ne",
			"role": "normal",
			"generator": "bsp",
			"metadata": {
				"skirmishSlot": "ne",
				"slotClass": "corner"
			},
			"layoutHints": {
				"slot": "ne",
				"slotClass": "corner"
			}
		},
		{
			"id": "west",
			"role": "normal",
			"generator": "bsp",
			"metadata": {
				"skirmishSlot": "w",
				"slotClass": "middle",
				"slotAxis": "vertical-full"
			},
			"layoutHints": {
				"prefer": "west",
				"slot": "w",
				"slotClass": "middle",
				"slotAxis": "vertical-full"
			}
		},
		{
			"id": "arena",
			"role": "arena",
			"generator": "arena",
			"layoutHints": {
				"prefer": "center"
			}
		},
		{
			"id": "east",
			"role": "normal",
			"generator": "bsp",
			"metadata": {
				"skirmishSlot": "e",
				"slotClass": "middle",
				"slotAxis": "vertical-full"
			},
			"layoutHints": {
				"prefer": "east",
				"slot": "e",
				"slotClass": "middle",
				"slotAxis": "vertical-full"
			}
		},
		{
			"id": "sw",
			"role": "normal",
			"generator": "bsp",
			"metadata": {
				"skirmishSlot": "sw",
				"slotClass": "corner"
			},
			"layoutHints": {
				"slot": "sw",
				"slotClass": "corner"
			}
		},
		{
			"id": "south",
			"role": "normal",
			"generator": "bsp",
			"metadata": {
				"skirmishSlot": "s",
				"slotClass": "middle",
				"slotAxis": "horizontal"
			},
			"layoutHints": {
				"prefer": "south",
				"slot": "s",
				"slotClass": "middle",
				"slotAxis": "horizontal"
			}
		},
		{
			"id": "se",
			"role": "library",
			"generator": "special",
			"metadata": {
				"skirmishSlot": "se",
				"slotClass": "corner"
			},
			"layoutHints": {
				"slot": "se",
				"slotClass": "corner"
			},
			"specialType": "library"
		}
	],
	"edges": [
		{
			"a": "nw",
			"b": "north",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "north",
			"b": "ne",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "nw",
			"b": "west",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "north",
			"b": "arena",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "ne",
			"b": "east",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "west",
			"b": "arena",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "arena",
			"b": "east",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "west",
			"b": "sw",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "arena",
			"b": "south",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "east",
			"b": "se",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "sw",
			"b": "south",
			"connection": "boundary",
			"required": true
		},
		{
			"a": "south",
			"b": "se",
			"connection": "boundary",
			"required": true
		}
	],
	"meta": {
		"template": "skirmish-arena-3x3-auto"
	}
};

globalThis.SKIRMISH_ARENA_TEMPLATE = SKIRMISH_ARENA_TEMPLATE;
