# API Reference

## Health
- `GET /api/v1/health`

## Tickets
- `POST /api/v1/tickets`
- `GET /api/v1/tickets`
- `GET /api/v1/tickets/queue`
- `POST /api/v1/tickets/{id}/claim`
- `POST /api/v1/tickets/{id}/approve`
- `POST /api/v1/tickets/{id}/reject`
- `POST /api/v1/tickets/{id}/edit-resolve`
- `POST /api/v1/tickets/{id}/reopen`
- `POST /api/v1/tickets/{id}/feedback`

## Knowledge
- `POST /api/v1/knowledge`
- `GET /api/v1/knowledge`
- `GET /api/v1/knowledge/{id}`
- `PUT /api/v1/knowledge/{id}`
- `DELETE /api/v1/knowledge/{id}`
- `POST /api/v1/knowledge/upload`

## Notifications
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/{id}/read`

## Manager
- `GET /api/v1/manager/overview`
- `GET /api/v1/manager/teams`

## Analytics
- `GET /api/v1/analytics/dashboard`
- `POST /api/v1/analytics/query`

## SLA
- `GET /api/v1/sla/dashboard`
- `GET /api/v1/sla/policies`
- `POST /api/v1/sla/policies`
- `PUT /api/v1/sla/policies/{id}`
- `DELETE /api/v1/sla/policies/{id}`
