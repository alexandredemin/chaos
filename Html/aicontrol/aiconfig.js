// Centralized AI tuning parameters. Keep gameplay and profile values unchanged
// during architecture refactors; calibrate them only with gameplay evidence.
// Loaded before all AI runtime components in index.html.

const AI_TACTICAL_PROFILES = {
	cautious:   {goal:.5, offense:1, danger:2},
	balanced:   {goal:1, offense:2, danger:1},
	aggressive: {goal:.75, offense:3, danger:.5},
	critical:   {goal:1.5, offense:5, danger:.1}
};

const AI_MATRIX_EPS = 1e-9;

const AI_GUARD_CONFIG = Object.freeze({
	minRadius: 1,
	maxRadius: 5,
	idealRadius: 3.5,
	minIdealRadius: 1,
	pressureStartDistance: 4.5,
	pressureFullDistance: 1.5,
	proximityBase: 2,
	proximityFalloff: .4,
	proximityEmergencyReduction: .75,
	interceptHalfWidth: 1.5,
	congestionPenalty: .35,
	anchorTolerance: 0,
	slotPoolMultiplier: 2,
	slotMinDistance: 2,
	slotNearBestRatio: .9,
	slotNearBestTolerance: .25,
	travelWeight: .15
});

const AI_HOLD_CONFIG=Object.freeze({defaultRadius:5,slotSpacing:1,travelPenalty:.05,congestionPenalty:.35,
	fireRayCount:16,fireRayRadius:20,fireExposureTau:16,approachMaxCost:20,approachTurns:4,directionWeight:.7,keepSlotBonus:.12});

const AI_NAVIGATION_CONFIG = Object.freeze({
	waypointTurns:3,
	detourTolerance:.25,
	riskScale:.5
});

const AI_CONTROL_CONFIG = Object.freeze({
    normalPassStages: 3,
    maxPassStages: 12,
    invisibleMemoryTurns: 2,
    tacticalPlannerOptions: Object.freeze({maxDepth:5,beamWidth:16,maxMoveCandidates:10,maxJumpCandidates:10})
});
