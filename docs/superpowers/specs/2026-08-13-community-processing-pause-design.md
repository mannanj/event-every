# Event Every Community Processing Pause Design

**Date:** 2026-08-13

**Status:** Approved by the user in-session

## Purpose

Keep the existing public processing-pause screen and its route to saved events, while removing internal owner-budget language from the public brand experience. Correct the paused-state input layout so the Transform button remains inside the input at its bottom-right corner.

## Public copy

Every exhausted, frozen, or unavailable processing state uses the heading:

> Event processing is paused

When the usage authority supplies a valid reset timestamp, the screen displays it in the visitor's local timezone using this sentence:

> Event Every is powered by community support. New event processing is paused until August 14 12:00am, but your saved events are still available.

`August 14 12:00am` is illustrative. The rendered month, day, hour, and minute come from the authority timestamp. The presentation uses a 12-hour clock, lowercase `am`/`pm`, and no comma between the day and time.

When a trustworthy reset timestamp is unavailable, the screen must not invent one. It uses:

> Event Every is powered by community support. New event processing is temporarily paused, but your saved events are still available.

The action remains:

> View my events

No public paused-state copy mentions an owner budget, exhaustion, frozen accounting, providers, request IDs, infrastructure, or spending.

## Behavior and layout

- The existing pause screen remains the first public view when processing is unavailable.
- Selecting **View my events** opens the regular page with saved events and the locally restored, editable draft.
- Transform remains disabled while processing is paused.
- The paused notice consumes space within the fixed-height input instead of increasing its total height.
- The Transform button remains inside the input's bottom-right boundary in both paused and available states.

## Verification

- Browser tests cover the known-reset and unknown-reset copy.
- A browser geometry assertion proves the Transform button's right and bottom edges stay within the input box while processing is paused.
- The geometry test must fail against the pre-fix layout and pass after the fix.
- A real-browser screenshot verifies the corrected paused flow, and the capture checks for React, hydration, console, and page errors.
