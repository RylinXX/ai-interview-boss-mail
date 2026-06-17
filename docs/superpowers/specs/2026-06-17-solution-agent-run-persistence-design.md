# Solution Agent Run Persistence Design

**Goal:** Persist every solution-agent generation as a conversation, messages, run, and replayable steps so users can revisit why an answer was produced.

**Scope:** This phase adds backend persistence and read APIs only. It does not redesign the React chat UI yet and does not introduce autonomous multi-agent execution.

## Design

Add four tables:

- `solution_agent_conversations`: one user-facing thread with title, owner, message count, and last active time.
- `solution_agent_messages`: user/assistant messages with sources, agent trace, and retrieval log.
- `solution_agent_runs`: one execution record per generation with request payload, response payload, retrieval log, evidence coverage, and status.
- `solution_agent_steps`: replayable steps derived from actual `agent_trace`.

`/solution-agent/generate` will accept an optional `conversation_id`. If absent, it creates a conversation. The response will include `conversation_id`, `run_id`, `user_message_id`, and `assistant_message_id`.

Read APIs:

- `GET /solution-agent/conversations`
- `GET /solution-agent/conversations/{conversation_id}/messages`
- `GET /solution-agent/runs/{run_id}`

## Testing

Tests will verify that one generation creates a conversation, persists user and assistant messages, stores run metadata, and exposes replayable steps.

