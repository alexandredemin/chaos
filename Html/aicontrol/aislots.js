// Shared regret-greedy selection kernel for GUARD and HOLD defensive slots.
// Callers own their scoring/spacing/pool selection; this module only chooses
// the unit most constrained by losing its current best available slot.
class AISlotAssignment
{
    // `candidates(unit)` returns sorted [{utility,...}] for currently available
    // choices. The callback may compute dynamic congestion from earlier picks.
    static bestByRegret(remaining,candidates)
    {
        let selected=null;
        for(const unit of remaining)
        {
            const options=candidates(unit);
            if(!options.length)continue;
            const best=options[0],second=options[1]||null;
            const regret=second?best.utility-second.utility:1e6;
            if(!selected||regret>selected.regret||
                (regret===selected.regret&&best.utility>selected.choice.utility))
                selected={unit,choice:best,regret};
        }
        return selected;
    }
}
