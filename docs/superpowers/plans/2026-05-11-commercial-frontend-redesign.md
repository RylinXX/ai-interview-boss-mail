# Commercial Frontend Redesign Plan

> **For AI Agent:** REQUIRED SUB-SKILL: Use executing-plans to execute this plan.

## Goal

Turn the existing admin-like interface into a more commercial recruiting SaaS console, using the confirmed A direction: Executive SaaS Console.

## Scope

- Refresh the application shell so the product feels like a polished B2B platform.
- Redesign the login page as a product entry point with a trustworthy enterprise tone.
- Redesign the dashboard into an executive recruiting operations workspace with stronger hierarchy, denser cards, and improved chart/table framing.
- Extend global styling so Ant Design controls, cards, tables, and metrics feel consistent across the app.
- Keep behavior unchanged except for visual structure and already-implemented delete UX fixes.

## Steps

1. Update repository hygiene for generated design companion artifacts.
2. Refactor layout shell branding, header, navigation, and content spacing.
3. Rebuild login page visual composition.
4. Rebuild dashboard visual composition around KPI cards, funnel, charts, activity feed, and analysis tabs.
5. Add global CSS for the commercial theme and responsive behavior.
6. Run frontend build and browser visual verification against the local dev server.

## Verification

- `cd frontend && npm run build`
- Open the local frontend and verify login/dashboard visual hierarchy at desktop width.
- Keep the existing backend/frontend dev servers available for the user.
