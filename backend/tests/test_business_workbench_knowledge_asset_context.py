from uuid import uuid4

from app.models.models import KnowledgeAsset
from app.schemas.business_workbench import AIEmployeeChatRequest
from app.services import business_workbench_service as workbench_service


class _FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, value):
        self.rows = self.rows[:value]
        return self

    def all(self):
        return self.rows


class _FakeDb:
    def __init__(self, assets):
        self.assets = assets

    def query(self, model):
        if model is KnowledgeAsset:
            return _FakeQuery(self.assets)
        return _FakeQuery([])


def test_ai_employee_chat_passes_matching_knowledge_assets_to_model(monkeypatch):
    asset = KnowledgeAsset(
        id=uuid4(),
        title="Template field mapping playbook",
        source_type="manual_note",
        raw_text=(
            "A reusable playbook for template field mapping, qualification "
            "repository governance, document generation, and human review."
        ),
        summary="Template fields and qualification repository governance.",
        industry_tags=["public_sector"],
        business_topic_tags=["template_field_mapping"],
        evidence_type_tags=["playbook"],
        capability_tags=["document_automation"],
        confidence_score=91,
    )

    captured = {}

    def fake_generate_solution_agent_response(payload):
        captured["payload"] = payload
        return {
            "title": "Template automation plan",
            "summary": "Use the knowledge asset to plan template mapping.",
            "recommended_solutions": [
                {
                    "name": "Template field mapping",
                    "scenario": "Generate document drafts from governed assets.",
                    "value": "Reduce repeated manual entry.",
                    "related_cases": ["Template field mapping playbook"],
                    "implementation_steps": ["Map fields", "Review gaps"],
                }
            ],
            "needed_capabilities": ["document_automation"],
            "risks": ["Human review is required."],
            "next_questions": ["Which template comes first?"],
        }

    monkeypatch.setattr(
        workbench_service,
        "generate_solution_agent_response",
        fake_generate_solution_agent_response,
        raising=False,
    )

    result = workbench_service.chat_with_ai_employee(
        _FakeDb([asset]),
        AIEmployeeChatRequest(
            requirement="Need template field mapping and qualification repository governance.",
            company_profile="Public-sector service provider.",
            project_materials="Official templates and company qualification files.",
            messages=[],
            limit=20,
        ),
    )

    knowledge_context = captured["payload"]["knowledge_context"]
    assert knowledge_context["knowledge_assets"][0]["title"] == "Template field mapping playbook"
    assert result["solution"]["knowledge_context"]["knowledge_asset_count"] == 1
    assert result["retrieved_evidence"][0]["asset_title"] == "Template field mapping playbook"
    assert "Template field mapping playbook" in result["assistant_message"]
