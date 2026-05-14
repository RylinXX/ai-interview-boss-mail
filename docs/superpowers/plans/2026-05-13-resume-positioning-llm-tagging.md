# Resume Positioning LLM Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's keyword-only resume/company/project classification with LLM-generated positioning tags captured during resume analysis, while keeping a deterministic fallback for legacy records.

**Architecture:** Introduce one shared industry taxonomy and one new LLM prompt that returns structured positioning for the resume, work experiences, project experiences, and logic analysis. Persist those tags inside `parsed_data` during resume processing, then make the dashboard summary endpoints prefer the structured tags and only fall back to keyword matching when the structured tags are missing.

**Tech Stack:** Python, FastAPI, SQLAlchemy, Pydantic, React, Ant Design, pytest

---

### Task 1: Add shared industry taxonomy and LLM positioning prompt

**Files:**
- Create: `backend/app/config/resume_industry.py`
- Modify: `backend/app/utils/prompt_manager.py`
- Modify: `backend/app/config/prompt_variables.py`
- Modify: `backend/app/services/ai_service.py`

- [ ] **Step 1: Write the failing test**

```python
def test_prompt_manager_exposes_resume_positioning_prompt():
    prompts = prompt_manager.get_all_prompts()
    assert "analyze_resume_positioning" in prompts
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_resume_intelligence_service.py -k resume_positioning -v`
Expected: FAIL because the new prompt key is not exposed yet.

- [ ] **Step 3: Write minimal implementation**

```python
RESUME_INDUSTRY_PROFILES = [...]
DEFAULT_RESUME_INDUSTRY = {...}

def analyze_resume_positioning(resume_text: str, resume_data: Dict[str, Any]) -> Dict[str, Any]:
    ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_resume_intelligence_service.py -k resume_positioning -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/config/resume_industry.py backend/app/utils/prompt_manager.py backend/app/config/prompt_variables.py backend/app/services/ai_service.py
git commit -m "feat: add llm resume positioning prompt"
```

### Task 2: Persist LLM positioning tags during resume processing

**Files:**
- Modify: `backend/app/services/resume_service.py`
- Modify: `backend/tests/test_resume_intelligence_service.py`

- [ ] **Step 1: Write the failing test**

```python
def test_process_resume_task_merges_llm_positioning_into_parsed_data(db, monkeypatch):
    parsed = {...}
    positioning = {
        "industry_key": "computer_ai",
        "industry_label": "计算机/AI",
        "work_experiences": [{"industry_key": "finance"}],
        "project_experiences": [{"industry_key": "computer_ai"}],
    }
    ...
    assert resume.parsed_data["industry_key"] == "computer_ai"
    assert resume.parsed_data["work_experiences"][0]["industry_label"] == "金融行业"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_resume_intelligence_service.py -k merges_llm_positioning -v`
Expected: FAIL because the processing pipeline does not merge positioning tags yet.

- [ ] **Step 3: Write minimal implementation**

```python
def _merge_resume_positioning(parsed_data: Dict[str, Any], positioning_data: Dict[str, Any]) -> Dict[str, Any]:
    ...

positioning_data = analyze_resume_positioning(content, parsed_data)
parsed_data = _merge_resume_positioning(parsed_data, positioning_data)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_resume_intelligence_service.py -k merges_llm_positioning -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/resume_service.py backend/tests/test_resume_intelligence_service.py
git commit -m "feat: persist resume positioning tags"
```

### Task 3: Prefer structured tags in dashboard aggregation

**Files:**
- Modify: `backend/app/services/resume_service.py`
- Modify: `backend/tests/test_resume_intelligence_service.py`

- [ ] **Step 1: Write the failing test**

```python
def test_summarize_resume_experiences_prefers_structured_industry_labels(db):
    resume = Resume(parsed_data={"industry_key": "finance", ...})
    ...
    assert summary["industry_summary"][0]["industry_label"] == "金融行业"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_resume_intelligence_service.py -k prefers_structured_industry_labels -v`
Expected: FAIL because aggregation still depends on keyword matching first.

- [ ] **Step 3: Write minimal implementation**

```python
def _industry_context_for_resume(resume: Resume) -> Dict[str, str]:
    ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_resume_intelligence_service.py -k prefers_structured_industry_labels -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/resume_service.py backend/tests/test_resume_intelligence_service.py
git commit -m "feat: prefer structured industry tags in dashboard"
```

### Task 4: Verify the full resume analysis flow

**Files:**
- Modify: none
- Test: `backend/tests/test_resume_intelligence_service.py`

- [ ] **Step 1: Run the targeted test file**

Run: `cd backend && pytest tests/test_resume_intelligence_service.py -v`
Expected: PASS

- [ ] **Step 2: Run the prompt/settings smoke path**

Run: `cd backend && pytest tests/test_resume_intelligence_service.py -k prompt -v`
Expected: PASS

- [ ] **Step 3: Confirm the dashboard API still returns grouped summaries**

Run: `cd backend && pytest tests/test_resume_intelligence_service.py -k summary -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_resume_intelligence_service.py backend/app/services/resume_service.py backend/app/services/ai_service.py backend/app/utils/prompt_manager.py backend/app/config/prompt_variables.py backend/app/config/resume_industry.py
git commit -m "test: cover llm-backed resume positioning"
```
