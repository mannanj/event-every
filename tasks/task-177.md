### Task 177: Per-line input wrap — contentEditable + shape-outside corner notches
- [x] Replaced the `<textarea>` with an uncontrolled `contentEditable` field (DOM→state via `onInput`, programmatic sets via ref); plain-text paste; Cmd+Enter; placeholder + vertical centering replicated via `data-empty`
- [x] Transparent full-height float (`height: 100cqh`) with a `shape-outside` polygon that carves ONLY the top-right (icons) and bottom-right (Transform button) corners — first/last ~2 lines wrap shorter, middle lines stay full width
- [x] All input behaviors preserved (draft persistence, history load, URL detection + pill removal, drag-drop, file attach, image previews, validation, contentDensity, a11y)
- [x] Tests migrated for contenteditable (`toHaveText`, testid selectors); local 25/25; verified in real Chromium across empty / short / long / with-history / bottom states (float height measured at 386px, notch 64px ≈ 2 lines)
- Location: `src/components/SmartInput.tsx`, `src/app/globals.css`, `src/app/page.tsx` (input-box testid), `e2e/`

Known caveat: the notches are content-anchored, so they line up with the box-fixed icons/button when content fits the box (the common case) or is scrolled to that edge; for very long *scrolled* content the fixed controls can overlap mid-text — a CSS limitation for keeping box-fixed regions clear over scrolling text.

[Task-177]
