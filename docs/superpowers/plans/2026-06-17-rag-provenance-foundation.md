# RAG Provenance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add stable source provenance to knowledge assets, retrieval results, and solution-agent responses so later hybrid retrieval and multi-agent runs can reuse the same evidence contract.

**Architecture:** Keep the first phase backwards compatible by extending the existing `KnowledgeAsset` model instead of introducing a separate document table immediately. Uploaded file chunks receive shared document identifiers, chunk positions, source locators, and excerpts. Search and solution-agent responses expose source payloads plus a retrieval log modeled after MindCrew's replayable RAG records.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, pytest, React response consumers.

---

### Task 1: Provenance Contract Tests

**Files:**
- Modify: `backend/tests/test_knowledge_assets.py`

- [x] **Step 1: Write the failing upload provenance test**

Add:

```python
def test_upload_knowledge_asset_file_returns_chunk_provenance(client, admin_auth_headers, monkeypatch):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    body = "\n".join([f"section {idx} proposal template qualification workflow approval" for idx in range(220)])

    response = client.post(
        "/api/knowledge-assets/upload",
        headers=admin_auth_headers,
        data={
            "title": "Proposal Operations Manual",
            "source_type": "official_document",
            "source_name": "Operations Playbook",
            "source_confidentiality": "internal",
        },
        files={"file": ("proposal-ops.md", body.encode("utf-8"), "text/markdown")},
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) >= 2
    document_ids = {item["source_document_id"] for item in items}
    assert len(document_ids) == 1
    assert [item["chunk_index"] for item in items] == list(range(len(items)))
    assert all(item["chunk_total"] == len(items) for item in items)
    assert all(item["citation_id"] for item in items)
    assert all("chunk" in item["source_locator"] for item in items)
    assert all(item["source_excerpt"] for item in items)
```

- [x] **Step 2: Write the failing solution-agent retrieval log test**

Add:

```python
def test_solution_agent_returns_source_payloads_and_retrieval_log(client, admin_auth_headers, monkeypatch):
    created = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Automation Case",
            "source_type": "company_case",
            "source_name": "Internal Case Library",
            "raw_text": "proposal template qualification workflow approval automation reduces repeated document work",
            "business_topic_tags": ["proposal"],
            "evidence_type_tags": ["case"],
            "proves": ["proposal document workflows can be automated with approval controls"],
        },
    ).json()

    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        lambda payload: {
            "title": "Proposal Automation Plan",
            "summary": "Use cited evidence to automate proposal document workflows.",
            "recommended_solutions": [],
            "needed_capabilities": [],
            "dynamic_workers": [],
            "risks": [],
            "next_questions": [],
        },
        raising=False,
    )

    response = client.post(
        "/api/solution-agent/generate",
        headers=admin_auth_headers,
        json={"requirement": "proposal automation workflow", "limit": 3},
    )

    assert response.status_code == 200
    data = response.json()
    evidence = data["retrieved_evidence"][0]
    assert evidence["id"] == created["id"]
    assert evidence["citation_id"]
    assert evidence["source_payload"]["citation_id"] == evidence["citation_id"]
    assert evidence["source_payload"]["source_name"] == "Internal Case Library"
    assert evidence["source_payload"]["chunk_index"] == 0
    assert evidence["source_payload"]["excerpt"]
    assert data["retrieval_log"]["original_query"] == "proposal automation workflow"
    assert data["retrieval_log"]["returned_count"] >= 1
    assert data["retrieval_log"]["results"][0]["asset_id"] == created["id"]
```

- [x] **Step 3: Run tests to verify RED**

Run: `pytest backend/tests/test_knowledge_assets.py::test_upload_knowledge_asset_file_returns_chunk_provenance backend/tests/test_knowledge_assets.py::test_solution_agent_returns_source_payloads_and_retrieval_log -q`

Expected: FAIL because response schemas do not yet expose `source_document_id`, `citation_id`, `source_payload`, or `retrieval_log`.

### Task 2: Model and Schema Provenance Fields

**Files:**
- Modify: `backend/app/models/models.py`
- Modify: `backend/app/schemas/knowledge_assets.py`
- Create: `backend/alembic/versions/o4p5q6r7s8t9_add_knowledge_asset_provenance.py`
- Modify: `backend/tests/conftest.py` only if new tables are introduced; this phase should not need it.

- [x] **Step 1: Add nullable provenance columns**

Add fields to `KnowledgeAsset`:

```python
    source_document_id = Column(String)
    chunk_index = Column(Integer, default=0)
    chunk_total = Column(Integer, default=1)
    source_page = Column(Integer)
    source_section = Column(String)
    source_locator = Column(String)
    source_excerpt = Column(Text)
    retrieval_metadata = Column(JSON)
```

- [x] **Step 2: Add API fields to Pydantic schemas**

Expose the same fields plus `citation_id` and `source_payload` where knowledge assets, search items, and solution-agent evidence are returned.

- [x] **Step 3: Add Alembic migration**

Create a migration that adds the nullable columns to `knowledge_assets` and drops them on downgrade.

### Task 3: Provenance Builders

**Files:**
- Modify: `backend/app/services/knowledge_asset_service.py`

- [x] **Step 1: Implement citation helpers**

Add helpers:

```python
def _build_citation_id(asset: KnowledgeAsset, rank: int | None = None) -> str:
    prefix = f"K{rank}" if rank is not None else "K"
    return f"{prefix}-{str(asset.id)[:8]}"


def _source_excerpt(text: str | None, max_length: int = 320) -> str:
    cleaned = " ".join((text or "").split())
    return cleaned[:max_length]
```

- [x] **Step 2: Populate provenance for manual and uploaded assets**

Manual intake receives single-chunk provenance. File upload creates one shared `source_document_id` for all chunks and assigns `chunk_index`, `chunk_total`, `source_locator`, and `source_excerpt`.

- [x] **Step 3: Return source payloads**

Extend `_asset_to_dict`, `_asset_to_search_result`, and `_asset_to_solution_evidence` so callers receive stable citation data without duplicating formatting logic.

### Task 4: Retrieval Log

**Files:**
- Modify: `backend/app/services/knowledge_asset_service.py`
- Modify: `backend/app/schemas/knowledge_assets.py`

- [x] **Step 1: Build a retrieval log after search**

Add:

```python
def _build_retrieval_log(query: str, assets: list[KnowledgeAsset], terms: list[str], limit: int) -> dict:
    return {
        "original_query": query,
        "rewritten_query": query,
        "retrieval_mode": "keyword_tag",
        "selected_tools": ["knowledge_asset_keyword_search"],
        "terms": terms,
        "limit": limit,
        "returned_count": len(assets),
        "results": [
            {
                "asset_id": str(asset.id),
                "citation_id": _build_citation_id(asset, index + 1),
                "title": asset.title,
                "match_score": getattr(asset, "_match_score", 0),
                "source_locator": asset.source_locator,
            }
            for index, asset in enumerate(assets)
        ],
    }
```

- [x] **Step 2: Include retrieval log in solution-agent responses**

Return `retrieval_log` from `generate_solution_agent` and declare it in `SolutionAgentResponse`.

### Task 5: Verification

**Files:**
- All modified backend files

- [x] **Step 1: Run focused tests**

Run: `pytest backend/tests/test_knowledge_assets.py -q`

Expected: 14 tests pass after the two new tests are added.

- [x] **Step 2: Check working tree**

Run: `git status --short`

Expected: Only the implementation plan, backend model/schema/service/migration, and test files are changed, plus the pre-existing `backend/app/models/models.py` change remains part of that file.


