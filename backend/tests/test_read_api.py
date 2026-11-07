from fastapi.testclient import TestClient

from cqa.config import Settings
from cqa.main import create_app


def test_empty_startup_and_checklist(tmp_path):
    client = TestClient(create_app(Settings(database_path=tmp_path / "api.db")))
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/conversations").json() == {"items": [], "total": 0}
    assert client.get("/api/meta").json()["reporting_timezone"] == "Asia/Almaty"
    assert client.get("/api/checklists").json()["total"] == 1
    assert client.get("/api/checklists/cqa-v1").json()["id"] == "cqa-v1"
    assert client.get("/api/checklists/missing").status_code == 404


def test_import_list_filters_detail_and_persistence(tmp_path, envelope):
    settings = Settings(database_path=tmp_path / "api.db", cors_origins=("http://localhost:5173",))
    client = TestClient(create_app(settings))
    response = client.post("/api/datasets/import", json={"group_id": "DEV", "payload": envelope})
    assert response.status_code == 200
    assert response.json()["total_records"] == 1
    rows = client.get("/api/conversations?dataset_id=DEV&channel=agent%20chat&language=EN&page=1&page_size=10").json()
    assert rows["total"] == 1 and len(rows["items"]) == 1
    assert rows["items"][0]["evaluation_id"] is None
    assert client.get("/api/conversations?language=RU").json()["total"] == 0
    assert client.get("/api/conversations?page=2&page_size=1").json()["items"] == []
    detail = client.get("/api/conversations/fiction-001?dataset_id=DEV").json()
    assert detail["transcript"] == envelope["data"]["records"][0]["transcript"]
    assert client.get("/api/conversations/fiction-001?dataset_id=OTHER").status_code == 404
    assert client.get("/api/conversations?page=0").status_code == 422
    assert client.get("/api/conversations?channel=topic").status_code == 422
    assert client.get("/api/conversations?language=xx").status_code == 422
    assert client.get("/api/conversations?page_size=501").status_code == 422
    assert TestClient(create_app(settings)).get("/api/conversations").json()["total"] == 1
    assert client.options("/api/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"}).headers["access-control-allow-origin"] == "http://localhost:5173"


def test_bad_import_returns_actionable_error(tmp_path, envelope):
    client = TestClient(create_app(Settings(database_path=tmp_path / "api.db")))
    envelope["data"]["total_records"] = 2
    response = client.post("/api/datasets/import", json={"group_id": "DEV", "payload": envelope})
    assert response.status_code == 422
    assert "count" in response.json()["detail"].lower()


def test_invalid_source_errors_do_not_reflect_source_data(tmp_path, envelope):
    client = TestClient(create_app(Settings(database_path=tmp_path / "api.db")))
    envelope["data"]["records"][0]["transcript"][0]["text"] = ["Private fictional source."]
    response = client.post("/api/datasets/import", json={"group_id": "DEV", "payload": envelope})
    assert response.status_code == 422
    assert "Private fictional source" not in response.text
    assert "text" in response.text
    assert client.get("/api/conversations").json()["total"] == 0


def test_openapi_publishes_only_implemented_routes_and_typed_envelope(tmp_path):
    client = TestClient(create_app(Settings(database_path=tmp_path / "api.db")))
    schema = client.get("/openapi.json").json()
    assert set(schema["paths"]) == {
        "/api/health", "/api/meta", "/api/datasets/import", "/api/conversations",
        "/api/conversations/{id}", "/api/checklists", "/api/checklists/{id}",
        "/api/runs", "/api/runs/{id}", "/api/runs/{id}/cancel", "/api/evaluations/{id}", "/api/usage",
        "/api/appeals", "/api/appeals/{id}/decision", "/api/exports/{dataset_id}",
        "/api/conversations/search", "/api/analytics", "/api/reports",
        "/api/reports/{id}", "/api/reports/{id}/refresh",
    }
    assert schema["components"]["schemas"]["DatasetImportRequest"]["properties"]["payload"]["$ref"].endswith("/SourceEnvelope")
    assert schema["components"]["schemas"]["ConversationResponse"]["properties"]["transcript"]["items"]["$ref"].endswith("/SourceTurn")
