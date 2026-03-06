# Event Every

Snap an image or paste text. Get a calendar event. It's that simple.

## What It Does

Event Every converts any event information into calendar events:
- **Image to Event**: Upload a photo of a poster, flyer, or screenshot
- **Text to Event**: Paste or type event details
- **Smart Detection**: Automatically extracts dates, times, locations, and descriptions
- **Review & Edit**: Confirm and modify the generated event before exporting
- **Universal Export**: Download in Apple Calendar, Google Calendar, or Outlook format

## Features

### Input Methods
- 📸 **Image Upload**: OCR extracts text from any image
- ✍️ **Text Input**: Direct entry for quick event creation

### Smart Event Generation
- 🤖 **AI-Powered Parsing**: Automatically identifies event details
- 📅 **Date & Time Detection**: Recognizes various date/time formats
- 📍 **Location Extraction**: Finds venue names and addresses
- 📝 **Description Generation**: Creates meaningful event descriptions

### User Experience
- ⚫⚪ **Minimal Black & White UI**: Clean, distraction-free design
- ✅ **Confirmation View**: Review before saving
- ✏️ **Inline Editing**: Modify any field directly
- 📜 **Event History**: Access all past events via top-right toggle
- 💾 **Export Options**: Download in your preferred format

### Calendar Format Support
- **Apple Calendar** (.ics)
- **Google Calendar** (.ics)
- **Outlook** (.ics)

All formats use standard iCalendar format for universal compatibility.

## How It Works

1. **Input**: Upload image or enter text
2. **Extract**: OCR processes image (if applicable)
3. **Parse**: AI identifies event details
4. **Review**: See generated event with all fields
5. **Edit**: Make any necessary changes
6. **Export**: Download in your calendar format
7. **History**: Event automatically saved for future reference

## UI Design Philosophy

**Minimal. Lovable. Complete.**

- Pure black and white aesthetic
- No clutter, no distractions
- Fast and responsive
- Intuitive navigation
- History toggle in top-right corner
- Simple confirmation and editing interface

## Technical Architecture

### Stack (To Be Implemented)
- **Frontend**: React/Next.js
- **OCR**: Tesseract.js or cloud OCR service
- **Parsing**: Natural language processing or LLM-based extraction
- **Storage**: LocalStorage/IndexedDB for history
- **Export**: ics.js for calendar file generation

### Project Structure
```
event-every/
├── README.md
├── src/
│   ├── components/
│   │   ├── ImageUpload.tsx
│   │   ├── TextInput.tsx
│   │   ├── EventConfirmation.tsx
│   │   ├── EventEditor.tsx
│   │   ├── HistoryPanel.tsx
│   │   └── ExportOptions.tsx
│   ├── services/
│   │   ├── ocr.ts
│   │   ├── parser.ts
│   │   └── exporter.ts
│   ├── utils/
│   │   └── dateParser.ts
│   └── styles/
│       └── globals.css
├── public/
└── package.json
```

## Roadmap

- [ ] Initial Next.js setup with TypeScript
- [ ] Black and white UI design system
- [ ] Image upload component
- [ ] OCR integration
- [ ] Text input interface
- [ ] Event parsing logic
- [ ] Confirmation/preview interface
- [ ] Inline editing functionality
- [ ] Calendar export (iCal format)
- [ ] History storage (LocalStorage)
- [ ] History panel UI
- [ ] Multi-format export options
- [ ] Mobile responsive design
- [ ] Accessibility improvements
- [ ] Error handling and validation

## Getting Started

### Quick Start

```bash
./run.sh
```

This script handles everything: installs dependencies, pulls environment variables from Vercel, and starts the dev server.

### Manual Setup

```bash
bun install            # Install dependencies
vercel link            # Link to Vercel project (first time only)
vercel env pull        # Pull env variables to .env.local
bun dev                # Start dev server
```

### Requirements

- [Bun](https://bun.sh/) (v1.0+)
- [Vercel CLI](https://vercel.com/cli) (`bun install -g vercel`)

## Contributing

Contributions welcome! Please submit issues and pull requests.

## License

MIT

---

Built with simplicity in mind.
