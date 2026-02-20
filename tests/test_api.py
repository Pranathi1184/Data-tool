import io
import os
import sys
import json
import pandas as pd
from fastapi.testclient import TestClient
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import main


client = TestClient(main.app)


def make_excel_bytes(df: pd.DataFrame, sheet_name: str = "Sheet1") -> bytes:
    bio = io.BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name=sheet_name, index=False)
    bio.seek(0)
    return bio.getvalue()


def test_root_health():
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"
    assert "/upload" in "".join(data.get("endpoints", []))


def test_upload_csv_preview():
    df = pd.DataFrame({"A": [1, 2], "B": ["x", "y"]})
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    files = {"file": ("sample.csv", csv_bytes, "text/csv")}
    r = client.post("/upload", files=files)
    assert r.status_code == 200
    body = r.json()
    assert body["merged"] is False
    assert body["columns"] == ["A", "B"]
    assert "recommendations" in body


def test_join_simulate_simple():
    left = pd.DataFrame({"Account No": [1, 2, 3], "Revenue": [100, 150, 200]})
    right = pd.DataFrame({"Account No": [2, 3], "Name": ["Acme", "Beta"]})
    files = {
        "file_a": ("a.xlsx", make_excel_bytes(left), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "file_b": ("b.xlsx", make_excel_bytes(right), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    }
    data = {"key": "Account No", "how": "left", "sample": "5"}
    r = client.post("/join-simulate", files=files, data=data)
    assert r.status_code == 200
    body = r.json()
    assert "columns" in body and "sample" in body
    # Right-side column should be present in joined columns
    assert "Name" in body["columns"]


def test_transform_calculate_net_profit():
    df = pd.DataFrame({"Revenue": [100, 200], "COGS": [40, 50], "Expenses": [10, 20]})
    xls = make_excel_bytes(df)
    recipe = json.dumps([
        {"type": "calculateNetProfit"}
    ])
    files = {"file": ("pnl.xlsx", xls, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"recipe": recipe}
    r = client.post("/transform", files=files, data=data)
    assert r.status_code == 200
    body = r.json()
    assert "Net Profit" in body["columns"]


def test_preview_transform_join_and_sort():
    left = pd.DataFrame({"Account No": [1, 2, 3], "Date": ["2024-01-02", "2024-01-01", "2024-02-01"]})
    right = pd.DataFrame({"Account No": [2, 3], "Flag": ["Y", "N"]})
    files = {
        "file": ("left.xlsx", make_excel_bytes(left), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "join_file": ("right.xlsx", make_excel_bytes(right), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    }
    recipe = json.dumps([
        {"type": "joinWithFile", "config": {"key": "Account No", "how": "left", "suffixes": ["", "_j"]}},
        {"type": "standardizeDate", "config": {"col": "Date"}},
        {"type": "sortByDate", "config": {"col": "Date", "order": "asc"}}
    ])
    data = {"recipe": recipe, "limit": "5"}
    r = client.post("/preview-transform", files=files, data=data)
    assert r.status_code == 200
    body = r.json()
    assert "columns" in body and "sample" in body
    # Ensure join column appears
    assert "Flag" in body["columns"]
