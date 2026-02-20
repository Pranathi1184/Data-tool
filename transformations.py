from __future__ import annotations

from dataclasses import dataclass
from functools import reduce
import re
from typing import Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class EngineConfig:
    """
    Immutable configuration for TransformationEngine defaults.

    Attributes:
        revenue_col: Default column name for Revenue.
        cogs_col: Default column name for Cost of Goods Sold.
        expenses_col: Default column name for Expenses.
        type_col: Default column name for transaction type (Debit/Credit).
        date_col: Default column name for transaction date.
    """
    revenue_col: str = "Revenue"
    cogs_col: str = "COGS"
    expenses_col: str = "Expenses"
    type_col: str = "Type"
    date_col: str = "Date"


class TransformationEngine:
    """
    A modular engine providing data cleanup, accounting logic, and cross-file transformations.

    Methods are pure with respect to the input DataFrame: they return a new DataFrame
    by default unless noted otherwise. Most methods accept column overrides for flexibility.
    """

    def __init__(self, config: Optional[EngineConfig] = None) -> None:
        """
        Initialize a TransformationEngine with optional defaults.

        Args:
            config: Optional EngineConfig with default column names.
        """
        self.config = config or EngineConfig()

    # ------------------------
    # Data Storage Cleanup
    # ------------------------
    @staticmethod
    def trim_whitespace(df: pd.DataFrame, columns: Optional[Sequence[str]] = None) -> pd.DataFrame:
        """
        Trim leading/trailing whitespace from object/string columns.

        Args:
            df: Input DataFrame.
            columns: Optional subset of columns to trim. Defaults to all object columns.

        Returns:
            A new DataFrame with whitespace trimmed on selected columns.
        """
        result = df.copy()
        target_cols = list(columns) if columns else [c for c in result.columns if pd.api.types.is_object_dtype(result[c])]
        for col in target_cols:
            result[col] = result[col].astype("string").str.strip()
        return result

    @staticmethod
    def lowercase_text(df: pd.DataFrame, columns: Sequence[str]) -> pd.DataFrame:
        """
        Lowercase text in selected columns.

        Args:
            df: Input DataFrame.
            columns: Columns whose string values should be lowercased.

        Returns:
            A new DataFrame with the specified columns lowercased.
        """
        result = df.copy()
        for col in columns:
            result[col] = result[col].astype("string").str.lower()
        return result

    @staticmethod
    def remove_symbols(
        df: pd.DataFrame,
        columns: Sequence[str],
        keep_chars: str = r"0-9A-Za-z\s\.\-\_\/",
    ) -> pd.DataFrame:
        """
        Remove non-alphanumeric symbols from selected columns using a regex whitelist.

        Args:
            df: Input DataFrame.
            columns: Columns to sanitize.
            keep_chars: Character class to keep (regex class content). All others are removed.

        Returns:
            A new DataFrame with symbols removed in specified columns.
        """
        pattern = re.compile(fr"[^{keep_chars}]")
        result = df.copy()
        for col in columns:
            result[col] = result[col].astype("string").str.replace(pattern, "", regex=True)
        return result

    @staticmethod
    def replace_values(
        df: pd.DataFrame,
        columns: Sequence[str],
        to_replace,
        value,
        regex: bool = False,
        case_sensitive: bool = True,
    ) -> pd.DataFrame:
        """
        Replace values in specified columns. Supports exact or regex replacement.
        """
        res = df.copy()
        for col in columns:
            if regex:
                res[col] = res[col].astype("string").str.replace(
                    str(to_replace),
                    str(value),
                    regex=True,
                    case=case_sensitive,
                )
            else:
                if case_sensitive and isinstance(to_replace, str):
                    res[col] = res[col].astype("string").replace(to_replace, value)
                elif isinstance(to_replace, str):
                    s = res[col].astype("string")
                    mask = s.str.lower() == to_replace.lower()
                    res[col] = s.where(~mask, str(value))
                else:
                    res[col] = res[col].replace(to_replace, value)
        return res

    @staticmethod
    def delete_blank_rows(df: pd.DataFrame, subset: Optional[Sequence[str]] = None) -> pd.DataFrame:
        """
        Delete rows that are entirely blank (or blank in a subset).

        Args:
            df: Input DataFrame.
            subset: Optional subset of columns to consider. If None, uses all columns.

        Returns:
            A new DataFrame with blank rows removed.
        """
        result = df.copy()
        if subset:
            mask = result[list(subset)].replace(r"^\s*$", np.nan, regex=True).notna().any(axis=1)
            return result.loc[mask].reset_index(drop=True)
        return result.dropna(how="all").reset_index(drop=True)

    @staticmethod
    def drop_duplicates(df: pd.DataFrame, subset: Optional[Sequence[str]] = None, keep: str = "first") -> pd.DataFrame:
        """
        Drop duplicate rows from a DataFrame.

        Args:
            df: Input DataFrame.
            subset: Optional subset of columns to consider for identifying duplicates.
            keep: Which duplicates to keep: 'first', 'last', or False for dropping all duplicates.

        Returns:
            A new DataFrame with duplicates removed.
        """
        return df.drop_duplicates(subset=list(subset) if subset else None, keep=keep).reset_index(drop=True)

    # ------------------------
    # Accounting Logic
    # ------------------------
    def calculate_gross_profit(
        self,
        df: pd.DataFrame,
        revenue_col: Optional[str] = None,
        cogs_col: Optional[str] = None,
        output_col: str = "Gross Profit",
    ) -> pd.DataFrame:
        """
        Calculate Gross Profit = Revenue - COGS.

        Args:
            df: Input DataFrame.
            revenue_col: Column name for revenue. Defaults to engine config.
            cogs_col: Column name for COGS. Defaults to engine config.
            output_col: Column name for the gross profit result.

        Returns:
            A new DataFrame with the gross profit column added.
        """
        rev = revenue_col or self.config.revenue_col
        cogs = cogs_col or self.config.cogs_col
        result = df.copy()
        result[output_col] = pd.to_numeric(result[rev], errors="coerce").fillna(0) - pd.to_numeric(result[cogs], errors="coerce").fillna(0)
        return result

    def calculate_net_profit(
        self,
        df: pd.DataFrame,
        revenue_col: Optional[str] = None,
        cogs_col: Optional[str] = None,
        expenses_col: Optional[str] = None,
        output_col: str = "Net Profit",
    ) -> pd.DataFrame:
        """
        Calculate Net Profit.

        By default uses Revenue - COGS - Expenses if an expenses column is provided
        (either via argument or engine config). If no expenses column is available,
        falls back to Revenue - COGS.

        Args:
            df: Input DataFrame.
            revenue_col: Column name for revenue. Defaults to engine config.
            cogs_col: Column name for COGS. Defaults to engine config.
            expenses_col: Column name for Expenses. Defaults to engine config.
            output_col: Column name for the net profit result.

        Returns:
            A new DataFrame with the net profit column added.
        """
        rev = revenue_col or self.config.revenue_col
        cogs = cogs_col or self.config.cogs_col
        exp = expenses_col if expenses_col is not None else self.config.expenses_col
        result = df.copy()
        rev_v = pd.to_numeric(result[rev], errors="coerce").fillna(0)
        cogs_v = pd.to_numeric(result[cogs], errors="coerce").fillna(0)
        if exp in result.columns:
            exp_v = pd.to_numeric(result[exp], errors="coerce").fillna(0)
            result[output_col] = rev_v - cogs_v - exp_v
        else:
            result[output_col] = rev_v - cogs_v
        return result

    def standardize_date(self, df: pd.DataFrame, date_cols: Optional[Sequence[str]] = None) -> pd.DataFrame:
        """
        Parse and standardize one or more date columns to pandas datetime.

        Args:
            df: Input DataFrame.
            date_cols: Optional sequence of date columns. Defaults to the engine's default date_col if present.

        Returns:
            A new DataFrame with parsed datetime columns.
        """
        result = df.copy()
        targets = list(date_cols) if date_cols else [self.config.date_col] if self.config.date_col in result.columns else []
        for col in targets:
            result[col] = pd.to_datetime(result[col], errors="coerce")
        return result

    def aggregate_pl_by_period(
        self,
        df: pd.DataFrame,
        date_col: Optional[str] = None,
        freq: str = "M",
        revenue_col: Optional[str] = None,
        cogs_col: Optional[str] = None,
        expenses_col: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Aggregate P&L by calendar period (Monthly 'M' or Quarterly 'Q').

        Args:
            df: Input DataFrame containing at least date and P&L columns.
            date_col: Name of the transaction date column. Defaults to engine config.
            freq: 'M' for monthly or 'Q' for quarterly aggregation.
            revenue_col: Column name for revenue. Defaults to engine config.
            cogs_col: Column name for COGS. Defaults to engine config.
            expenses_col: Column name for Expenses. Defaults to engine config if present.

        Returns:
            A DataFrame aggregated by period with Revenue, COGS, Expenses (if present),
            Gross Profit, and Net Profit.
        """
        dcol = date_col or self.config.date_col
        rev = revenue_col or self.config.revenue_col
        cogs = cogs_col or self.config.cogs_col
        exp = expenses_col if expenses_col is not None else self.config.expenses_col

        tmp = self.standardize_date(df, [dcol])
        if dcol not in tmp.columns:
            raise ValueError(f"Date column '{dcol}' not found")
        tmp = tmp.copy()
        if not pd.api.types.is_datetime64_any_dtype(tmp[dcol]):
            tmp[dcol] = pd.to_datetime(tmp[dcol], errors="coerce")
        tmp["__period__"] = tmp[dcol].dt.to_period(freq).dt.to_timestamp()

        sum_cols = [rev, cogs] + ([exp] if exp in tmp.columns else [])
        agg_map = {c: "sum" for c in sum_cols if c in tmp.columns}
        grouped = tmp.groupby("__period__", dropna=False).agg(agg_map).reset_index()
        grouped.rename(columns={"__period__": "Period"}, inplace=True)

        grouped = self.calculate_gross_profit(grouped, revenue_col=rev, cogs_col=cogs)
        grouped = self.calculate_net_profit(grouped, revenue_col=rev, cogs_col=cogs, expenses_col=exp)
        return grouped

    @staticmethod
    def filter_expr(
        df: pd.DataFrame,
        expr: str,
    ) -> pd.DataFrame:
        """
        Filter rows using a pandas query expression with backtick-escaped column names for spaces.
        """
        result = df.query(expr, engine="python")
        return result.reset_index(drop=True)

    @staticmethod
    def add_column_formula(
        df: pd.DataFrame,
        dest_col: str,
        expr: str,
    ) -> pd.DataFrame:
        """
        Add a calculated column from an expression evaluated with pandas.eval/query semantics.
        Use backticks around column names that contain spaces.
        """
        result = df.copy()
        series = result.eval(expr, engine="python")
        result[dest_col] = series
        return result

    @staticmethod
    def group_by_aggregate(
        df: pd.DataFrame,
        by: Sequence[str],
        aggs: dict,
        dropna: bool = False,
    ) -> pd.DataFrame:
        """
        Group by columns and aggregate with a dict like {'Revenue':['sum','max'], 'COGS':['min']}.
        """
        grouped = df.groupby(list(by), dropna=dropna).agg(aggs).reset_index()
        if isinstance(grouped.columns, pd.MultiIndex):
            grouped.columns = ["_".join([p for p in tup if p]) for tup in grouped.columns.to_flat_index()]
        else:
            grouped.columns = [str(c) for c in grouped.columns]
        return grouped

    @staticmethod
    def filter_by_transaction_type(
        df: pd.DataFrame,
        type_col: str = "Type",
        include: Optional[Iterable[str]] = None,
    ) -> pd.DataFrame:
        """
        Filter rows by transaction type (e.g., 'Debit'/'Credit').

        Args:
            df: Input DataFrame.
            type_col: Column name containing transaction type labels.
            include: Iterable of allowed types. If None, returns rows where type is not null.

        Returns:
            A filtered DataFrame matching the selected transaction types.
        """
        result = df.copy()
        if include is None:
            return result[result[type_col].notna()].reset_index(drop=True)
        allowed = {str(v).strip().lower() for v in include}
        return result[result[type_col].astype("string").str.strip().str.lower().isin(allowed)].reset_index(drop=True)

    # ------------------------
    # Manual Task Automation
    # ------------------------
    @staticmethod
    def split_combined_field(
        df: pd.DataFrame,
        source_col: str,
        into_cols: Tuple[str, ...],
        delimiter: str,
        maxsplit: int = -1,
        strip_parts: bool = True,
    ) -> pd.DataFrame:
        """
        Split a combined text field into multiple columns.

        Args:
            df: Input DataFrame.
            source_col: Column to split.
            into_cols: Destination column names for split parts (length defines number of parts).
            delimiter: Delimiter or regex used for splitting.
            maxsplit: Maximum number of splits (-1 means all).
            strip_parts: Whether to strip whitespace from resulting parts.

        Returns:
            A new DataFrame containing the new columns and original data.
        """
        result = df.copy()
        parts = result[source_col].astype("string").str.split(delimiter, n=maxsplit, regex=True, expand=True)
        for idx, name in enumerate(into_cols):
            col_vals = parts[idx] if idx in parts.columns else None
            if strip_parts and col_vals is not None:
                col_vals = col_vals.astype("string").str.strip()
            result[name] = col_vals
        return result

    @staticmethod
    def merge_columns(
        df: pd.DataFrame,
        columns: Sequence[str],
        dest_col: str,
        sep: str = " ",
        drop_source: bool = False,
    ) -> pd.DataFrame:
        """
        Merge multiple columns into a single text column with a separator.

        Args:
            df: Input DataFrame.
            columns: Columns to merge in order.
            dest_col: Name of the destination column.
            sep: Separator to use between non-null parts.
            drop_source: Whether to drop the source columns after merge.

        Returns:
            A new DataFrame with the merged column.
        """
        result = df.copy()
        merged = (
            result[columns]
            .astype("string")
            .apply(lambda row: sep.join([p for p in row if p not in (None, "", "nan")]).strip(), axis=1)
        )
        result[dest_col] = merged.replace("", np.nan)
        if drop_source:
            result = result.drop(columns=list(columns))
        return result

    @staticmethod
    def currency_to_float(df: pd.DataFrame, columns: Sequence[str]) -> pd.DataFrame:
        """
        Convert text-based currency (e.g., '$1,200' or '(1,200)') to numeric floats.

        Args:
            df: Input DataFrame.
            columns: Currency columns to convert.

        Returns:
            A new DataFrame with converted float values (NaN where conversion fails).
        """
        def _parse_currency(x: object) -> float:
            if pd.isna(x):
                return np.nan
            s = str(x).strip()
            if s == "":
                return np.nan
            negative = False
            if s.startswith("(") and s.endswith(")"):
                negative = True
                s = s[1:-1]
            s = re.sub(r"[^\d\.\-]", "", s)
            try:
                val = float(s) if s != "" and s not in ("-",) else np.nan
                return -val if negative and not np.isnan(val) else val
            except Exception:
                return np.nan

        result = df.copy()
        for col in columns:
            result[col] = result[col].apply(_parse_currency)
        return result

    # ------------------------
    # Quality & Validation
    # ------------------------
    @staticmethod
    def detect_outliers_iqr(
        df: pd.DataFrame,
        columns: Sequence[str],
        k: float = 1.5,
        mark_col_prefix: str = "Outlier_",
    ) -> pd.DataFrame:
        """
        Flag outliers using IQR for the specified numeric columns.

        Args:
            df: Input DataFrame.
            columns: Numeric columns to evaluate.
            k: IQR multiplier; 1.5 is typical.
            mark_col_prefix: Prefix for boolean outlier flag columns.

        Returns:
            A new DataFrame with boolean outlier columns added.
        """
        res = df.copy()
        for col in columns:
            series = pd.to_numeric(res[col], errors="coerce")
            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1
            lower = q1 - k * iqr
            upper = q3 + k * iqr
            res[f"{mark_col_prefix}{col}"] = (series < lower) | (series > upper)
        return res

    @staticmethod
    def validate_regex(
        df: pd.DataFrame,
        column: str,
        pattern: str,
        mark_col: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Validate a column against a regex pattern and add a boolean mark column.

        Args:
            df: Input DataFrame.
            column: Column to validate.
            pattern: Regular expression.
            mark_col: Optional destination column name. Defaults to 'Valid_<column>'.

        Returns:
            A new DataFrame with the validation results.
        """
        mark = mark_col or f"Valid_{column}"
        res = df.copy()
        regex = re.compile(pattern)
        res[mark] = res[column].astype("string").apply(lambda v: bool(regex.fullmatch(v.strip())) if isinstance(v, str) else False)
        return res

    # ------------------------
    # Cross-File Logic
    # ------------------------
    @staticmethod
    def join_on_common_columns(
        dfs: Sequence[pd.DataFrame],
        on: Optional[Sequence[str]] = None,
        how: str = "outer",
        suffixes: Tuple[str, str] = ("_x", "_y"),
    ) -> pd.DataFrame:
        """
        Join multiple DataFrames on common columns (VLOOKUP-style).

        Args:
            dfs: Sequence of DataFrames to join. Order determines merge sequence.
            on: Columns to join on. If None, uses intersection of all DataFrame columns.
            how: Merge strategy ('left', 'right', 'inner', 'outer').
            suffixes: Suffixes for overlapping non-key columns during merges.

        Returns:
            A single merged DataFrame.
        """
        if not dfs:
            return pd.DataFrame()
        if on is None:
            common = set(dfs[0].columns)
            for d in dfs[1:]:
                common &= set(d.columns)
            keys = sorted(list(common))
        else:
            keys = list(on)
        if not keys:
            raise ValueError("No common columns available to join on")
        return reduce(lambda left, right: pd.merge(left, right, on=keys, how=how, suffixes=suffixes), dfs)

    @staticmethod
    def consolidate_month_end(
        dfs: Sequence[pd.DataFrame],
        date_col: str,
        add_period_col: bool = True,
        period_col: str = "Period",
        freq: str = "M",
    ) -> pd.DataFrame:
        """
        Consolidate multiple month-end DataFrames into a single sheet.

        Args:
            dfs: Sequence of DataFrames with a date column.
            date_col: Column name representing transaction date.
            add_period_col: Whether to add a normalized period column.
            period_col: Name of the period column to add.
            freq: Period frequency, 'M' for month-end or 'Q' for quarter-end.

        Returns:
            A concatenated and chronologically sorted DataFrame.
        """
        if not dfs:
            return pd.DataFrame()
        frames: List[pd.DataFrame] = []
        for d in dfs:
            tmp = d.copy()
            tmp[date_col] = pd.to_datetime(tmp[date_col], errors="coerce")
            if add_period_col:
                tmp[period_col] = tmp[date_col].dt.to_period(freq).dt.to_timestamp()
            frames.append(tmp)
        combined = pd.concat(frames, ignore_index=True)
        if add_period_col:
            combined = combined.sort_values(by=[period_col, date_col], na_position="last").reset_index(drop=True)
        else:
            combined = combined.sort_values(by=[date_col], na_position="last").reset_index(drop=True)
        return combined
