### Task 224: Slim the scanner's answer to what a model can know
- [x] Scanner pinned to commit 9a8f6f7: wire evidence is source plus excerpt, zoned points carry no resolution bookkeeping, recurrence points use the same bare shape; the resolver fills the rest
- [x] Vendor pins, provenance, and the vendor tests updated to the new pack and artifact digests
- [x] Measured per scan: completion tokens fell from 881 to 608 on a screenshot and from 766 to 611 on a flyer; cost per scan down 17 to 21 percent before the downscale, about 35 percent with it
- [x] Accuracy on the 23 real images at native resolution: 44 of 46 over two runs, up from 42 of 46
- [x] Eval runner gains `EVAL_CONCURRENCY` and `EVAL_REAL_DIR`; usage probe script added; cost research documents kept under `scripts/typesafe/data/`
- [x] Model comparison: only GLM-5.3-flash and DeepSeek V4 Flash Vision route under the app's zero-retention rules; GLM took 29 s per scan and failed strict output, DeepSeek missed a date on its sample; no switch
- Location: `scripts/vendor-event-scanner.ts`, `vendor/event-every-scanner/`, `scripts/measure-scan-reliability.ts`, `scripts/probe-scan-usage.ts`
