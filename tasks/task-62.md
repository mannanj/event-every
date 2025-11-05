### Task 62: Backend API - Location Distance and Travel Time

**Goal**: Create API endpoint that accepts two locations (lat/lon and/or full address) and returns distance in miles and estimated travel time in minutes.

**Subtasks**:
- [ ] Create `/api/location/enrichments` POST endpoint
- [ ] Accept request with `userLocation` (lat/lon) and `eventLocation` (lat/lon or address string)
- [ ] Integrate distance calculation service (Google Maps Distance Matrix API or similar)
- [ ] Return response with `distanceMiles` and `travelTimeMinutes`
- [ ] Handle errors gracefully (invalid coordinates, API failures)
- [ ] Add rate limiting to prevent API abuse

**Location**: `src/app/api/location/`

**Request Format**:
```typescript
{
  userLocation: {
    lat: number;
    lon: number;
  },
  eventLocation: {
    lat?: number;
    lon?: number;
    address?: string;  // fallback if no lat/lon
  }
}
```

**Response Format**:
```typescript
{
  distanceMiles: number;      // e.g., 2.3
  travelTimeMinutes: number;  // e.g., 15
}
```

**Notes**:
- Use Google Maps Distance Matrix API or Mapbox Directions API
- Default to driving mode for travel time
- Cache results to avoid redundant API calls
- Consider free tier limits when choosing service
