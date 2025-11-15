### Task 148: LLM-Powered Calendar Search

#### Overview
Implement semantic search across all calendars (Event Every history + connected external calendars) using LLM capabilities. Allow natural language queries like "meetings with John last month" or "events in San Francisco" or "all birthdays this year".

#### Subtasks
- [ ] Design search architecture (embedding-based vs prompt-based)
- [ ] Create search service with LLM integration
- [ ] Implement event vectorization for semantic search (if using embeddings)
- [ ] Create search index for all events (local + external calendars)
- [ ] Build search UI component with natural language input
- [ ] Add search result ranking and relevance scoring
- [ ] Implement query understanding (date extraction, location extraction, etc.)
- [ ] Add search filters (date range, calendar source, event type)
- [ ] Create search result display with highlighting
- [ ] Add search history and saved searches
- [ ] Implement quick search suggestions as user types
- [ ] Add search by event content (title, description, location, attendees)
- [ ] Add search by time patterns ("recurring events", "all-day events")
- [ ] Add search by metadata ("events I created", "events from Google Calendar")
- [ ] Optimize search performance for large event datasets
- [ ] Add search result actions (export, edit, delete)
- [ ] Implement fuzzy matching for typos
- [ ] Add search analytics to improve query understanding

#### Example Queries to Support
- "Team meetings in December"
- "Events with Sarah"
- "Dentist appointments"
- "All-day events this year"
- "Meetings in conference room B"
- "Events I created from images"
- "Birthdays coming up"
- "Events in New York"
- "Canceled or rescheduled events"

#### Technical Approach

**Option 1: Embedding-Based Search**
- Generate embeddings for all event content
- Store in local vector database (e.g., local FAISS, or simple cosine similarity)
- Convert user query to embedding
- Find nearest neighbors
- Pros: Fast, works offline
- Cons: Requires embedding generation, storage overhead

**Option 2: Prompt-Based Search**
- Send query + all events to LLM
- LLM returns matching events with relevance scores
- Pros: More flexible, better natural language understanding
- Cons: API costs, latency, requires API key

**Hybrid Approach** (Recommended):
- Use simple keyword/filter search for basic queries
- Use LLM for complex natural language queries
- Cache LLM results for common queries

#### Location
- `src/services/search.ts` - Core search service
- `src/services/semanticSearch.ts` - LLM/embedding-based search
- `src/components/SearchBar.tsx` - Search input UI
- `src/components/SearchResults.tsx` - Results display
- `src/hooks/useSearch.ts` - Search hook
- `src/utils/queryParser.ts` - Natural language query parsing

#### Dependencies
- LLM API (Claude, OpenAI) for semantic understanding
- Optional: Embedding model for vector search
- Optional: Local vector database

#### Success Criteria
- [ ] Users can search using natural language queries
- [ ] Search understands dates, locations, people names
- [ ] Search works across all calendar sources
- [ ] Results are ranked by relevance
- [ ] Search is fast (< 500ms for most queries)
- [ ] Search handles typos and variations gracefully
- [ ] Users can filter and refine search results
