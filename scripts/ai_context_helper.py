"""Read-only Orchestrator context helper.

The interface and governance model are adapted for this repository from the
owner-provided Agent Memory Kit v3.8.0. This project-specific implementation is
deliberately small: it implements the read-set, api-context, and smoke-check
operations consumed by Orchestrator. It never writes project files, starts a
service, or creates a persistent index.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
from pathlib import Path
from typing import Any


INDEX_PATH = Path("docs/project_map/context_index.yaml")
SMOKE_PATH = Path("docs/project_map/eval_suite/context_selection_smoke_cases.yaml")
TRIGGERED_MODES = {"trigger_only", "secondary_memory_triggered"}
PRIORITY_ORDER = {"P0": 0, "P1": 1, "P2": 2}


def _load_json_yaml(path: Path) -> dict[str, Any]:
    """Load the profile's JSON-compatible YAML without third-party packages."""
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"required context file is missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"{path} must remain JSON-compatible YAML for the stdlib helper: {exc}"
        ) from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain an object")
    return value


def _normalize(path: str) -> str:
    return Path(path.replace("\\", "/")).as_posix().lstrip("./")


def _exists(root: Path, relative: str) -> bool:
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return candidate.is_file()


def _matches(path: str, pattern: str) -> bool:
    normalized = _normalize(path)
    normalized_pattern = _normalize(pattern)
    return fnmatch.fnmatch(normalized, normalized_pattern) or fnmatch.fnmatch(
        normalized.lower(), normalized_pattern.lower()
    )


def _index(root: Path) -> dict[str, Any]:
    return _load_json_yaml(root / INDEX_PATH)


def _known_profiles(index: dict[str, Any]) -> set[str]:
    profiles = index.get("task_profiles", {})
    if not isinstance(profiles, dict):
        raise ValueError("context index task_profiles must be an object")
    return {str(profile) for profile in profiles}


def _excluded_globs(index: dict[str, Any]) -> list[str]:
    excluded = index.get("excluded_by_default", {})
    if not isinstance(excluded, dict):
        return []
    globs = excluded.get("path_globs", [])
    return [str(item) for item in globs] if isinstance(globs, list) else []


def build_read_set(
    root: Path,
    *,
    profile: str,
    max_sources: int,
    include_triggered: bool = False,
) -> dict[str, Any]:
    root = root.resolve()
    index = _index(root)
    if profile not in _known_profiles(index):
        raise ValueError(f"unknown context profile: {profile}")
    if max_sources < 1:
        raise ValueError("max_sources must be positive")

    entries = index.get("entries", [])
    if not isinstance(entries, list):
        raise ValueError("context index entries must be a list")

    candidates: list[dict[str, str]] = []
    skipped_triggered: list[str] = []
    missing_indexed: list[str] = []
    for raw in entries:
        if not isinstance(raw, dict):
            raise ValueError("every context index entry must be an object")
        path = _normalize(str(raw.get("path", "")))
        profiles = raw.get("task_profiles", [])
        if profile not in profiles:
            continue
        mode = str(raw.get("default_retrieval_mode", "task_triggered"))
        if mode in TRIGGERED_MODES and not include_triggered:
            skipped_triggered.append(path)
            continue
        if not _exists(root, path):
            missing_indexed.append(path)
            continue
        source = {
            "path": path,
            "priority": str(raw.get("priority", "P2")),
            "authority": str(raw.get("authority", "unknown")),
            "status": str(raw.get("status", "unknown")),
            "layer": str(raw.get("layer", "unknown")),
            "retrieval_mode": mode,
            "inclusion_reason": f"profile={profile}; mode={mode}",
        }
        if not all(source.values()):
            raise ValueError(f"context index entry has incomplete metadata: {path}")
        candidates.append(source)

    candidates.sort(
        key=lambda item: (
            PRIORITY_ORDER.get(item["priority"], 99),
            item["path"].lower(),
        )
    )
    selected = candidates[:max_sources]
    omitted = len(candidates) - len(selected)
    high_risk = [
        {"path_glob": pattern, "reason": "excluded_by_default"}
        for pattern in _excluded_globs(index)
    ]
    return {
        "profile": profile,
        "read_set": selected,
        "selected_source_count": len(candidates),
        "omitted_source_count": omitted,
        "truncated": omitted > 0,
        "skipped_trigger_only_context": sorted(skipped_triggered),
        "skipped_high_risk_context": high_risk,
        "missing_indexed_paths": sorted(missing_indexed),
    }


def build_api_context(
    root: Path,
    *,
    request_id: str,
    task: str,
    profile: str,
    max_sources: int,
    mutation_scope: str,
    requested_tools: list[str],
) -> dict[str, Any]:
    if mutation_scope != "read-only":
        raise ValueError("api-context supports only read-only mutation_scope")
    selection = build_read_set(
        root, profile=profile, max_sources=max_sources, include_triggered=False
    )
    read_set = selection["read_set"]
    forbidden = [
        item["path_glob"] for item in selection["skipped_high_risk_context"]
    ]
    envelope = {
        "request_id": request_id,
        "task": task,
        "profile": profile,
        "max_sources": max_sources,
        "mutation_scope": mutation_scope,
        "requested_tools": requested_tools,
        "forbidden_paths": forbidden,
    }
    receipt = {
        "receipt_type": "api_agent_context_receipt",
        "request_id": request_id,
        "profile": profile,
        "read_set": read_set,
        "missing_indexed_paths": selection["missing_indexed_paths"],
    }
    return {
        "bundle_type": "api_agent_context_bundle",
        "request_id": request_id,
        "task": task,
        "profile": profile,
        "mutation_scope": "read-only",
        "runtime_scope_expanded": False,
        "broker_or_data_scope_expanded": False,
        "external_system_scope_expanded": False,
        "data_scope_expanded": False,
        "request_envelope": envelope,
        "read_set": read_set,
        "context": {"read_set": read_set},
        "receipt": receipt,
        "selected_source_count": selection["selected_source_count"],
        "omitted_source_count": selection["omitted_source_count"],
        "truncated": selection["truncated"],
        "skipped_trigger_only_context": selection[
            "skipped_trigger_only_context"
        ],
        "skipped_high_risk_context": selection["skipped_high_risk_context"],
    }


def run_smoke_checks(root: Path, case_ids: list[str]) -> dict[str, Any]:
    suite = _load_json_yaml(root.resolve() / SMOKE_PATH)
    cases = suite.get("cases", [])
    if not isinstance(cases, list):
        raise ValueError("smoke suite cases must be a list")
    requested = set(case_ids)
    results: list[dict[str, Any]] = []
    for case in cases:
        if not isinstance(case, dict):
            raise ValueError("every smoke case must be an object")
        case_id = str(case.get("id", ""))
        if requested and case_id not in requested:
            continue
        selection = build_read_set(
            root,
            profile=str(case["profile"]),
            max_sources=int(case.get("max_sources", 12)),
            include_triggered=bool(case.get("include_triggered", False)),
        )
        paths = {item["path"] for item in selection["read_set"]}
        required = {_normalize(str(item)) for item in case.get("required_paths", [])}
        forbidden = {
            _normalize(str(item)) for item in case.get("forbidden_paths", [])
        }
        missing = sorted(required - paths)
        selected_forbidden = sorted(forbidden & paths)
        results.append(
            {
                "id": case_id,
                "status": "passed"
                if not missing
                and not selected_forbidden
                and not selection["missing_indexed_paths"]
                else "failed",
                "missing_required_paths": missing,
                "selected_forbidden_paths": selected_forbidden,
                "missing_indexed_paths": selection["missing_indexed_paths"],
                "read_set": sorted(paths),
            }
        )
    if requested - {result["id"] for result in results}:
        unknown = sorted(requested - {result["id"] for result in results})
        raise ValueError(f"unknown smoke case(s): {', '.join(unknown)}")
    return {
        "suite_id": suite.get("suite_id", "unknown"),
        "status": "passed"
        if results and all(result["status"] == "passed" for result in results)
        else "failed",
        "runtime_service_started": False,
        "persistent_index_created": False,
        "cases": results,
    }


def _print(value: dict[str, Any], output_format: str) -> None:
    if output_format == "json":
        print(json.dumps(value, indent=2, ensure_ascii=False))
        return
    print(f"status: {value.get('status', 'ok')}")
    for item in value.get("read_set", []):
        print(f"- {item['path']} ({item['authority']})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    subparsers = parser.add_subparsers(dest="command", required=True)

    read_set = subparsers.add_parser("read-set")
    read_set.add_argument("--profile", required=True)
    read_set.add_argument("--max-sources", type=int, default=12)
    read_set.add_argument("--include-triggered", action="store_true")
    read_set.add_argument("--format", choices=("json", "markdown"), default="json")

    api_context = subparsers.add_parser("api-context")
    api_context.add_argument("--request-id", required=True)
    api_context.add_argument("--task", default="")
    api_context.add_argument("--profile", required=True)
    api_context.add_argument("--mutation-scope", default="read-only")
    api_context.add_argument("--max-sources", type=int, default=12)
    api_context.add_argument("--requested-tool", action="append", default=[])
    api_context.add_argument(
        "--format", choices=("json", "markdown"), default="json"
    )

    smoke = subparsers.add_parser("smoke-check")
    smoke.add_argument("--case", action="append", default=[])
    smoke.add_argument("--format", choices=("json", "markdown"), default="json")

    args = parser.parse_args()
    try:
        if args.command == "read-set":
            value = build_read_set(
                args.root,
                profile=args.profile,
                max_sources=args.max_sources,
                include_triggered=args.include_triggered,
            )
        elif args.command == "api-context":
            value = build_api_context(
                args.root,
                request_id=args.request_id,
                task=args.task,
                profile=args.profile,
                max_sources=args.max_sources,
                mutation_scope=args.mutation_scope,
                requested_tools=args.requested_tool,
            )
        else:
            value = run_smoke_checks(args.root, args.case)
    except ValueError as exc:
        parser.error(str(exc))
    _print(value, args.format)
    return 1 if value.get("status") == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
