# Runbook

## Common incidents

## Tickets not processing
- Check `worker` logs
- Check Redis availability
- Inspect `tickets.processing_error`
- Inspect `ticket_events` for retry/dead-letter events

## SLA dashboard empty
- Confirm tickets have `sla_deadline`
- Confirm `sla-checker` service is running
- Re-run SLA backfill if needed

## Analytics query failures
- Check backend logs for LLM timeout vs SQL validation errors
- Verify `READONLY_DATABASE_URL`
- Verify analytics role RLS migration has been applied

## Dead letter queue
- Redis list key: `tickets:dead_letter`
- Manager/admin should review affected ticket and requeue manually if needed
