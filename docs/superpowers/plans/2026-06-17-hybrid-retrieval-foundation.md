# Hybrid Retrieval Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add BM25-style recall, RRF fusion, heuristic rerank, and context compression to the existing knowledge asset search and solution-agent flow.

**Architecture:** Keep retrieval local to `knowledge_asset_service.py` and reuse the existing `KnowledgeAssetSearchResponse` / `SolutionAgentResponse` contracts. The implementation adds deterministic helper functions and enriches `retrieval_log`; no new database tables or external services are required in this phase.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest.

---

### Task 1: Hybrid Retrieval Tests

**Files:**
- Modify: `backend/tests/test_knowledge_assets.py`

- [x] **Step 1: Add failing search pipeline test**

```python
def test_search_assets_records_hybrid_retrieval_pipeline(client, admin_auth_headers):
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Workflow Automation",
            "source_type": "company_case",
            "raw_text": "proposal approval workflow automation template qualification document generation",
            "business_topic_tags": ["proposal", "workflow"],
            "evidence_type_tags": ["case"],
        },
    )
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Social Content Calendar",
            "source_type": "manual_note",
            "raw_text": "marketing calendar social media captions publishing cadence",
            "business_topic_tags": ["marketing"],
        },
    )

    response = client.post(
        "/api/knowledge-assets/search",
        headers=admin_auth_headers,
        json={"query": "proposal workflow automation", "limit": 5},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["items"][0]["asset"]["title"] == "Proposal Workflow Automation"
    assert data["retrieval_log"]["retrieval_mode"] == "hybrid_keyword_bm25"
    assert "knowledge_asset_bm25_search" in data["retrieval_log"]["selected_tools"]
    assert "rrf_fusion" in data["retrieval_log"]["selected_tools"]
    assert data["retrieval_log"]["route_counts"]["keyword_tag"] >= 1
    assert data["retrieval_log"]["route_counts"]["bm25_text"] >= 1
    first = data["retrieval_log"]["results"][0]
    assert first["route_scores"]["bm25_text"] > 0
    assert first["rrf_score"] > 0
    assert first["rerank_score"] > 0
```

- [x] **Step 2: Add failing solution-agent compression test**

```python
def test_solution_agent_payload_uses_compressed_evidence_context(client, admin_auth_headers, monkeypatch):
    long_text = " ".join(["proposal workflow automation approval qualification template"] * 240)
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Automation Evidence",
            "source_type": "company_case",
            "raw_text": long_text,
            "business_topic_tags": ["proposal"],
            "evidence_type_tags": ["case"],
            "proves": ["proposal workflows can be automated with review controls"],
        },
    )
    captured = {}
    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        lambda payload: captured.setdefault("payload", payload) or {
            "title": "Proposal Workflow Plan",
            "summary": "Plan",
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
        json={
            "requirement": "proposal workflow automation",
            "company_profile": "consulting company",
            "project_materials": "proposal templates and approval records",
            "constraints": "manual review required",
            "limit": 3,
        },
    )

    assert response.status_code == 200
    evidence = captured["payload"]["knowledge_context"]["assets"][0]
    assert evidence["compressed_context"]
    assert len(evidence["compressed_context"]) <= 900
    assert response.json()["retrieval_log"]["context_compression"]["included_count"] >= 1
```

- [x] **Step 3: Run RED tests**

Run: `pytest backend/tests/test_knowledge_assets.py::test_search_assets_records_hybrid_retrieval_pipeline backend/tests/test_knowledge_assets.py::test_solution_agent_payload_uses_compressed_evidence_context -q`

Expected: FAIL because retrieval mode is still `keyword_tag` and no `compressed_context` exists.

### Task 2: Retrieval Pipeline Helpers

**Files:**
- Modify: `backend/app/services/knowledge_asset_service.py`

- [x] **Step 1: Implement BM25-style scoring**
- [x] **Step 2: Implement RRF fusion**
- [x] **Step 3: Implement heuristic rerank**
- [x] **Step 4: Update `search_assets` to return fused and reranked items**

### Task 3: Context Compression

**Files:**
- Modify: `backend/app/services/knowledge_asset_service.py`

- [x] **Step 1: Add `_compress_asset_context`**
- [x] **Step 2: Add `compressed_context` to evidence payloads**
- [x] **Step 3: Add `context_compression` metadata to `retrieval_log`**

### Task 4: Verification

**Files:**
- All modified backend files

- [x] **Step 1: Run focused tests**

Run: `pytest backend/tests/test_knowledge_assets.py -q`

Expected: all knowledge asset tests pass.

- [x] **Step 2: Run backend tests**

Run: `pytest backend/tests -q`

Expected: all backend tests pass.


