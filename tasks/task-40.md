### Task 40: Duplicate Detection - Settings & Preferences

- [ ] Create `src/services/duplicateSettings.ts` for settings management
- [ ] Add settings UI component or integrate into existing settings
- [ ] Implement sensitivity threshold slider (60-95)
- [ ] Add auto-detect toggle
- [ ] Add auto-merge high-confidence toggle
- [ ] Add time window setting (days to check)
- [ ] Persist settings to localStorage
- [ ] Add settings migration/defaults

**Location**: `src/services/duplicateSettings.ts`, settings UI component

**Details**: User-configurable duplicate detection preferences:
- **Auto-detect**: Enable/disable feature globally
- **Sensitivity**: Threshold for triggering duplicate warning (60-95)
- **Auto-merge high confidence**: Skip modal for 90+ scores
- **Check window**: Only scan events within N days (default: 14)
- Settings stored in localStorage with sensible defaults
- UI should be minimal, black & white, easy to understand
