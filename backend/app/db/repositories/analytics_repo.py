from typing import Any, Dict, List

import psycopg
from psycopg.rows import dict_row

from app.config import settings


class AnalyticsRepository:
    def __init__(self) -> None:
        self._dsn = settings.READONLY_DATABASE_URL

    def _require_dsn(self) -> str:
        if not self._dsn:
            raise RuntimeError("READONLY_DATABASE_URL is not configured")
        return self._dsn

    def execute_readonly_query(self, sql_query: str) -> Dict[str, Any]:
        dsn = self._require_dsn()
        with psycopg.connect(dsn, autocommit=True) as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(sql_query)
                rows = cursor.fetchall()
                columns = [desc.name for desc in cursor.description or []]
        return {"rows": rows, "columns": columns}

