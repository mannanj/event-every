### Task 102: Apply Rainbow Gradient Background to All Sections
- [ ] Wrap all main sections in a single continuous rainbow gradient container
- [ ] Remove individual section backgrounds and apply unified gradient wrapper
- [ ] Ensure gradient scrolls with content using `background-attachment: local`
- [ ] Apply gradient from Smart Input through Processing, Unsaved Events, Event Editor, to History sections
- Location: `src/app/page.tsx`, `src/app/globals.css`

**Note**: This task was explored but not implemented. The rainbow gradient background was originally applied only to the History section. This captures the idea of extending it to all sections as a unified container for potential future implementation.

**Implementation Details**:
- Create outer wrapper div with `-mx-8 px-8 py-6 rounded-3xl rainbow-gradient-bg` classes
- Wrap all sections from Smart Input to History within this container
- Keep individual section backgrounds (white/gray-50) for contrast
- Rainbow gradient creates a subtle background effect flowing through all sections
