import { useEffect, useMemo, useRef, useState } from "react";

type ProjectionItem = { projectId: string; entityId: string; data: Record<string, unknown> };
type ProjectionResponse = {
  sourceWatermarks: Array<{ projectId: string; sequence: number; hash: string | null }>;
  items: ProjectionItem[];
};
type AuditSelector =
  | { selectorType: "project-sequence-range"; projectId: string; fromSequence: number; toSequence: number }
  | { selectorType: "exact-change"; projectId: string; changeId: string };
type AuditBundle = {
  contractType: "AuditBundleV1";
  contractVersion: "1.0";
  selector: AuditSelector;
  source: { sourceRef: string; sourceWatermark: string; projectSequence: number; projectHash: string | null };
  sequenceBoundaries: Record<string, number | null>;
  canonicalEvents: Array<{ eventId: string; sequence: number; eventType: string; eventHash: string; changeId: string | null }>;
  entityReferences: Array<{ entityType: string; entityId: string; eventIds: string[] }>;
  receiptReferences: Array<{ receiptType: string; receiptId: string; eventId: string; eventHash: string }>;
  projectionSnapshots: Array<{ view: string; entityId: string; status: string | null; summary: Record<string, number> }>;
  completeness: { status: "complete" | "complete-with-warnings"; checks: Array<{ code: string; status: string; evidenceRefs: string[] }> };
  warnings: Array<{ code: string; message: string }>;
  privacy: { policyVersion: string; scanStatus: string; excludedFieldClasses: string[] };
  bundleHash: string;
};

export function auditBundleRequestPath(selector: AuditSelector, sourceWatermark?: string): string {
  const query = new URLSearchParams();
  if (selector.selectorType === "project-sequence-range") {
    query.set("fromSequence", String(selector.fromSequence));
    query.set("toSequence", String(selector.toSequence));
  }
  if (sourceWatermark) query.set("sourceWatermark", sourceWatermark);
  const base = `/api/audit-bundles/v1/projects/${encodeURIComponent(selector.projectId)}`;
  const path = selector.selectorType === "exact-change"
    ? `${base}/changes/${encodeURIComponent(selector.changeId)}`
    : base;
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function errorTitle(code: string): string {
  if (code === "SOURCE_WATERMARK_CHANGED") return "Evidence is stale";
  if (code === "PRIVACY_VIOLATION") return "Bundle rejected by privacy policy";
  if (code === "SOURCE_UNAVAILABLE" || code === "CHANGE_NOT_FOUND") return "Evidence is unavailable";
  if (code === "UNSUPPORTED_EVIDENCE") return "Evidence is unsupported";
  return "Audit bundle unavailable";
}

function short(value: string | null | undefined, length = 16): string {
  return value ? value.slice(0, length) : "genesis";
}

function tone(value: string): string {
  if (value === "passed" || value === "complete") return "success";
  if (value === "unsupported" || value.includes("warning")) return "warning";
  return "danger";
}

export function AuditBundlesDashboard() {
  const [projects, setProjects] = useState<ProjectionResponse["sourceWatermarks"]>([]);
  const [changes, setChanges] = useState<Array<{ projectId: string; changeId: string }>>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [mode, setMode] = useState<"range" | "change">("range");
  const [projectId, setProjectId] = useState("");
  const [changeKey, setChangeKey] = useState("");
  const [fromSequence, setFromSequence] = useState(1);
  const [toSequence, setToSequence] = useState(1);
  const [bundle, setBundle] = useState<AuditBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setSourcesLoading(true);
    Promise.all([
      fetch("/api/operator-projections/v1/overview?limit=25", { cache: "no-store" }),
      fetch("/api/operator-projections/v1/execution-bucket?limit=25", { cache: "no-store" }),
    ]).then(async ([overviewResponse, changesResponse]) => {
      if (!overviewResponse.ok || !changesResponse.ok) throw new Error("Phase 6 evidence sources are unavailable.");
      const [overview, changeProjection] = await Promise.all([
        overviewResponse.json() as Promise<ProjectionResponse>,
        changesResponse.json() as Promise<ProjectionResponse>,
      ]);
      if (requestId !== requestRef.current) return;
      const nextProjects = overview.sourceWatermarks;
      const seen = new Set<string>();
      const nextChanges = changeProjection.items.flatMap((item) => {
        const changeId = String(item.data.changeId ?? item.entityId ?? "");
        const key = `${item.projectId}\0${changeId}`;
        if (!changeId || seen.has(key)) return [];
        seen.add(key);
        return [{ projectId: item.projectId, changeId }];
      });
      setProjects(nextProjects);
      setChanges(nextChanges);
      if (nextProjects.length) {
        setProjectId((current) => current || nextProjects[0].projectId);
        setToSequence((current) => current === 1 ? Math.max(nextProjects[0].sequence, 1) : current);
      }
      if (nextChanges.length) setChangeKey((current) => current || `${nextChanges[0].projectId}\0${nextChanges[0].changeId}`);
      setError(null);
    }).catch((reason) => {
      if (requestId === requestRef.current) setError({ code: "SOURCE_UNAVAILABLE", message: reason instanceof Error ? reason.message : "Evidence sources are unavailable." });
    }).finally(() => {
      if (requestId === requestRef.current) setSourcesLoading(false);
    });
    return () => { requestRef.current += 1; };
  }, []);

  const selectedProject = projects.find((item) => item.projectId === projectId);
  const selectedChange = useMemo(() => {
    const [selectedProjectId = "", selectedChangeId = ""] = changeKey.split("\0");
    return { projectId: selectedProjectId, changeId: selectedChangeId };
  }, [changeKey]);
  const selector: AuditSelector | null = mode === "range"
    ? projectId && Number.isSafeInteger(fromSequence) && Number.isSafeInteger(toSequence) && fromSequence > 0 && toSequence >= fromSequence
      ? { selectorType: "project-sequence-range", projectId, fromSequence, toSequence }
      : null
    : selectedChange.projectId && selectedChange.changeId
      ? { selectorType: "exact-change", ...selectedChange }
      : null;

  async function loadBundle(useCurrentWatermark = false) {
    if (!selector) return;
    setLoading(true); setError(null);
    try {
      const watermark = useCurrentWatermark ? bundle?.source.sourceWatermark : undefined;
      const response = await fetch(auditBundleRequestPath(selector, watermark), { cache: "no-store" });
      const body = await response.json() as AuditBundle | { code?: string; error?: string };
      if (!response.ok) {
        const code = "code" in body && body.code ? body.code : "SOURCE_UNAVAILABLE";
        throw Object.assign(new Error("error" in body && body.error ? body.error : "Audit bundle request failed."), { code });
      }
      setBundle(body as AuditBundle);
    } catch (reason) {
      const value = reason as Error & { code?: string };
      setBundle(null);
      setError({ code: value.code ?? "SOURCE_UNAVAILABLE", message: value.message });
    } finally { setLoading(false); }
  }

  function downloadBundle() {
    if (!bundle) return;
    const json = JSON.stringify(bundle, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    const identity = bundle.selector.selectorType === "exact-change" ? bundle.selector.changeId : `${bundle.selector.fromSequence}-${bundle.selector.toSequence}`;
    link.download = `audit-bundle-${bundle.selector.projectId}-${identity}-${bundle.bundleHash.slice(0, 12)}.json`.replace(/[^a-zA-Z0-9._-]/g, "-");
    link.click();
    URL.revokeObjectURL(url);
  }

  function chooseProject(nextProjectId: string) {
    setProjectId(nextProjectId); setBundle(null); setError(null);
    const mark = projects.find((item) => item.projectId === nextProjectId);
    setFromSequence(1); setToSequence(Math.max(mark?.sequence ?? 1, 1));
  }

  if (sourcesLoading) return <div className="operatorLoading"><i /><span>Reading Phase 6 evidence sources…</span></div>;
  if (!projects.length) return <div className="operatorEmpty"><span aria-hidden="true">○</span><h3>No audit sources</h3><p>No validated project ledgers are available for a bounded audit bundle.</p></div>;

  return <div className="auditWorkspace">
    <section className="auditBuilder" aria-label="Audit bundle selector">
      <header><div><small>READ-ONLY EXPORT</small><h2>Build a bounded audit bundle</h2></div><span>No canonical writes</span></header>
      <div className="auditMode" role="group" aria-label="Audit selector type">
        <button className={mode === "range" ? "active" : ""} onClick={() => { setMode("range"); setBundle(null); setError(null); }}>Project range</button>
        <button className={mode === "change" ? "active" : ""} onClick={() => { setMode("change"); setBundle(null); setError(null); }}>Exact change</button>
      </div>
      {mode === "range" ? <div className="auditFields">
        <label>Project<select aria-label="Audit project" value={projectId} onChange={(event) => chooseProject(event.target.value)}>{projects.map((item) => <option key={item.projectId} value={item.projectId}>{item.projectId} · seq {item.sequence}</option>)}</select></label>
        <label>From sequence<input aria-label="From sequence" type="number" min="1" max={selectedProject?.sequence || 1} value={fromSequence} onChange={(event) => { setFromSequence(Number(event.target.value)); setBundle(null); }} /></label>
        <label>To sequence<input aria-label="To sequence" type="number" min={fromSequence} max={selectedProject?.sequence || 1} value={toSequence} onChange={(event) => { setToSequence(Number(event.target.value)); setBundle(null); }} /></label>
      </div> : <div className="auditFields exact">
        <label>Existing change<select aria-label="Audit change" value={changeKey} onChange={(event) => { setChangeKey(event.target.value); setBundle(null); setError(null); }}>{changes.map((item) => <option key={`${item.projectId}:${item.changeId}`} value={`${item.projectId}\0${item.changeId}`}>{item.projectId} / {item.changeId}</option>)}</select></label>
        {!changes.length ? <p className="auditInlineNotice">No exact changes are visible in the current bounded Phase 6 page.</p> : null}
      </div>}
      <footer><span>{mode === "range" ? `Canonical range · ${fromSequence}–${toSequence}` : "Exact change identity"}</span><button onClick={() => void loadBundle(false)} disabled={loading || !selector}>{loading ? "Generating…" : "Generate bundle"}</button></footer>
    </section>
    {error ? <section className="auditState error" role="alert"><small>{error.code}</small><h3>{errorTitle(error.code)}</h3><p>{error.message}</p><button onClick={() => void loadBundle(error.code === "SOURCE_WATERMARK_CHANGED")}>Retry from current evidence</button></section> : null}
    {bundle ? <section className="auditResult" aria-label="Audit bundle result">
      <header><div><small>{bundle.contractType} · {bundle.contractVersion}</small><h2>{bundle.selector.projectId}</h2></div><div className={`auditCompleteness ${bundle.completeness.status}`}><span>{bundle.completeness.status.replaceAll("-", " ")}</span><code>{short(bundle.bundleHash)}</code></div></header>
      <div className="auditSummary"><div><span>Source sequence</span><strong>{bundle.source.projectSequence}</strong></div><div><span>Events</span><strong>{bundle.canonicalEvents.length}</strong></div><div><span>Receipts</span><strong>{bundle.receiptReferences.length}</strong></div><div><span>Projections</span><strong>{bundle.projectionSnapshots.length}</strong></div><div><span>Watermark</span><code>{short(bundle.source.sourceWatermark)}</code></div></div>
      {bundle.warnings.length ? <div className="operatorWarnings">{bundle.warnings.map((warning) => <p key={`${warning.code}:${warning.message}`}><b>{warning.code.replaceAll("_", " ")}</b><span>bounded warning</span><small>{warning.message}</small></p>)}</div> : <div className="auditSafeState" role="status">Completeness checks passed with no warnings.</div>}
      <div className="auditEvidenceGrid"><article><h3>Sequence coverage</h3>{Object.entries(bundle.sequenceBoundaries).map(([key, value]) => <p key={key}><span>{key.replaceAll(/([A-Z])/g, " $1")}</span><strong>{value ?? "—"}</strong></p>)}</article><article><h3>Completeness</h3>{bundle.completeness.checks.map((check) => <p key={check.code}><span>{check.code.replaceAll("_", " ")}</span><strong className={tone(check.status)}>{check.status}</strong></p>)}</article><article><h3>Privacy</h3><p><span>Scan</span><strong className={tone(bundle.privacy.scanStatus)}>{bundle.privacy.scanStatus}</strong></p><p><span>Excluded classes</span><strong>{bundle.privacy.excludedFieldClasses.length}</strong></p><p><span>Policy</span><code>{bundle.privacy.policyVersion}</code></p></article></div>
      <div className="auditReferences"><header><h3>Event and receipt references</h3><span>Bounded response only</span></header>{bundle.canonicalEvents.slice(0, 25).map((event) => <p key={event.eventId}><code>#{event.sequence}</code><span>{event.eventType}</span><code>{short(event.eventHash, 12)}</code></p>)}{bundle.receiptReferences.slice(0, 25).map((receipt) => <p key={`${receipt.receiptType}:${receipt.receiptId}`}><code>receipt</code><span>{receipt.receiptType} · {receipt.receiptId}</span><code>{short(receipt.eventHash, 12)}</code></p>)}</div>
      <footer><button className="secondary" onClick={() => void loadBundle(true)} disabled={loading}>Verify current watermark</button><button onClick={downloadBundle}>Download bounded JSON</button></footer>
    </section> : !error ? <div className="operatorEmpty auditWaiting"><span aria-hidden="true">↓</span><h3>Bundle not generated</h3><p>Select bounded evidence above. Nothing is downloaded automatically.</p></div> : null}
  </div>;
}
