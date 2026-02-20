import os
import argparse
import math
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from typing import Sequence


def _random_dates(n, start, end, rng):
    delta = (end - start).days + 1
    offs = rng.integers(0, delta, size=n)
    return [start + timedelta(days=int(x)) for x in offs]


def _gen_sales_frame(n, rng):
    order_ids = np.arange(1, n + 1)
    customers = np.array([f"CUST{str(i).zfill(5)}" for i in rng.integers(1, 4000, size=n)])
    products = np.array(rng.choice(["Widget A", "Widget B", "Widget C", "Gadget X", "Gadget Y"], size=n))
    categories = np.array(rng.choice(["Electronics", "Office", "Home", "Industrial"], size=n))
    regions = np.array(rng.choice(["North", "South", "East", "West"], size=n))
    qty = rng.integers(1, 20, size=n)
    unit_price = (rng.uniform(5.0, 500.0, size=n) * 100).round().astype(int) / 100.0
    gross = qty * unit_price
    discount_rate = rng.uniform(0.0, 0.1, size=n)
    discount = (gross * discount_rate * 100).round().astype(int) / 100.0
    tax_rate = rng.choice([0.0, 0.05, 0.12, 0.18], size=n, p=[0.2, 0.3, 0.3, 0.2])
    tax = ((gross - discount) * tax_rate * 100).round().astype(int) / 100.0
    revenue = ((gross - discount + tax) * 100).round().astype(int) / 100.0
    cogs = ((revenue * rng.uniform(0.55, 0.8, size=n)) * 100).round().astype(int) / 100.0
    expenses = ((revenue * rng.uniform(0.02, 0.08, size=n)) * 100).round().astype(int) / 100.0
    start = datetime(2023, 1, 1)
    end = datetime(2025, 12, 31)
    dates = _random_dates(n, start, end, rng)
    df = pd.DataFrame(
        {
            "Order ID": [f"ORD{str(i).zfill(8)}" for i in order_ids],
            "Date": [d.date().isoformat() for d in dates],
            "Customer ID": customers,
            "Product": products,
            "Category": categories,
            "Region": regions,
            "Quantity": qty,
            "Unit Price": unit_price,
            "Discount": discount,
            "Tax": tax,
            "Revenue": revenue,
            "COGS": cogs,
            "Expenses": expenses,
        }
    )
    return df


def generate_sales_csv(path: str, size_kb: int = 1000, seed: int = 42) -> str:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    rng = np.random.default_rng(seed)
    target = int(size_kb) * 1024
    n = 5000
    attempt = 0
    last_bytes = 0
    while True:
        df = _gen_sales_frame(n, rng)
        tmp = path + ".tmp"
        df.to_csv(tmp, index=False)
        sz = os.path.getsize(tmp)
        os.replace(tmp, path)
        if sz >= target * 0.98:  # within ~2% under target
            break
        if sz <= 0 or sz == last_bytes:
            n = n * 2
        else:
            ratio = target / sz
            n = int(math.ceil(n * ratio * 1.02))
        last_bytes = sz
        attempt += 1
        if attempt > 8:
            break
    return path


def generate_customer_lookup_csv(path: str, count: int = 3500, seed: int = 99) -> str:
    """
    Create a customer master/lookup CSV keyed by 'Customer ID' for joining with sales.
    Ensures overlap with sales generator domain (CUST00001..CUST03999).
    """
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    rng = np.random.default_rng(seed)
    ids = [f"CUST{str(i).zfill(5)}" for i in rng.choice(np.arange(1, 5000), size=count, replace=False)]
    segs = ["Consumer", "Corporate", "SMB", "Enterprise"]
    regs = ["North", "South", "East", "West"]
    tiers = ["Bronze", "Silver", "Gold", "Platinum"]
    df = pd.DataFrame(
        {
            "Customer ID": ids,
            "Customer Name": [f"Customer {i[-4:]}" for i in ids],
            "Segment": rng.choice(segs, size=count),
            "Region": rng.choice(regs, size=count),
            "Loyalty Tier": rng.choice(tiers, size=count, p=[0.45, 0.35, 0.15, 0.05]),
            "Signup Date": [d.date().isoformat() for d in _random_dates(count, datetime(2015, 1, 1), datetime(2024, 12, 31), rng)],
        }
    )
    df.to_csv(path, index=False)
    return path


def generate_product_master_csv(path: str) -> str:
    """
    Create a small product master for joining on 'Product'.
    """
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    data = [
        {"Product": "Widget A", "Category": "Electronics", "Unit Cost": 45.0, "Supplier": "Acme"},
        {"Product": "Widget B", "Category": "Electronics", "Unit Cost": 55.0, "Supplier": "Acme"},
        {"Product": "Widget C", "Category": "Office", "Unit Cost": 35.0, "Supplier": "Globex"},
        {"Product": "Gadget X", "Category": "Industrial", "Unit Cost": 120.0, "Supplier": "Initech"},
        {"Product": "Gadget Y", "Category": "Home", "Unit Cost": 85.0, "Supplier": "Umbrella"},
    ]
    pd.DataFrame(data).to_csv(path, index=False)
    return path


def csv_to_excel(in_csv: str, out_xlsx: str, sheet_name: str = "Data") -> str:
    """
    Convert a CSV file to a single-sheet Excel workbook.
    """
    os.makedirs(os.path.dirname(out_xlsx) or ".", exist_ok=True)
    df = pd.read_csv(in_csv)
    with pd.ExcelWriter(out_xlsx, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name)
    return out_xlsx


def main() -> None:
    os.makedirs("samples", exist_ok=True)
    parser = argparse.ArgumentParser()
    parser.add_argument("--sales", help="Output CSV path for generated sales data")
    parser.add_argument("--size-kb", type=int, default=0, help="Approximate CSV size in KB")
    parser.add_argument("--customers", help="Output CSV path for generated customer lookup")
    parser.add_argument("--products", help="Output CSV path for generated product master")
    parser.add_argument("--to-excel", nargs=2, metavar=("IN_CSV", "OUT_XLSX"), help="Convert CSV to XLSX")
    args = parser.parse_args()
    if args.sales and args.size_kb > 0:
        outp = generate_sales_csv(args.sales, size_kb=args.size_kb)
        print("Wrote:", outp)
        return
    if args.customers:
        outp = generate_customer_lookup_csv(args.customers)
        print("Wrote:", outp)
        return
    if args.products:
        outp = generate_product_master_csv(args.products)
        print("Wrote:", outp)
        return
    if args.to_excel:
        outp = csv_to_excel(args.to_excel[0], args.to_excel[1])
        print("Wrote:", outp)
        return

    main_df = pd.DataFrame(
        {
            "Date": ["2024-01-01", "2024-01-02", "2024-01-03"],
            "Account No": [101, 102, 103],
            "Revenue": [1000, 1500, 900],
            "COGS": [400, 700, 300],
            "Expenses": [100, 120, 80],
        }
    )
    lookup_df = pd.DataFrame(
        {
            "Account No": [101, 102, 104],
            "Account Name": ["Alpha Co", "Beta LLC", "Delta Inc"],
        }
    )

    main_path = os.path.join("samples", "input_main.xlsx")
    lookup_path = os.path.join("samples", "input_lookup.xlsx")
    output_path = os.path.join("samples", "output_example.xlsx")

    with pd.ExcelWriter(main_path, engine="openpyxl") as writer:
        main_df.to_excel(writer, index=False, sheet_name="Data")
    with pd.ExcelWriter(lookup_path, engine="openpyxl") as writer:
        lookup_df.to_excel(writer, index=False, sheet_name="Data")

    # Produce a simple expected output by merging and computing Net Profit
    out = main_df.merge(lookup_df, on="Account No", how="left", suffixes=("", "_j"))
    out["Net Profit"] = out["Revenue"] - out["COGS"] - out["Expenses"]
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        out.to_excel(writer, index=False, sheet_name="Result")

    print("Wrote:", main_path, lookup_path, output_path)


if __name__ == "__main__":
    main()
