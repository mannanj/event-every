# SmartInput Component - Reproducible Design Specification

A comprehensive design document for recreating the unified input component that handles text, images, and calendar files with a minimal black-and-white aesthetic.

---

## 1. Component Overview

### Purpose
A unified input component that accepts:
- Free-form text input
- Image uploads (drag-drop, click, paste)
- Calendar file uploads (.ics)
- URL detection with pill display

### Architecture
```
SmartInput (main container)
├── File Attachments Row (top, horizontal scroll)
│   ├── Image Thumbnails (128x128px)
│   └── Calendar File Placeholders
├── Attach Button (floating top-right)
├── Textarea (flex-1, fills remaining space)
├── URL Pills Row (bottom, horizontal scroll)
└── ParticleButton (floating submit)
```

### Component Interface
```typescript
interface SmartInputProps {
  onSubmit: (data: {
    text: string;
    images: File[];
    calendarFiles: File[]
  }) => void;
  onError: (error: string) => void;
}

interface SmartInputHandle {
  clear: () => void;
}
```

---

## 2. Styling Specification

### Color Palette

**Core UI (Black & White)**
| Element | Color | Tailwind |
|---------|-------|----------|
| Primary text | `#000000` | `text-black` |
| Primary borders | `#000000` | `border-black` |
| Background | `#ffffff` | `bg-white` |
| Placeholder | `#9ca3af` | `text-gray-400` |
| Disabled | `#e5e7eb` | `bg-gray-200` |
| Hover borders | `#6b7280` | `border-gray-600` |
| Error | `#dc2626` | `text-red-600` |
| Remove button | `#dc2626` | `bg-red-600` |

**No accent colors in core input - only black/white/gray**

### Typography
- **Body text**: System fonts (SF Pro, Segoe UI, sans-serif)
- **Placeholder**: 14px, gray-400
- **Labels**: 10px, white on black background
- **File count badges**: 10px, white on red

### Spacing
```css
/* Container */
padding: 0;
gap: 8px; /* between sections */

/* Thumbnails */
width: 128px;
height: 128px;
gap: 8px; /* between thumbnails */

/* Textarea */
padding: 8px;
padding-right: 48px; /* space for attach button */

/* Buttons */
min-height: 44px; /* touch target */
```

### Border Styles
```css
/* Thumbnails */
border: 2px solid black;
border-radius: 0; /* sharp corners */

/* On hover */
border-color: #6b7280; /* gray-600 */
transition: border-color 200ms;
```

---

## 3. File Handling Specification

### Validation Constants
```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 25;
const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic'
];
const ACCEPTED_CALENDAR_TYPES = [
  'text/calendar',
  'application/ics'
];
const MIN_TEXT_LENGTH = 3;
```

### File Type Validation
```typescript
const isImageFile = (file: File): boolean => {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
};

const isCalendarFile = (file: File): boolean => {
  return ACCEPTED_CALENDAR_TYPES.includes(file.type) ||
         file.name.toLowerCase().endsWith('.ics');
};

const validateFile = (file: File): string | null => {
  const isImage = isImageFile(file);
  const isCalendar = isCalendarFile(file);

  if (!isImage && !isCalendar) {
    return 'Please upload a valid image file (JPEG, PNG, WebP, HEIC) or calendar file (.ics)';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File size must be less than 10MB';
  }
  return null;
};
```

### Image Preview Data Structure
```typescript
interface ImagePreview {
  file: File;
  preview: string; // base64 data URL from FileReader
}

// Creating preview
const reader = new FileReader();
reader.onloadend = () => {
  newPreviews.push({
    file,
    preview: reader.result as string,
  });
};
reader.readAsDataURL(file);
```

### Calendar File Preview Data Structure
```typescript
interface CalendarFilePreview {
  file: File;
  eventCount: number; // parsed from .ics content
}
```

---

## 4. Image Thumbnail Design

### Layout
```
┌──────────────────────────────────────────────┐
│ [3 images] [thumb1] [thumb2] [thumb3] ...    │ ← horizontal scroll
└──────────────────────────────────────────────┘
```

### Single Thumbnail Structure
```
┌─────────────────────────┐ ← 128x128px, 2px black border
│ [count]                 │ ← top-left: "3 images" (first only)
│                         │
│       [image]           │ ← object-fit: cover
│                         │
│ [index]            [×]  │ ← bottom-left: index, top-right: remove
└─────────────────────────┘
```

### Thumbnail JSX Pattern
```tsx
<div
  className="relative w-32 h-32 flex-shrink-0 group cursor-pointer"
  onMouseEnter={() => setHoveredImageIndex(index)}
  onMouseLeave={() => setHoveredImageIndex(null)}
  onClick={(e) => handleImageClick(e, index)}
>
  {/* Image */}
  <img
    src={img.preview}
    alt={`Preview ${index + 1}`}
    className="w-full h-full object-cover border-2 border-black
               transition-colors duration-200 group-hover:border-gray-600"
  />

  {/* Image count badge (first image only) */}
  {index === 0 && images.length > 1 && (
    <div className="absolute top-1 left-1 bg-black text-white
                    text-[10px] px-1.5 py-0.5 z-40">
      {images.length} images
    </div>
  )}

  {/* Index label */}
  <div className="absolute bottom-1 left-1 bg-black text-white
                  text-[10px] px-1 z-40">
    {index + 1}
  </div>

  {/* Remove button */}
  <button
    onClick={(e) => handleRemoveImage(e, index)}
    className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-600
               text-white rounded-full flex items-center justify-center
               hover:bg-red-700 focus:outline-none z-50"
    aria-label={`Remove image ${index + 1}`}
  >
    <span className="text-xs leading-none">×</span>
  </button>
</div>
```

### Hover Preview (Tooltip)
```tsx
{hoveredImageIndex === index && (
  <div className="absolute top-full left-0 mt-2 z-50 pointer-events-none">
    <div className="bg-white border-2 border-black p-3 shadow-xl">
      <img
        src={img.preview}
        alt={`Preview ${index + 1}`}
        className="max-w-lg max-h-96 object-contain"
      />
      <p className="text-black text-xs mt-2 text-center truncate max-w-lg">
        {img.file.name}
      </p>
    </div>
  </div>
)}
```

---

## 5. Drag-Drop Implementation

### State
```typescript
const [isDragging, setIsDragging] = useState(false);
```

### Event Handlers
```typescript
const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(true);
};

const handleDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  // Only set to false if leaving the container entirely
  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
    setIsDragging(false);
  }
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(false);

  const files = Array.from(e.dataTransfer.files).filter(file =>
    isImageFile(file) || isCalendarFile(file)
  );
  if (files.length > 0) {
    handleFiles(files);
  }
};
```

### Visual Feedback
```tsx
<div
  className={`relative flex-1 flex flex-col transition-all duration-200 ${
    isDragging ? 'bg-gray-50' : ''
  }`}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
```

---

## 6. Attach Button Design

### Position
- Floating top-right of textarea area
- Z-index: 30 (above content, below modals)

### Structure
```tsx
<button
  onClick={handleUploadClick}
  className="absolute right-2 top-2 text-gray-400 hover:text-black
             transition-colors p-1 z-30"
  aria-label="Attach files"
>
  {/* Attachment icon */}
  <svg width="28" height="28" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>

  {/* File count badge */}
  {totalFiles > 0 && (
    <span className="absolute -top-1 -right-1 bg-red-600 text-white
                     text-[10px] w-4 h-4 rounded-full flex items-center
                     justify-center">
      {totalFiles > 9 ? '9+' : totalFiles}
    </span>
  )}
</button>

{/* Hidden file input */}
<input
  ref={fileInputRef}
  type="file"
  className="hidden"
  accept={[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_CALENDAR_TYPES, '.ics'].join(',')}
  multiple
  onChange={handleFileInputChange}
  aria-hidden="true"
/>
```

---

## 7. Textarea Specification

### Centered Placeholder (CSS)
```css
/* globals.css */
.centered-placeholder:placeholder-shown {
  padding-top: 170px; /* vertically center placeholder */
}

.centered-placeholder.has-images:placeholder-shown {
  padding-top: 14px; /* reduce when images shown */
}
```

### Textarea JSX
```tsx
<textarea
  ref={textareaRef}
  className={`flex-1 w-full p-2 pr-12 text-black placeholder-gray-400
              bg-transparent resize-none focus:outline-none
              centered-placeholder ${images.length > 0 ? 'has-images' : ''}`}
  placeholder="Drop your screenshot, image, or text here. We'll turn it into events ✨"
  value={text}
  onChange={handleChange}
  onKeyDown={handleKeyDown}
  aria-label="Enter event details as text or drop images"
  aria-describedby={error ? 'smart-input-error' : undefined}
  aria-invalid={error ? 'true' : 'false'}
/>
```

### Keyboard Handling
```typescript
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleSubmit();
  }
};
```

---

## 8. URL Detection & Pills

### URL Detection Regex
```typescript
const URL_REGEX = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*))/gi;

useEffect(() => {
  const matches = text.match(URL_REGEX);
  if (matches) {
    const uniqueUrls = Array.from(new Set(matches));
    setDetectedUrls(uniqueUrls);
  } else {
    setDetectedUrls([]);
  }
}, [text]);
```

### URL Pills Row
```tsx
{detectedUrls.length > 0 && (
  <div className="flex items-center gap-2 px-2 pb-2 overflow-x-auto">
    {detectedUrls.map((url, index) => (
      <URLPill
        key={`${url}-${index}`}
        url={url}
        onRemove={() => removeUrl(url)}
      />
    ))}
  </div>
)}
```

### URLPill Component Design
```tsx
<div className="inline-flex items-center gap-1 px-2 py-1
                bg-gray-100 border border-gray-300 rounded-full
                text-[10px] text-gray-600 max-w-[200px]">
  {/* Link icon */}
  <svg className="w-3 h-3 flex-shrink-0" /* ... */ />

  {/* Truncated URL */}
  <span className="truncate">{displayUrl}</span>

  {/* Copy button */}
  <button onClick={handleCopy} className="hover:text-black">
    <ClipboardIcon />
  </button>

  {/* Remove button */}
  <button onClick={onRemove} className="hover:text-red-600">
    ×
  </button>
</div>
```

---

## 9. Full-Screen Image Modal

### Trigger
Click on any thumbnail opens modal with that image selected.

### Features
- Zoom: 0.5x to 5x scale (mouse wheel)
- Pan: Drag when zoomed in
- Navigation: Arrow keys, swipe
- Close: Escape key, click backdrop

### Structure
```tsx
{selectedImageIndex !== null && (
  <ImageModal
    images={images.map(img => img.preview)}
    initialIndex={selectedImageIndex}
    onClose={() => setSelectedImageIndex(null)}
  />
)}
```

### Modal Implementation Highlights
```tsx
// Zoom state
const [scale, setScale] = useState(1);
const [position, setPosition] = useState({ x: 0, y: 0 });

// Wheel zoom handler
const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  setScale(prev => Math.min(5, Math.max(0.5, prev + delta)));
};

// Pan handler (when zoomed)
const handleMouseMove = (e: MouseEvent) => {
  if (isDragging && scale > 1) {
    setPosition(prev => ({
      x: prev.x + e.movementX,
      y: prev.y + e.movementY
    }));
  }
};
```

---

## 10. State Management

### Full State Shape
```typescript
// Input content
const [text, setText] = useState('');
const [images, setImages] = useState<ImagePreview[]>([]);
const [calendarFiles, setCalendarFiles] = useState<CalendarFilePreview[]>([]);

// UI state
const [error, setError] = useState<string | null>(null);
const [detectedUrls, setDetectedUrls] = useState<string[]>([]);
const [isDragging, setIsDragging] = useState(false);
const [hoveredImageIndex, setHoveredImageIndex] = useState<number | null>(null);
const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

// Refs
const fileInputRef = useRef<HTMLInputElement>(null);
const textareaRef = useRef<HTMLTextAreaElement>(null);
```

### Imperative Handle (for parent control)
```typescript
useImperativeHandle(ref, () => ({
  clear: () => {
    setText('');
    setImages([]);
    setCalendarFiles([]);
    setError(null);
    setDetectedUrls([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  },
}));
```

---

## 11. Submit Logic

### Validation
```typescript
const isButtonEnabled = useMemo(() => {
  const hasValidText = text.trim().length >= MIN_TEXT_LENGTH;
  const hasImages = images.length > 0;
  const hasCalendarFiles = calendarFiles.length > 0;
  return hasValidText || hasImages || hasCalendarFiles;
}, [text, images.length, calendarFiles.length]);
```

### Submit Handler
```typescript
const handleSubmit = () => {
  if (!isButtonEnabled) return;

  // Validation
  if (text.trim().length > 0 && text.trim().length < MIN_TEXT_LENGTH) {
    setError(`Please enter at least ${MIN_TEXT_LENGTH} characters`);
    return;
  }

  // Call parent handler
  onSubmit({
    text: text.trim(),
    images: images.map(img => img.file),
    calendarFiles: calendarFiles.map(cf => cf.file),
  });
};
```

---

## 12. Accessibility Requirements

### ARIA Attributes
```tsx
// Textarea
aria-label="Enter event details as text or drop images"
aria-describedby={error ? 'smart-input-error' : undefined}
aria-invalid={error ? 'true' : 'false'}

// Buttons
aria-label="Attach files"
aria-label="Transform content to events"
aria-label={`Remove image ${index + 1}`}

// Error display
<p id="smart-input-error" role="alert">
```

### Keyboard Navigation
- Tab through all interactive elements
- Enter/Space to activate buttons
- Cmd/Ctrl + Enter to submit form
- Escape to close modals
- Arrow keys in image modal

### Focus Indicators
```css
focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2
```

---

## 13. Animation Specifications

### Transition Defaults
```css
transition-colors duration-200
transition-all duration-200
```

### Drag-Over Effect
```css
/* When dragging files over */
background-color: #f9fafb; /* gray-50 */
transition: background-color 200ms ease;
```

### Hover Effects
- Thumbnail border: black → gray-600
- Buttons: opacity/color transitions
- Remove buttons: red-600 → red-700

---

## 14. File Paths Reference

| Component | Path |
|-----------|------|
| SmartInput | `src/components/SmartInput.tsx` |
| ImageUpload | `src/components/ImageUpload.tsx` |
| TextInput | `src/components/TextInput.tsx` |
| ParticleButton | `src/components/ParticleButton.tsx` |
| URLPill | `src/components/URLPill.tsx` |
| ImageModal | `src/components/ImageModal.tsx` |
| Global CSS | `src/app/globals.css` |
| Types | `src/types/event.ts` |

---

## 15. Verification Checklist

To verify the design is correctly implemented:

- [ ] Images can be added via drag-drop onto textarea
- [ ] Images can be added via click on attach button
- [ ] Multiple images display in horizontal scroll row
- [ ] Each thumbnail shows index number
- [ ] First thumbnail shows total count badge
- [ ] Hover on thumbnail shows large preview tooltip
- [ ] Click on thumbnail opens full-screen modal
- [ ] Modal supports zoom (wheel) and pan (drag)
- [ ] Remove button (×) deletes individual images
- [ ] Calendar files show placeholder with event count
- [ ] URLs in text auto-detect and show as pills
- [ ] URL pills support copy and remove actions
- [ ] Cmd/Ctrl + Enter submits the form
- [ ] Submit button enables when content is present
- [ ] Error messages display and clear appropriately
- [ ] All interactive elements are keyboard accessible
- [ ] All buttons have proper ARIA labels

---

This document provides a complete specification for recreating the SmartInput component with all its visual design, file handling, interactions, and accessibility features.
