# Jev 1.14 vs 1.13 on the 118-case set (2026-10-15)

`TYPESAFE_MODEL=jev-1.1x.0 bun scripts/typesafe/eval.ts <copy of cases.json>`, both runs the same day.

| Judgment | jev-1.13.0 | jev-1.14.0 |
| --- | --- | --- |
| A all-day | 117/118 | 116/118 (f-18) |
| B field verification, p >= 0.5 | 1206/1234 | 1195/1234 |
| B correct fields flagged wrong | 24 | 34 |
| B wrong fields passed | 4 | 5 |
| B at each version's best threshold | 1221 (t=0.37) | 1217 (t=0.22) |
| C title pick | 108/118 | 106/117 (h-14 hit a TypeSafe 499) |
| Calls / tokens | 674 / 739k | 673 / 739k |

1.13 reproduces the September baseline (117 / 1209 / 108) within noise.

1.14 is not better here, and its verification probabilities run lower (best threshold moves from
0.37 to 0.22), so the 0.5 the app uses would flag more correct fields. Even re-tuned it trails 1.13.
Keep `jev-1.13.0` pinned (Task 255). Re-run when the next release ships or 1.13's deprecation
notice arrives (TypeSafe promises 60 days). Triage thresholds (`triage.ts`) have no labeled set and
were not compared.
