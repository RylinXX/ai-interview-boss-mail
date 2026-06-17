# Hybrid Retrieval Design

**Goal:** Upgrade the current keyword-only knowledge search into a replayable hybrid retrieval pipeline that improves relevance and makes every retrieval decision visible in `retrieval_log`.

**Scope:** This phase stays inside the current FastAPI service and does not introduce an external vector database. It adds BM25-style lexical recall, RRF fusion, heuristic reranking, and context compression around the existing `KnowledgeAsset` records. Later vector retrieval can be added as another retrieval route without changing the response contract.

## Current Problem

The current search path scores recent `KnowledgeAsset` rows with substring/tag matching. It can cite assets now, but it still cannot explain multiple recall routes, fusion, rerank decisions, or how much context was sent to the solution agent.

## Design

Search will run four deterministic stages:

1. `keyword_tag`: existing tag and substring score.
2. `bm25_text`: BM25-style score over title, summary, raw text, tags, and evidence fields.
3. `rrf_fusion`: merge route rankings with reciprocal rank fusion.
4. `heuristic_reranker`: boost exact query/title/tag matches and evidence confidence.

Each result will keep `route_scores`, `route_ranks`, `rrf_score`, `rerank_score`, `match_reason`, and source payloads. `retrieval_log` will include mode, selected tools, route counts, fusion settings, rerank summary, context compression summary, and final ranked results.

For solution-agent generation, each evidence item will include `compressed_context`. The model payload will receive the compressed context while existing `raw_text` remains available for backwards compatibility.

## Testing

Tests will cover:

- Search returns hybrid retrieval metadata and ranks a relevant proposal workflow asset first.
- Solution Agent payload includes compressed evidence context and returns context compression metadata in `retrieval_log`.

