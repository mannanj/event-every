### Task 219: Scan one at a time again, and give the browser suite a triage seam
- [x] Image batches and split text scans run one at a time: the provider-operation store allows one pending record and failed every batch on its second scan
- [x] Shared e2e setup pins `/api/triage` to unavailable so scans behave as before triage; specs that skip the shared setup mock it too
- [x] New triage spec: skip shows the notice and never scans, split scans each chunk, unavailable runs one scan, a slow triage does not hold the scan
- [x] The two-image ordering tests are back to their original strict contract
- Location: `src/app/page.tsx`, `e2e/helpers.ts`, `e2e/triage.spec.ts`, `e2e/scanner-product-loop.spec.ts`, `e2e/calendar-event-regression.spec.ts`
