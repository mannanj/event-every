# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Event Every**: A minimal image/text-to-calendar-event converter that makes event creation effortless.

**Core Mission**: Snap an image or paste text. Get a calendar event. It's that simple.

### Key Principles
- **Minimal UI**: Pure black and white aesthetic, zero clutter
- **Smart Extraction**: AI-powered event detail parsing from any input
- **Universal Export**: Standard iCal format for all calendar platforms
- **User Control**: Always review and edit before export
- **History First**: Every event saved for future reference

## Task Workflow

**1. Create task file in `tasks/` directory:**
```bash
# Create tasks/task-N.md
```
```markdown
### Task N: Task Title
- [ ] Subtask 1
- [ ] Subtask 2
- Location: `path/to/files`
```

**2. Before starting, verify work isn't already done:**
- Check codebase for task's changes
- Review files in Location field
- If complete but unmarked:
  - Mark subtasks `[x]` in tasks/task-N.md
  - Commit with `[Task-N]` tag
  - Push and skip to next task

**3. Complete subtasks, mark `[x]` in tasks/task-N.md**

**4. Commit:**
```bash
git add .
git commit -m "Task N: Task Title

- [x] Subtask 1
- [x] Subtask 2
- Location: \`path/to/files\`

[Task-N]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Requirements:**
- Each task gets its own file: `tasks/task-N.md`
- Complete task entry in commit message
- All subtasks with status
- `[Task-N]` tag for tracking
- One task per commit

**5. Push:** `git push`

## Development Commands

### Frontend (Next.js + TypeScript)
```bash
# Install dependencies
npm install

# Run development server (port 3000)
npm run dev

# Build for production
npm run build

# Run production server
npm run start

# Type checking
npm run type-check

# Lint code
npm run lint
```

## Architecture

### Application Flow
**Input → Extract → Parse → Review → Edit → Export → History**

1. **Input**: Image upload or text entry
2. **Extract**: OCR processes image (Tesseract.js or cloud OCR)
3. **Parse**: AI/NLP extracts event details (date, time, location, description)
4. **Review**: Display generated event in confirmation view
5. **Edit**: Inline editing for any field
6. **Export**: Download as .ics file (universal calendar format)
7. **History**: Auto-save to LocalStorage/IndexedDB

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS (black & white only)
- **OCR**: Tesseract.js or cloud service (TBD)
- **Parsing**: LLM-based extraction (Claude API or similar)
- **Storage**: LocalStorage/IndexedDB for event history
- **Export**: ics.js for calendar file generation
- **State**: React Context or Zustand (lightweight)

### Project Structure
```
event-every/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with minimal UI
│   │   ├── page.tsx            # Main input interface
│   │   └── globals.css         # Black & white theme
│   ├── components/
│   │   ├── ImageUpload.tsx     # Drag-drop or click upload
│   │   ├── TextInput.tsx       # Direct text entry
│   │   ├── EventConfirmation.tsx  # Preview generated event
│   │   ├── EventEditor.tsx     # Inline field editing
│   │   ├── HistoryPanel.tsx    # Top-right toggle for past events
│   │   └── ExportOptions.tsx   # Download .ics file
│   ├── services/
│   │   ├── ocr.ts              # Image text extraction
│   │   ├── parser.ts           # Event detail parsing
│   │   ├── exporter.ts         # iCal file generation
│   │   └── storage.ts          # History persistence
│   ├── hooks/
│   │   ├── useOCR.ts           # OCR processing logic
│   │   ├── useParser.ts        # Event parsing logic
│   │   └── useHistory.ts       # History management
│   ├── types/
│   │   └── event.ts            # TypeScript interfaces
│   └── utils/
│       ├── dateParser.ts       # Date/time normalization
│       └── validation.ts       # Event validation
├── public/
├── tasks/                       # Task tracking files
├── CLAUDE.md
├── README.md
└── package.json
```

### Data Models

#### Event Interface
```typescript
interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  description?: string;
  allDay: boolean;
  created: Date;
  source: 'image' | 'text';
  originalInput?: string;  // Original image URL or text
}
```

#### OCR Result
```typescript
interface OCRResult {
  text: string;
  confidence: number;
  error?: string;
}
```

#### Parser Result
```typescript
interface ParsedEvent {
  title?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  description?: string;
  confidence: number;
}
```

## Code Standards

### UI/UX Requirements
- **Black & White Only**: No colors, no gradients, no exceptions
- **Minimal Design**: Remove all non-essential UI elements
- **Fast & Responsive**: Optimize for instant feedback
- **Mobile First**: Touch-friendly, responsive design
- **Accessible**: ARIA labels, keyboard navigation, screen reader support

### Component Architecture
- **Modular Components**: Single responsibility, small files
- **Custom Hooks**: Extract all business logic from components
- **Type Safety**: Strict TypeScript, no `any` types
- **Shared Types**: Define interfaces in `src/types/`
- **Utility Functions**: Pure functions in `src/utils/`

### Comment Policy
- **Minimize comments**: Only include non-obvious technical decisions
- **Remove obvious comments**: Self-explanatory code needs no comments
- **Preserve critical context**: Explain "why" not "what"
- Acceptable comments:
  - OCR accuracy workarounds
  - Date parsing edge cases
  - Calendar format requirements
  - AI prompt engineering decisions
- Remove:
  - "Set state" (obvious)
  - "Call API" (obvious)
  - "Loop through array" (obvious)

### Styling Guidelines
- **Tailwind Only**: No custom CSS except globals.css
- **Black & White Palette**:
  - `bg-black`, `bg-white`
  - `text-black`, `text-white`
  - `border-black`, `border-white`
  - Grays only for disabled states: `bg-gray-100`, `text-gray-500`
- **Typography**: Simple, readable fonts (system fonts preferred)
- **Spacing**: Consistent use of Tailwind spacing scale
- **Animations**: Minimal, fast transitions only

### Error Handling
- **User-Friendly Messages**: Never expose technical errors
- **Graceful Degradation**: App works even if OCR/parsing fails
- **Validation**: Check all event fields before export
- **Retry Logic**: Allow re-upload or re-parse on failure

### Performance
- **Lazy Loading**: Code-split OCR and parsing services
- **Image Optimization**: Compress uploads before processing
- **Caching**: Store OCR results to avoid reprocessing
- **Debouncing**: Delay parsing until user stops typing

### Testing Priorities
1. Event export generates valid .ics files
2. OCR accurately extracts text from various image types
3. Parser handles multiple date/time formats
4. History persists across sessions
5. All accessibility features work correctly

## Development Workflow

### Feature Development
1. Create task file in `tasks/`
2. Implement with tests
3. Verify black & white UI compliance
4. Test export on Apple Calendar, Google Calendar, Outlook
5. Commit with task reference
6. Push to main

### OCR Integration
- Start with Tesseract.js (free, local)
- Consider cloud OCR if accuracy insufficient
- Cache results to avoid reprocessing
- Handle multiple languages

### Event Parsing Strategy
- Use LLM API for robust parsing
- Implement fallback regex patterns
- Support various date formats (MM/DD/YYYY, natural language, etc.)
- Handle timezone detection
- Extract location with address validation

### Export Testing
- Verify .ics file validity
- Test import on:
  - Apple Calendar (macOS, iOS)
  - Google Calendar (web, mobile)
  - Outlook (desktop, web)
- Ensure all fields display correctly

## Quality Checklist

Before committing, verify:
- [ ] UI is pure black and white
- [ ] Component is modular with single responsibility
- [ ] Business logic extracted to custom hooks
- [ ] TypeScript strict mode passes
- [ ] No unnecessary comments
- [ ] Mobile responsive
- [ ] Accessible (keyboard, screen reader)
- [ ] Event export works correctly
- [ ] History saves properly

## Project Status

Currently in initial development phase. See README.md roadmap for implementation priorities.

---

**Remember**: Minimal. Lovable. Complete.
