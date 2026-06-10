### Task 190: Fix contentEditable hydration mismatch in SmartInput
- [x] Add `suppressHydrationWarning` to the editor div so a browser-restored contentEditable (bfcache / form restore) doesn't trigger a React tree regeneration
- [x] Reconcile DOM-restored text into React state on mount when no draft exists, so `data-empty`, the placeholder, and the Transform button reflect the real editor content
- [x] Verify: type-check passes; browser confirms no hydration error and correct placeholder/Transform state on fresh load and draft restore
- Location: `src/components/SmartInput.tsx`

**Root cause:** The editor is an uncontrolled contentEditable whose placeholder/Transform state is derived from React `text` state. When the browser restored text into the editor before React hydrated, `text` stayed `''` while the DOM held content — leaving the placeholder stuck visible, typed text flowing after it, and Transform disabled. The reconcile branch pulls the restored DOM text into state; `suppressHydrationWarning` prevents the mismatch from regenerating the editor tree.
