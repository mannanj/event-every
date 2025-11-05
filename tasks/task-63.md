### Task 63: GPS Icon and Browser Location Capture

**Goal**: Add GPS icon to header (top right) that captures user location via browser geolocation API, stores lat/lon in localStorage and state, with visual dot indicators for state.

**Subtasks**:
- [ ] Add GPS icon component in header (top right next to "Event Every")
- [ ] Implement dot indicator states (red=not set, green=set, blue pulsing=loading)
- [ ] Create `useUserLocation` hook for location management
- [ ] Implement browser geolocation API request on icon click
- [ ] Store lat/lon in localStorage (`userLocation` key)
- [ ] Load from localStorage on app mount
- [ ] Show permission modal on first click explaining purpose
- [ ] Handle subsequent clicks: show current location + "Update location" option
- [ ] Add loading animation (blue pulsing dot) during location request
- [ ] Add success state (green dot) when location is set
- [ ] Add error toast "Location access denied" on permission rejection
- [ ] Add tooltip "Set your location" on icon hover

**Location**:
- `src/components/LocationIcon.tsx` (new)
- `src/hooks/useUserLocation.ts` (new)
- `src/app/layout.tsx` (update header)

**UserLocation Interface**:
```typescript
interface UserLocation {
  lat: number;
  lon: number;
}
```

**Icon States**:
- Red dot = No location set
- Green dot = Location set and saved
- Blue pulsing dot = Loading/requesting location

**First Click Modal**:
```
Set Your Location

We'll use this to show:
• Distance to events
• Travel time estimates

[Allow Location] [Cancel]
```

**Subsequent Click Menu**:
```
Current Location
Lat: 37.7749, Lon: -122.4194

[Update Location] [Close]
```
