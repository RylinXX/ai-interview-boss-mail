# Consulting Workbench Polish Design

## Goal

Reposition the product as an internal AI product manager and business optimization workbench used by the solution provider. The interface should no longer feel like a recruiting or generic admin system. It should feel like a formal consulting delivery room: customer dossier, diagnosis, solution document, AI employee task execution, and reusable senior talent capability evidence.

## Chosen Direction

The selected visual direction is **consulting delivery**.

The product should feel like a polished enterprise consulting product: restrained, spacious, structured, and credible. It should avoid decorative tech gradients, playful cards, and visually loud dashboards. The visual language should use deep navy, warm ivory, champagne/gold accents, slate text, fine borders, and editorial document surfaces.

## Primary Product Flow

The main workflow is:

1. Create or import a customer project from a business optimization conversation.
2. Capture customer background, business model, pain points, goals, and current process.
3. Generate a business diagnosis.
4. Generate an execution task board.
5. Assign task drafts to AI employee roles.
6. Review and accept AI employee outputs.
7. Continuously update the solution document.
8. Export the final solution document for client-facing or internal delivery.

The customer project is the system's central delivery object. It is not just a database row; it is the container that ties together business context, diagnosis, solution, tasks, AI employee output, and delivery progress.

## Page Design

### Global Shell

The app shell should reinforce the consulting product positioning.

- Product name should read as a business transformation platform, not a resume system.
- Navigation should group capabilities by delivery sequence: workbench, customer projects, solution agent, AI employees, capability samples.
- Header copy should describe customer diagnosis, solution design, and AI employee execution.
- Visual density should be calmer than the current MVP, with fewer bright chips and stronger page hierarchy.

### Customer Projects List

The list page should work as a portfolio of active consulting engagements.

It should include:

- A formal hero band that explains customer projects as delivery dossiers.
- KPI strips for active projects, ready-to-deliver projects, AI employee drafts, and capability sample coverage.
- A project table with clear status, industry, pain points, next step, and document title.
- A stronger "new project" action that feels like starting a delivery engagement.

### Customer Project Detail

The detail page should open as a **consulting dossier**.

The first screen should prioritize:

- Customer profile and current engagement status.
- Executive diagnosis summary.
- Solution document preview or document state.
- Delivery progress and next recommended action.

The task board should remain prominent, but not dominate the first impression. It should feel like a controlled execution layer under the solution dossier.

The page should have these sections:

- Engagement header: customer name, industry, scale, status, primary actions.
- Strategy brief: pain points, goals, diagnosis highlights, risks, next questions.
- Solution document: editable and exportable with a more document-like surface.
- AI execution lane: staged tasks, assigned AI employee, run state, output preview, review action.
- Evidence panel: capability samples from senior talent resumes, used as delivery credibility.

### AI Employees

The AI employee page should look like a registry of delivery roles rather than novelty bots.

Each role should show:

- Role name and responsibility.
- Inputs it expects.
- Output template.
- Where it appears in the customer project flow.
- Current MVP status.

### Visual Assets

Use generated bitmap assets where they help create product legitimacy, especially:

- A consulting delivery room / executive dossier hero image.
- AI employee role badges or formal role cards.
- Abstract capability evidence image for the senior talent sample library.

These assets should be restrained and professional. They should not be cartoon mascots, glossy sci-fi art, or decorative blobs. They can be used as background panels, empty states, or hero accents.

## Data And Integration

The current backend model can remain the foundation:

- `CustomerProject` stores the engagement.
- `ProjectTask` stores execution items.
- `SolutionDocument` stores the evolving solution.
- `AIEmployeeRun` stores AI-generated task drafts and acceptance state.

Needed product integration:

- Add a path from the business optimization solution agent into customer projects.
- A generated solution should be able to create a new customer project or attach to an existing one.
- Accepted AI employee output should visibly update task output and document content.

## Error Handling

- Missing LLM/API settings should be framed as "AI execution unavailable" rather than generic system failure.
- Empty states should explain the next meaningful action: generate diagnosis, generate task board, run AI employee, or write solution document.
- Project creation should preserve user-entered context if API calls fail.

## Testing

Backend:

- Existing business workbench route tests should continue passing.
- Add route coverage if new solution-agent-to-project endpoints are added.

Frontend:

- Production build must pass.
- Browser verification should cover login, customer projects list, project creation, detail page render, task board render, and AI employee page render.
- Visual checks should confirm the new layout looks formal on desktop and does not collapse awkwardly on mobile widths.

## Out Of Scope For This Pass

- Real autonomous AI employee execution beyond current draft generation.
- Full CRM permissions and client collaboration.
- Replacing the senior talent resume data source.
- Public-facing client portal.
