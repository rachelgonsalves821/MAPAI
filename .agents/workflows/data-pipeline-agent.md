---
description: How to build the social signal data pipeline for Mapai place enrichment
---

# Data Pipeline Agent Workflow

This agent builds the nightly data ingestion pipeline that enriches Mapai's place index with social signals from Reddit, Google Reviews, and Instagram. This is a Sprint 2+ task but can be started in Sprint 1.

## Context

- **PRD section**: §6.3.3 (Social Signal Pipeline)
- **Target subreddits**: r/boston, r/BostonFood, r/CambridgeMA
- **Place index size**: 4,000–6,000 Boston venues
- **Pipeline cadence**: Nightly batch + on-demand refresh

## Pipeline Architecture

```
Reddit API → Raw Posts → LLM Summarization → Enriched Signal Objects → Place Records
Google Reviews → Review Text → LLM Extraction → Sentiment + Key Attributes → Place Records
```

## Tasks

1. **Reddit API integration**
   - Register Reddit API app at https://www.reddit.com/prefs/apps
   - Implement PRAW (Python) or snoowrap (Node.js) client
   - Search target subreddits for place mentions
   - Match mentions to places in the Google Places index using fuzzy name + address matching

2. **LLM summarization step**
   - For each place with new mentions, batch the last 7 days of posts/comments
   - Send to Claude with structured output prompt:
     ```
     Extract from these social media posts about "{place_name}":
     1. Overall sentiment: positive/neutral/negative
     2. Top 3 highlighted attributes (e.g., "great ramen", "long wait")
     3. Best representative quote (verbatim, with attribution)
     Return as JSON.
     ```
   - Store enriched signal object on the place record

3. **Place index seeding**
   - Use Google Places Nearby Search to crawl all venues in target Boston neighborhoods
   - Categories: restaurants, cafes, bars, coffee shops, bakeries, gyms, grocery
   - Store in PostgreSQL with place_id, name, location, category, and Google data
   - Estimated: 4,000–6,000 places

4. **Quality assurance**
   - Manually QA top-200 venues per category (per PRD §4.2)
   - Verify match between Reddit mentions and correct venues
   - Check LLM summary quality — are the quotes representative? Is sentiment accurate?

## Cost Estimate

Running nightly on Boston-sized index at Claude Sonnet pricing:
- ~5,000 places × ~$0.003 per summarization call = **$15/day**
- Reddit API: free tier sufficient for nightly crawl
- Total: **$15–40/day** (per PRD §13.4)

## Output Schema

```typescript
interface SocialSignalRecord {
  placeId: string;
  source: 'reddit' | 'google' | 'instagram';
  quote: string;
  author: string;
  date: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  highlightedAttributes: string[];
  createdAt: Date;
  expiresAt: Date; // 30 days from creation
}
```
