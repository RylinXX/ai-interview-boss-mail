# Solution Agent Run Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Persist solution-agent conversations, messages, runs, and trace steps, then expose read APIs for replay.

**Architecture:** Add four SQLAlchemy models and one Alembic migration. Keep generation logic in `knowledge_asset_service.py`; after a result is produced, persist a conversation record, user message, assistant message, run, and run steps. Routes remain under the existing knowledge-assets router.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, pytest.

---

### Task 1: Persistence Tests

**Files:**
- Modify: `backend/tests/test_knowledge_assets.py`

- [x] **Step 1: Add failing test**

```python
def test_solution_agent_persists_conversation_run_messages_and_steps(client, admin_auth_headers, monkeypatch):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Automation Case",
            "source_type": "company_case",
            "raw_text": "proposal workflow automation approval template qualification",
            "business_topic_tags": ["proposal"],
            "evidence_type_tags": ["case"],
        },
    )
    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        lambda payload: {
            "title": "Proposal Agent Plan",
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
            "project_materials": "proposal templates",
            "constraints": "manual review",
        },
    )

    data = response.json()
    assert data["conversation_id"]
    assert data["run_id"]
    messages = client.get(
        f"/api/solution-agent/conversations/{data['conversation_id']}/messages",
        headers=admin_auth_headers,
    ).json()["items"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    run = client.get(f"/api/solution-agent/runs/{data['run_id']}", headers=admin_auth_headers).json()
    assert run["status"] == "completed"
    assert run["retrieval_log"]["retrieval_mode"] == "hybrid_keyword_bm25"
    assert len(run["steps"]) >= 5
```

- [x] **Step 2: Run RED test**

Run: `pytest backend/tests/test_knowledge_assets.py::test_solution_agent_persists_conversation_run_messages_and_steps -q`

Expected: FAIL because the models and routes do not exist.

### Task 2: Models and Migration

**Files:**
- Modify: `backend/app/models/models.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/alembic/versions/p5q6r7s8t9u0_add_solution_agent_runs.py`

- [x] **Step 1: Add models**
- [x] **Step 2: Add tables to test setup**
- [x] **Step 3: Add Alembic migration**

### Task 3: Service and Routes

**Files:**
- Modify: `backend/app/schemas/knowledge_assets.py`
- Modify: `backend/app/services/knowledge_asset_service.py`
- Modify: `backend/app/routes/knowledge_assets.py`

- [x] **Step 1: Add IDs to request/response schemas**
- [x] **Step 2: Persist generate results**
- [x] **Step 3: Add list/history/run routes**

### Task 4: Verification

- [x] **Step 1:** `pytest backend/tests/test_knowledge_assets.py -q`
- [x] **Step 2:** `pytest backend/tests -q`


