from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_reports_whether_symptom_intake_is_configured() -> None:
    # Lets an operator check configuration without submitting a symptom
    # description, and makes a silently-disabled deployment visible.
    body = client.get("/health").json()

    assert "symptom_intake_configured" in body
    assert isinstance(body["symptom_intake_configured"], bool)
