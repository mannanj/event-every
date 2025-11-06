### Task 121: Enhanced Multi-Format Input UI with Centered Icons

**Goal**: Make multi-format input capabilities more visually obvious by adding centered icons and improved placeholder text.

#### Design Approach: Centered Icon Row
- [ ] Add horizontal row of icons (image, document, audio) centered in input box
- [ ] Icons should be clickable to open file picker for that type
- [ ] Update placeholder text to: "Type, drop files or paste text"
- [ ] Implement three UI states based on input content

#### UI States

**State 1: Untouched Input**
- [ ] Display centered icons (image, document, audio)
- [ ] Display placeholder text: "Type, drop files or paste text"
- [ ] Icons remain visible and clickable

**State 2: Files Attached (No Text)**
- [ ] Keep centered icons visible
- [ ] Display attached files in row at top
- [ ] Show attach icon at top right
- [ ] Attach icon displays count only when attachments exist (no 0 shown)

**State 3: Text Input (Typing or Pasted)**
- [ ] Hide centered icons when user types or pastes text
- [ ] Show attach icon at top right (count only displayed if attachments > 0)
- [ ] User can still attach files via:
  - Clicking attach icon at top right
  - Drag and drop
  - Paste

#### Technical Requirements
- [ ] Icons should be clean, aligned, and maintain black/white aesthetic
- [ ] File picker should filter by type when clicking specific icon
- [ ] Drag and drop should work in all states
- [ ] Paste should work in all states
- [ ] Smooth transitions between states

#### Location
- `src/app/page.tsx` - Main input interface
- `src/components/` - May need new component for icon row
- `src/styles/` - Icon styling

---

### Future A/B Test Ideas (Separate Tasks)

**Angled Icons Design**
- Icons with rotation (5-15°) for subtle visual dynamism
- Scattered placement for personality
- Test against centered row approach

**Dashed Border Zones**
- Visual hint for drop zone
- Icons in corners showing supported formats
- Keeps center clear for typing
