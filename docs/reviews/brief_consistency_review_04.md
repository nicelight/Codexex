# Brief Consistency Review — Iteration 4

## Summary
- Found a remaining inconsistency between the D1 spinner detector requirements and the pseudocode implementation in §18.

## Details
1. **Spinner count contract drift**  
   *Requirement*: section 6 obliges detector D1 to extract numeric counters from visible spinners and use that number as the tab `count`.  
   *Issue*: the content-script pseudocode still reports `count` as the number of matched elements, ignoring digits inside global indicators, so badge totals will never reflect the actual number of running tasks.  
   *Impact*: breaks AC‑1/section 7 expectation of an accurate badge.  
   *Reference*: `docs/brief.md` §6 lines 164-170, §7 lines 189-195, §18 lines 351-384.

## Recommendation
- Update the D1 detector description or pseudocode so that it extracts numeric values from spinners and contributes them to the aggregated `count` instead of incrementing by one per element.
