# Branding

## Name Options

**Eventory** (preferred)
- Play on "inventory" for events
- Clean, memorable, one word
- Available domain potential

**Eventery**
- Alternative play on "inventory"
- Softer phonetic feel

## Visual Identity

**Color Palette**: Pure black & white
- Minimalist, timeless
- High contrast, accessible
- No grays except UI states

**Typography**: System fonts
- Clean, readable
- Fast loading
- Platform native feel

## Voice & Tone

- Minimal: No unnecessary words
- Direct: Clear, simple instructions
- Efficient: Fast, frictionless experience

## Tagline Ideas

- "Snap. Schedule. Done."
- "Events from anything"
- "Your event inventory"

## Core UX Concept

**Main Prompt**: "Add an image, add text or talk"

**Three Input Methods** (always visible):
- Image icon (slider/upload)
- Text input icon
- Microphone icon

**Interaction Flow**:
- Click any method → Area expands to show active input
- Multi-modal: Use one or combine all three
- Clear visual feedback for active/inactive states

**Auto-Processing**:

*Images*:
- Send to LLM immediately on upload
- Live event preview appears instantly
- Updates in real-time as more images added

*Text*:
- Auto-send while typing (debounced, every few seconds)
- Minimum character requirement before auto-send activates
- Send button shows if below minimum
- Button disabled if just sent (prevents spam)

*Audio*:
- Similar auto-processing behavior
- Live transcription and event extraction
