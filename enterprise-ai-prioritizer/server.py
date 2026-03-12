#!/usr/bin/env python3
"""Simple enterprise-ai-prioritizer server with SQLite persistence.

Serves static files and provides REST endpoints under /api.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "initiatives.db")

MAX_AUDIT_ENTRIES = 200

WORKFLOW_STATUSES = [
    "draft",
    "submitted",
    "triage",
    "assessment",
    "board_review",
    "approved",
    "approved_with_conditions",
    "hold",
    "rejected",
    "in_delivery",
    "closed",
]

BOARD_DECISIONS = ["approve_now", "approve_after_discovery", "hold", "reject"]

DECISION_TO_STATUS = {
    "approve_now": "approved",
    "approve_after_discovery": "approved_with_conditions",
    "hold": "hold",
    "reject": "rejected",
}

STATUS_TRANSITIONS = {
    "draft": ["submitted"],
    "submitted": ["triage", "assessment", "board_review", "hold", "rejected"],
    "triage": ["assessment", "hold", "rejected", "board_review"],
    "assessment": ["board_review", "hold", "rejected"],
    "board_review": ["approved", "approved_with_conditions", "hold", "rejected"],
    "approved": ["in_delivery", "closed"],
    "approved_with_conditions": ["in_delivery", "hold", "closed"],
    "hold": ["triage", "assessment", "board_review", "rejected"],
    "rejected": ["triage", "closed"],
    "in_delivery": ["closed", "hold"],
    "closed": [],
}

MAX_LEN = {
    "title": 140,
    "businessUnit": 100,
    "requesterName": 120,
    "requesterEmail": 254,
    "businessOwner": 120,
    "kpiTarget": 180,
    "processFrequency": 180,
    "systemsInvolved": 500,
    "dataSensitivity": 240,
    "desiredTimeline": 120,
    "attachments": 2000,
    "owner": 120,
    "problemDescription": 3000,
    "expectedOutcome": 3000,
    "rationale": 1000,
}

REQUIRED_FIELDS = [
    "title",
    "businessUnit",
    "requesterName",
    "requesterEmail",
    "businessOwner",
    "problemDescription",
    "expectedOutcome",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sanitize_short(value: Any, max_len: int) -> str:
    text = str(value or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len]


def sanitize_long(value: Any, max_len: int) -> str:
    text = str(value or "").replace("\r\n", "\n").strip()
    return text[:max_len]


def sanitize_email(value: Any) -> str:
    return sanitize_short(value, MAX_LEN["requesterEmail"]).lower()


def is_valid_email(value: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value or ""))


def normalize_status(value: Any) -> str:
    raw = sanitize_short(value, 64)
    return raw if raw in WORKFLOW_STATUSES else "draft"


def can_transition_status(current_status: str, next_status: str) -> bool:
    current = normalize_status(current_status)
    nxt = normalize_status(next_status)
    if current == nxt:
        return True
    return nxt in STATUS_TRANSITIONS.get(current, [])


def normalize_payload(payload: dict[str, Any] | None) -> dict[str, str]:
    payload = payload or {}
    return {
        "title": sanitize_short(payload.get("title"), MAX_LEN["title"]),
        "businessUnit": sanitize_short(payload.get("businessUnit"), MAX_LEN["businessUnit"]),
        "requesterName": sanitize_short(payload.get("requesterName"), MAX_LEN["requesterName"]),
        "requesterEmail": sanitize_email(payload.get("requesterEmail")),
        "businessOwner": sanitize_short(payload.get("businessOwner"), MAX_LEN["businessOwner"]),
        "problemDescription": sanitize_long(
            payload.get("problemDescription"), MAX_LEN["problemDescription"]
        ),
        "expectedOutcome": sanitize_long(payload.get("expectedOutcome"), MAX_LEN["expectedOutcome"]),
        "kpiTarget": sanitize_short(payload.get("kpiTarget"), MAX_LEN["kpiTarget"]),
        "processFrequency": sanitize_short(payload.get("processFrequency"), MAX_LEN["processFrequency"]),
        "systemsInvolved": sanitize_long(payload.get("systemsInvolved"), MAX_LEN["systemsInvolved"]),
        "dataSensitivity": sanitize_short(payload.get("dataSensitivity"), MAX_LEN["dataSensitivity"]),
        "desiredTimeline": sanitize_short(payload.get("desiredTimeline"), MAX_LEN["desiredTimeline"]),
        "attachments": sanitize_long(payload.get("attachments"), MAX_LEN["attachments"]),
        "owner": sanitize_short(payload.get("owner"), MAX_LEN["owner"]),
    }


def validate_payload(payload: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if not (payload.get(field) or "").strip():
            errors.append(f"{field} is required")
    if payload.get("requesterEmail") and not is_valid_email(payload["requesterEmail"]):
        errors.append("requesterEmail must be a valid email address")
    return errors


def db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with db_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS initiatives (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                status TEXT NOT NULL,
                owner TEXT NOT NULL,
                priority_lane TEXT NOT NULL,
                final_score REAL,
                stage0_classification TEXT,
                assessment_json TEXT,
                board_decision_json TEXT,
                title TEXT NOT NULL,
                business_unit TEXT NOT NULL,
                requester_name TEXT NOT NULL,
                requester_email TEXT NOT NULL,
                business_owner TEXT NOT NULL,
                problem_description TEXT NOT NULL,
                expected_outcome TEXT NOT NULL,
                kpi_target TEXT,
                process_frequency TEXT,
                systems_involved TEXT,
                data_sensitivity TEXT,
                desired_timeline TEXT,
                attachments TEXT
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                initiative_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                note TEXT NOT NULL,
                payload_json TEXT,
                FOREIGN KEY(initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_initiatives_updated_at ON initiatives(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_initiatives_status ON initiatives(status);
            CREATE INDEX IF NOT EXISTS idx_initiatives_business_unit ON initiatives(business_unit);
            CREATE INDEX IF NOT EXISTS idx_initiatives_owner ON initiatives(owner);
            CREATE INDEX IF NOT EXISTS idx_audit_initiative ON audit_events(initiative_id, event_id DESC);

            CREATE TABLE IF NOT EXISTS counters (
                name TEXT PRIMARY KEY,
                value INTEGER NOT NULL
            );
            """
        )
        conn.execute("INSERT OR IGNORE INTO counters(name, value) VALUES('initiative_seq', 0)")


def parse_json_safe(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def append_audit(
    conn: sqlite3.Connection,
    initiative_id: str,
    actor: str,
    action: str,
    note: str,
    payload: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO audit_events(initiative_id, timestamp, actor, action, note, payload_json)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            initiative_id,
            now_iso(),
            sanitize_short(actor, 120) or "system",
            sanitize_short(action, 120),
            sanitize_long(note, 500),
            json.dumps(payload, ensure_ascii=True) if payload else None,
        ),
    )
    conn.execute(
        """
        DELETE FROM audit_events
        WHERE initiative_id = ?
          AND event_id NOT IN (
            SELECT event_id
            FROM audit_events
            WHERE initiative_id = ?
            ORDER BY event_id DESC
            LIMIT ?
          )
        """,
        (initiative_id, initiative_id, MAX_AUDIT_ENTRIES),
    )


def load_audit(conn: sqlite3.Connection, initiative_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT timestamp, actor, action, note, payload_json
        FROM audit_events
        WHERE initiative_id = ?
        ORDER BY event_id DESC
        """,
        (initiative_id,),
    ).fetchall()
    out = []
    for row in rows:
        out.append(
            {
                "timestamp": row["timestamp"],
                "actor": row["actor"],
                "action": row["action"],
                "note": row["note"],
                "payload": parse_json_safe(row["payload_json"]),
            }
        )
    return out


def row_to_initiative(conn: sqlite3.Connection, row: sqlite3.Row, include_audit: bool = False) -> dict[str, Any]:
    initiative = {
        "id": row["id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "status": row["status"],
        "owner": row["owner"],
        "priorityLane": row["priority_lane"],
        "finalScore": row["final_score"],
        "stage0Classification": row["stage0_classification"],
        "assessment": parse_json_safe(row["assessment_json"]),
        "boardDecision": parse_json_safe(row["board_decision_json"]),
        "title": row["title"],
        "businessUnit": row["business_unit"],
        "requesterName": row["requester_name"],
        "requesterEmail": row["requester_email"],
        "businessOwner": row["business_owner"],
        "problemDescription": row["problem_description"],
        "expectedOutcome": row["expected_outcome"],
        "kpiTarget": row["kpi_target"] or "",
        "processFrequency": row["process_frequency"] or "",
        "systemsInvolved": row["systems_involved"] or "",
        "dataSensitivity": row["data_sensitivity"] or "",
        "desiredTimeline": row["desired_timeline"] or "",
        "attachments": row["attachments"] or "",
    }
    if include_audit:
        initiative["auditTrail"] = load_audit(conn, row["id"])
    return initiative


def next_sequence(conn: sqlite3.Connection) -> int:
    conn.execute("UPDATE counters SET value = value + 1 WHERE name = 'initiative_seq'")
    row = conn.execute("SELECT value FROM counters WHERE name = 'initiative_seq'").fetchone()
    return int(row["value"]) if row else 1


def generate_initiative_id(conn: sqlite3.Connection) -> str:
    seq = next_sequence(conn)
    year = datetime.now(timezone.utc).year
    return f"AII-{year}-{seq:04d}"


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json_response(self, status: int, payload: Any) -> None:
        content = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _json_error(self, status: int, message: str) -> None:
        self._json_response(status, {"error": message})

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api_get(parsed)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api_post(parsed)
            return
        self._json_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_PATCH(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api_patch(parsed)
            return
        self._json_error(HTTPStatus.NOT_FOUND, "Not found")

    def _handle_api_get(self, parsed: Any) -> None:
        path = parsed.path
        try:
            if path == "/api/health":
                self._json_response(HTTPStatus.OK, {"status": "ok", "dbPath": DB_PATH})
                return
            if path == "/api/initiatives":
                self._list_initiatives(parse_qs(parsed.query))
                return
            if path == "/api/initiatives/meta":
                self._initiatives_meta()
                return
            if path == "/api/initiatives/stats":
                self._initiatives_stats()
                return
            m = re.fullmatch(r"/api/initiatives/([^/]+)", path)
            if m:
                self._get_initiative(m.group(1))
                return
            self._json_error(HTTPStatus.NOT_FOUND, "Endpoint not found")
        except Exception as exc:  # pragma: no cover - runtime guard
            self._json_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Internal error: {exc}")

    def _handle_api_post(self, parsed: Any) -> None:
        path = parsed.path
        try:
            if path == "/api/initiatives":
                self._create_initiative()
                return
            m_assessment = re.fullmatch(r"/api/initiatives/([^/]+)/assessment", path)
            if m_assessment:
                self._save_assessment(m_assessment.group(1))
                return
            m_decision = re.fullmatch(r"/api/initiatives/([^/]+)/board-decision", path)
            if m_decision:
                self._save_board_decision(m_decision.group(1))
                return
            self._json_error(HTTPStatus.NOT_FOUND, "Endpoint not found")
        except Exception as exc:  # pragma: no cover - runtime guard
            self._json_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Internal error: {exc}")

    def _handle_api_patch(self, parsed: Any) -> None:
        path = parsed.path
        try:
            m_status = re.fullmatch(r"/api/initiatives/([^/]+)/status", path)
            if m_status:
                self._set_status(m_status.group(1))
                return
            self._json_error(HTTPStatus.NOT_FOUND, "Endpoint not found")
        except Exception as exc:  # pragma: no cover - runtime guard
            self._json_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Internal error: {exc}")

    def _list_initiatives(self, query: dict[str, list[str]]) -> None:
        status = sanitize_short((query.get("status") or ["all"])[0], 32)
        business_unit = sanitize_short((query.get("businessUnit") or ["all"])[0], 100)
        lane = sanitize_short((query.get("lane") or ["all"])[0], 80)
        owner = sanitize_short((query.get("owner") or ["all"])[0], 120)
        search = sanitize_short((query.get("search") or [""])[0], 120)

        clauses = []
        params: list[Any] = []
        if status and status != "all":
            clauses.append("status = ?")
            params.append(status)
        if business_unit and business_unit != "all":
            clauses.append("business_unit = ?")
            params.append(business_unit)
        if lane and lane != "all":
            clauses.append("LOWER(priority_lane) = LOWER(?)")
            params.append(lane)
        if owner and owner != "all":
            clauses.append("owner = ?")
            params.append(owner)
        if search:
            clauses.append("(id LIKE ? OR title LIKE ? OR business_unit LIKE ? OR business_owner LIKE ?)")
            needle = f"%{search}%"
            params.extend([needle, needle, needle, needle])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with db_conn() as conn:
            rows = conn.execute(
                f"""
                SELECT *
                FROM initiatives
                {where_sql}
                ORDER BY updated_at DESC
                """,
                params,
            ).fetchall()
            payload = [row_to_initiative(conn, row, include_audit=False) for row in rows]
        self._json_response(HTTPStatus.OK, payload)

    def _get_initiative(self, initiative_id_raw: str) -> None:
        initiative_id = sanitize_short(initiative_id_raw, 64)
        with db_conn() as conn:
            row = conn.execute("SELECT * FROM initiatives WHERE id = ?", (initiative_id,)).fetchone()
            if not row:
                self._json_error(HTTPStatus.NOT_FOUND, "Initiative not found")
                return
            payload = row_to_initiative(conn, row, include_audit=True)
        self._json_response(HTTPStatus.OK, payload)

    def _initiatives_meta(self) -> None:
        with db_conn() as conn:
            business_units = [
                row[0]
                for row in conn.execute(
                    "SELECT DISTINCT business_unit FROM initiatives WHERE business_unit <> '' ORDER BY business_unit"
                ).fetchall()
            ]
            owners = [
                row[0]
                for row in conn.execute(
                    "SELECT DISTINCT owner FROM initiatives WHERE owner <> '' ORDER BY owner"
                ).fetchall()
            ]
        self._json_response(HTTPStatus.OK, {"businessUnits": business_units, "owners": owners})

    def _initiatives_stats(self) -> None:
        by_status = {status: 0 for status in WORKFLOW_STATUSES}
        with db_conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM initiatives").fetchone()[0]
            rows = conn.execute("SELECT status, COUNT(*) FROM initiatives GROUP BY status").fetchall()
            for status, count in rows:
                if status in by_status:
                    by_status[status] = int(count)
        self._json_response(HTTPStatus.OK, {"total": int(total), "byStatus": by_status})

    def _create_initiative(self) -> None:
        body = self._read_json_body()
        payload = normalize_payload(body.get("payload") if isinstance(body, dict) else {})
        actor = sanitize_short((body or {}).get("actor"), 120) or "submitter"

        errors = validate_payload(payload)
        if errors:
            self._json_error(HTTPStatus.BAD_REQUEST, f"Invalid initiative payload: {'; '.join(errors)}")
            return

        created_at = now_iso()

        with db_conn() as conn:
            with conn:
                initiative_id = generate_initiative_id(conn)
                conn.execute(
                    """
                    INSERT INTO initiatives (
                        id, created_at, updated_at, status, owner, priority_lane, final_score,
                        stage0_classification, assessment_json, board_decision_json, title,
                        business_unit, requester_name, requester_email, business_owner,
                        problem_description, expected_outcome, kpi_target, process_frequency,
                        systems_involved, data_sensitivity, desired_timeline, attachments
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        initiative_id,
                        created_at,
                        created_at,
                        "submitted",
                        payload["owner"] or "unassigned",
                        "Unassessed",
                        None,
                        None,
                        None,
                        None,
                        payload["title"],
                        payload["businessUnit"],
                        payload["requesterName"],
                        payload["requesterEmail"],
                        payload["businessOwner"],
                        payload["problemDescription"],
                        payload["expectedOutcome"],
                        payload["kpiTarget"],
                        payload["processFrequency"],
                        payload["systemsInvolved"],
                        payload["dataSensitivity"],
                        payload["desiredTimeline"],
                        payload["attachments"],
                    ),
                )
                append_audit(
                    conn,
                    initiative_id,
                    actor,
                    "initiative_created",
                    "Initiative submitted through intake form.",
                )
                row = conn.execute("SELECT * FROM initiatives WHERE id = ?", (initiative_id,)).fetchone()
                payload = row_to_initiative(conn, row, include_audit=True)

        self._json_response(HTTPStatus.CREATED, payload)

    def _set_status(self, initiative_id_raw: str) -> None:
        body = self._read_json_body()
        initiative_id = sanitize_short(initiative_id_raw, 64)
        new_status = normalize_status((body or {}).get("status"))
        actor = sanitize_short((body or {}).get("actor"), 120) or "reviewer"
        note = sanitize_long((body or {}).get("note"), 500)

        with db_conn() as conn:
            row = conn.execute("SELECT * FROM initiatives WHERE id = ?", (initiative_id,)).fetchone()
            if not row:
                self._json_error(HTTPStatus.NOT_FOUND, "Initiative not found")
                return

            current_status = row["status"]
            if not can_transition_status(current_status, new_status):
                self._json_error(
                    HTTPStatus.BAD_REQUEST,
                    f"Invalid status transition: {current_status} -> {new_status}",
                )
                return

            with conn:
                conn.execute(
                    "UPDATE initiatives SET status = ?, updated_at = ? WHERE id = ?",
                    (new_status, now_iso(), initiative_id),
                )
                append_audit(
                    conn,
                    initiative_id,
                    actor,
                    "status_changed",
                    note or f"Status updated to {new_status}.",
                )
                updated = conn.execute("SELECT * FROM initiatives WHERE id = ?", (initiative_id,)).fetchone()

            payload = row_to_initiative(conn, updated, include_audit=True)
        self._json_response(HTTPStatus.OK, payload)

    def _save_assessment(self, initiative_id_raw: str) -> None:
        body = self._read_json_body()
        initiative_id = sanitize_short(initiative_id_raw, 64)
        assessment = (body or {}).get("assessment")
        actor = sanitize_short((body or {}).get("actor"), 120) or "reviewer"

        if not isinstance(assessment, dict):
            self._json_error(HTTPStatus.BAD_REQUEST, "assessment object is required")
            return

        stage0 = sanitize_short(assessment.get("stage0Choice"), 64)
        lane = sanitize_short((assessment.get("classification") or {}).get("lane"), 80) or "Unassessed"
        score_raw = assessment.get("score")
        final_score = float(score_raw) if isinstance(score_raw, (int, float)) else None

        with db_conn() as conn:
            row = conn.execute("SELECT * FROM initiatives WHERE id = ?", (initiative_id,)).fetchone()
            if not row:
                self._json_error(HTTPStatus.NOT_FOUND, "Initiative not found")
                return

            next_status = row["status"]
            if row["status"] in ("submitted", "triage", "assessment") and can_transition_status(
                row["status"], "board_review"
            ):
                next_status = "board_review"

            with conn:
                conn.execute(
                    """
                    UPDATE initiatives
                    SET updated_at = ?, status = ?, stage0_classification = ?, priority_lane = ?,
                        final_score = ?, assessment_json = ?
                    WHERE id = ?
                    """,
                    (
                        now_iso(),
                        next_status,
                        stage0,
                        lane,
                        final_score,
                        json.dumps(assessment, ensure_ascii=True),
                        initiative_id,
                    ),
                )
                append_audit(
                    conn,
                    initiative_id,
                    actor,
                    "assessment_saved",
                    "Stage 0, gates, and scoring assessment saved.",
                )
                updated = conn.execute("SELECT * FROM initiatives WHERE id = ?", (initiative_id,)).fetchone()

            payload = row_to_initiative(conn, updated, include_audit=True)
        self._json_response(HTTPStatus.OK, payload)

    def _save_board_decision(self, initiative_id_raw: str) -> None:
        body = self._read_json_body()
        initiative_id = sanitize_short(initiative_id_raw, 64)
        decision = sanitize_short((body or {}).get("decision"), 64)
        rationale = sanitize_long((body or {}).get("rationale"), MAX_LEN["rationale"])
        actor = sanitize_short((body or {}).get("actor"), 120) or "board_reviewer"

        if decision not in BOARD_DECISIONS:
            self._json_error(HTTPStatus.BAD_REQUEST, "Invalid board decision")
            return

        with db_conn() as conn:
            row = conn.execute("SELECT * FROM initiatives WHERE id = ?", (initiative_id,)).fetchone()
            if not row:
                self._json_error(HTTPStatus.NOT_FOUND, "Initiative not found")
                return

            next_status = DECISION_TO_STATUS[decision]
            if not can_transition_status(row["status"], next_status):
                self._json_error(
                    HTTPStatus.BAD_REQUEST,
                    f"Invalid status transition: {row['status']} -> {next_status}",
                )
                return

            board_decision = {
                "decision": decision,
                "rationale": rationale,
                "decidedAt": now_iso(),
                "decidedBy": actor,
            }

            with conn:
                conn.execute(
                    """
                    UPDATE initiatives
                    SET updated_at = ?, status = ?, board_decision_json = ?
                    WHERE id = ?
                    """,
                    (now_iso(), next_status, json.dumps(board_decision, ensure_ascii=True), initiative_id),
                )
                append_audit(
                    conn,
                    initiative_id,
                    actor,
                    "board_decision_saved",
                    f"Board decision: {decision}.",
                )
                updated = conn.execute("SELECT * FROM initiatives WHERE id = ?", (initiative_id,)).fetchone()

            payload = row_to_initiative(conn, updated, include_audit=True)
        self._json_response(HTTPStatus.OK, payload)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Enterprise AI Prioritizer server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()

    init_db()
    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print(f"Serving on http://{args.host}:{args.port}")
    print(f"SQLite DB: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
