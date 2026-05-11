# BOSS Mail Resume Import Design

## Goal

Automatically import resumes forwarded from BOSS Zhipin into the current AI Interview system.
The importer should connect to the configured 163 mailbox, find BOSS resume emails,
skip duplicates, create resume records for new candidates, and start the existing AI
resume evaluation flow.

The initial production target is the mailbox configured by the administrator. Secrets
such as mailbox authorization codes must be stored through settings or environment
configuration and must not be committed to Git.

## Current System Context

The project already has a resume ingestion and evaluation path:

1. A resume file is saved under `uploads/resumes`.
2. A `Resume` row is created with `parse_status="processing"`.
3. The existing task queue runs resume parsing and AI matching.
4. The AI result updates candidate information, score, screening result, and workflow status.

The system also has admin settings for outgoing SMTP mail, but it has no inbound
mailbox polling, import status tracking, or attachment-level duplicate detection.

## Recommended Approach

Build the feature as an embedded inbound-mail importer rather than an external script.

The importer will use IMAP, because 163 mail supports IMAP and IMAP exposes stable
message identifiers and search behavior that fit polling. POP3 is not preferred for
this feature because it is weaker for incremental sync and read-state management.

The first supported source will be BOSS Zhipin forwarded resume emails. The importer
will filter by sender and subject/body markers containing `BOSS直聘`, then process
resume attachments.

## Data Model

Add inbound mail settings to system configuration or a dedicated config table:

- `resume_mail_import_enabled`
- `resume_mail_imap_host`
- `resume_mail_imap_port`
- `resume_mail_username`
- `resume_mail_password`
- `resume_mail_use_ssl`
- `resume_mail_default_position_id`
- `resume_mail_poll_interval_seconds`
- `resume_mail_mark_success_read`
- `resume_mail_last_sync_at`

Add a dedicated import log table, for example `resume_mail_imports`:

- `id`
- `message_uid`
- `message_id`
- `mailbox`
- `sender`
- `subject`
- `received_at`
- `attachment_filename`
- `attachment_sha256`
- `position_id`
- `resume_id`
- `status`
- `reason`
- `created_at`
- `updated_at`

Recommended unique constraints:

- Unique `(mailbox, message_uid, attachment_sha256)` for attachment processing.
- Unique `attachment_sha256` for global attachment duplicate detection.

The existing `Resume` table should be extended with optional metadata if practical:

- `source`
- `source_message_id`
- `source_attachment_hash`

These fields make imported resumes easier to audit from the resume list and help
deduplicate future imports.

## Position Routing

Create a default position named `AI 产品经理`.

For BOSS emails, route resumes as follows:

1. Parse the intended position from the subject, such as `应聘 ai产品经理`.
2. Try to match an open or published system position by normalized title.
3. If no title match exists, use the configured default position.
4. If no default position exists, log the message as failed with `missing_default_position`.

This lets the first version import immediately while leaving room for multiple BOSS
positions later.

## Import Flow

The sync process will run both automatically and manually:

1. Admin enables the importer and saves IMAP settings.
2. A background poller wakes up on the configured interval, initially every 120 seconds.
3. The poller connects to `imap.163.com` over SSL.
4. It searches recent or unread messages that match BOSS markers.
5. For each matching message, it extracts candidate metadata from subject/body when available.
6. It scans attachments and accepts `.pdf`, `.docx`, `.txt`, `.md`, and `.markdown`.
7. It computes SHA256 for each accepted attachment before writing the file.
8. If the message UID or attachment hash has already been imported, it records a skipped result.
9. For new attachments, it saves the file under `uploads/resumes` and creates a `Resume`.
10. It submits the resume to the existing parsing/evaluation queue.
11. Successful messages may be marked as read when that setting is enabled.

The importer should process a bounded batch per poll, for example 20 messages, so a
large mailbox cannot block the web server indefinitely.

## Duplicate Handling

Duplicates are skipped in layers:

1. Message UID and attachment hash prevent re-importing the same email attachment.
2. Attachment SHA256 prevents importing the same file from a different forwarded email.
3. Candidate email or phone, when known before import, can skip same-position duplicates.
4. After AI parsing extracts candidate email or phone, the system can mark or skip duplicates
   discovered later in the flow.

For the first implementation, attachment hash and message UID should be authoritative.
Candidate email/phone should remain a secondary check because BOSS forwarded resumes
may not always expose those fields before parsing.

## Services And APIs

Backend components:

- `ResumeMailImportService`: IMAP connection, message search, MIME parsing, filtering, attachment extraction.
- `ResumeImportDeduplicator`: message/hash/candidate duplicate checks.
- `ResumeImportScheduler`: starts and stops the background polling loop with the FastAPI app.
- `ResumeImportRoutes`: admin APIs for settings, connection test, manual sync, and recent logs.

Admin APIs:

- `GET /api/settings/resume-mail-import`
- `PUT /api/settings/resume-mail-import`
- `POST /api/settings/resume-mail-import/test`
- `POST /api/resume-mail-import/sync`
- `GET /api/resume-mail-import/logs`

The service should reuse the existing resume parsing callback rather than duplicating
AI analysis logic.

## Frontend

Add a new tab in the existing admin system settings page:

- Enable/disable import.
- IMAP host, port, SSL, account, and authorization code fields.
- Default position selector.
- Poll interval input.
- Test connection button.
- Manual sync button.
- Recent import results table.

The password field should show only whether a secret is already set. Saving an empty
password must preserve the existing secret.

## Error Handling

Expected statuses:

- `imported`
- `skipped_duplicate_message`
- `skipped_duplicate_attachment`
- `skipped_duplicate_candidate`
- `skipped_no_attachment`
- `skipped_unsupported_attachment`
- `failed_connection`
- `failed_parse_message`
- `failed_save_file`
- `failed_missing_default_position`
- `failed_enqueue`

Connection errors should not crash the app. They should be logged and surfaced in the
recent import table. Manual sync should return a summary of imported, skipped, and
failed counts.

## Security

- Do not commit mailbox credentials.
- Mask stored secrets in API responses.
- Restrict settings and sync endpoints to admins.
- Prefer environment variables for first local setup and database settings for UI-managed setup.
- Recommend rotating any authorization code that was shared outside the settings UI.

## Testing

Backend tests:

- MIME parsing with BOSS-like subject and attachments.
- Duplicate detection by message UID and attachment SHA256.
- Default position routing.
- Unsupported attachment skip behavior.
- Manual sync summary generation.

Integration checks:

- Configure test IMAP settings with a mocked IMAP client.
- Verify new attachments create `Resume` rows and enqueue parse tasks.
- Verify repeated sync skips existing attachments.

Frontend checks:

- Settings form loads and masks existing password.
- Test connection and manual sync actions show success/failure feedback.
- Recent import table displays imported, skipped, and failed records.

## Rollout

1. Add migrations and models.
2. Add backend importer service and admin routes.
3. Add default `AI 产品经理` position seeding or creation helper.
4. Add frontend settings tab.
5. Run backend tests and a manual sync test.
6. Enable the importer locally and confirm BOSS resume emails enter the resume queue.
