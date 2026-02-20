import io, json, os, sys, requests, pandas as pd
from datetime import date, timedelta

BASE = os.environ.get("MIDAS_BASE_URL", "http://127.0.0.1:8000")
SAMPLES = os.path.join(os.path.dirname(__file__), "..", "samples")

def must(ok, msg):
    if not ok:
        print("FAIL:", msg)
        sys.exit(1)
    print("OK:", msg)

def load_sample_csv(name):
    path = os.path.join(SAMPLES, name)
    with open(path, "rb") as f:
        return f.read()

def main():
    try:
        os.makedirs(SAMPLES, exist_ok=True)
    except Exception:
        pass
    path_a = os.path.join(SAMPLES, "sales_a.csv")
    path_b = os.path.join(SAMPLES, "sales_b.csv")
    if not os.path.exists(path_a) or not os.path.exists(path_b):
        rows = []
        start = date(2025, 1, 1)
        for i in range(30):
            d = start + timedelta(days=i)
            rows.append({"Date": d.isoformat(), "Revenue": 1000 + i * 50, "COGS": 600 + i * 20, "Expenses": 200 + (i % 5) * 10, "Type": "Debit" if i % 2 == 0 else "Credit", "Account No": f"ACC{i:04d}"})
        df = pd.DataFrame(rows)
        df.to_csv(path_a, index=False)
        dfb = df[["Account No", "Revenue"]].copy()
        dfb["Revenue"] = dfb["Revenue"] * 1.05
        dfb.to_csv(path_b, index=False)
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/upload", files={"file": ("a.csv", f)}, data={"action": "read"})
        must(r.status_code == 200, "/upload")
        j = r.json()
        must("columns" in j and "sample" in j, "/upload payload")
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/profile", files={"file": ("a.csv", f)})
        must(r.status_code == 200, "/profile")
        j = r.json()
        must("profile" in j and "proposed_recipe" in j, "/profile payload")
    recipe = [{"type": "standardizeDate", "config": {"col": "Date"}}, {"type": "calculateNetProfit"}, {"type": "sortByDate", "config": {"col": "Date", "order": "asc"}}]
    r = requests.post(BASE + "/templates/save", json={"name": "Smoke Template", "recipe": recipe})
    must(r.status_code == 200, "/templates/save")
    r = requests.get(BASE + "/templates")
    must(r.status_code == 200 and "Smoke_Template" in r.json().get("templates", []), "/templates list")
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/transform", files={"file": ("a.csv", f)}, data={"template_name": "Smoke Template"})
        must(r.status_code == 200, "/transform")
        j = r.json()
        must("sample" in j and "log" in j, "/transform payload")
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/preview-transform", files={"file": ("a.csv", f)}, data={"recipe": json.dumps(recipe), "offset": 5, "limit": 5})
        must(r.status_code == 200 and len(r.json().get("sample", [])) == 5, "/preview-transform pagination")
    validators = json.dumps([{"column": "Account No", "preset": "account_no"}])
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/validate", files={"file": ("a.csv", f)}, data={"validators": validators})
        must(r.status_code == 200, "/validate")
    with open(path_a, "rb") as fa, open(path_b, "rb") as fb:
        r = requests.post(BASE + "/join-suggest", files={"file_a": ("a.csv", fa), "file_b": ("b.csv", fb)})
        must(r.status_code == 200, "/join-suggest")
        cand = r.json().get("candidates", [])
        must(len(cand) > 0, "join-suggest candidates")
    with open(path_a, "rb") as fa, open(path_b, "rb") as fb:
        r = requests.post(BASE + "/join-simulate", files={"file_a": ("a.csv", fa), "file_b": ("b.csv", fb)}, data={"key": "Account No", "how": "left", "sample": 5})
        must(r.status_code == 200, "/join-simulate")
        j = r.json()
        must("joined_count" in j, "join-simulate payload")
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/export", files={"file": ("a.csv", f)}, data={"recipe": json.dumps(recipe), "value_column": "Net Profit"})
        must(r.status_code == 200 and "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in r.headers.get("content-type",""), "/export")
    r = requests.post(BASE + "/cache/clear", data={})
    must(r.status_code == 200, "/cache/clear")
    # Extra: filter and stats checks
    filter_recipe = [
        {"type": "filterDateRange", "config": {"col": "Date", "from": "2025-01-08", "to": "2025-01-10"}},
        {"type": "filterDebitCredit", "config": {"col": "Type", "include": ["Debit"]}},
        {"type": "calculateNetProfit"},
    ]
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/transform", files={"file": ("a.csv", f)}, data={"recipe": json.dumps(filter_recipe)})
        must(r.status_code == 200, "/transform filter")
        j = r.json()
        must(j["shape"][0] > 0, "filter kept rows")
        log_last = j["log"][-1]
        must(log_last["rows_after"] <= log_last["rows_before"], "filter reduced or equal rows")
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/profile", files={"file": ("a.csv", f)})
        must(r.status_code == 200, "/profile again")
        prof = r.json()["profile"]
        rev_stats = next((p.get("stats", {}) for p in prof if p.get("column") == "Revenue"), {})
        must("min" in rev_stats and "max" in rev_stats, "profile includes min/max for numeric")
    # Formula and groupByAggregate checks
    formula_recipe = [
        {"type": "addColumnFormula", "config": {"dest": "MarginPct", "expr": "(`Revenue`-`COGS`)/`Revenue`*100"}},
        {"type": "groupByAggregate", "config": {"by": ["Type"], "aggs": {"Revenue": ["sum", "max"], "COGS": ["sum"]}}},
    ]
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/transform", files={"file": ("a.csv", f)}, data={"recipe": json.dumps(formula_recipe)})
        must(r.status_code == 200, "/transform formula+groupBy")
        j = r.json()
        cols = j["columns"]
        must(any(c.startswith("Revenue_") for c in cols), "groupBy aggregate columns present")
    # Replace and lowercase checks
    replace_recipe = [
        {"type": "replaceValues", "config": {"columns": ["Type"], "to": "Debit", "value": "DR"}},
        {"type": "lowercaseText", "config": {"columns": ["Type"]}},
    ]
    with open(path_a, "rb") as f:
        r = requests.post(BASE + "/transform", files={"file": ("a.csv", f)}, data={"recipe": json.dumps(replace_recipe)})
        must(r.status_code == 200, "/transform replace+lowercase")
        j = r.json()
        types = [str(rw.get("Type","")) for rw in j["sample"]]
        must(any(t == "dr" for t in types), "replace+lowercase applied")
    print("SMOKE PASS")

if __name__ == "__main__":
    main()
