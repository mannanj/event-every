### Task 33: Duplicate Detection - Type Definitions & Interfaces

- [ ] Add `DuplicateMatch` interface to `src/types/event.ts`
- [ ] Add `MergeStrategy` interface to `src/types/event.ts`
- [ ] Add `FieldConflict` interface to `src/types/event.ts`
- [ ] Add `DuplicateSettings` interface to `src/types/event.ts`
- [ ] Add JSDoc comments explaining each interface

**Location**: `src/types/event.ts`

**Details**: Foundation types for duplicate detection system. Includes:
- `DuplicateMatch`: Similarity scoring between two events (score, reasons, confidence)
- `MergeStrategy`: Result of merging two events (merged event, conflicts, explanation)
- `FieldConflict`: Represents conflicting field values between events
- `DuplicateSettings`: User preferences for duplicate detection behavior
