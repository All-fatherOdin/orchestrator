/** Diagnostic projection only: nested command results never become task acceptance evidence. */
export function commandEventDiagnostic(event: {
  type?: string;
  item?: {
    type?: string;
    id?: unknown;
    command?: unknown;
    cmd?: unknown;
    status?: unknown;
    exit_code?: unknown;
    aggregated_output?: unknown;
  };
}): string | undefined {
  const item = event.item;
  if (item?.type !== "command_execution") return undefined;
  const bound = (value: unknown, limit: number) => {
    if (typeof value !== "string") return "";
    if (value.length <= limit) return value;
    const half = Math.floor((limit - 5) / 2);
    return `${value.slice(0, half)} ... ${value.slice(-half)}`;
  };
  const id = bound(item.id, 80);
  const command = bound(item.command ?? item.cmd, 500) || "Команда выполняется";
  const terminal = event.type === "item.completed" || item.status === "completed" || item.status === "failed";
  const exit = Number.isInteger(item.exit_code) ? `exit ${item.exit_code}` : "exit code unavailable";
  const state = terminal ? `terminal; ${exit}` : "running; no terminal receipt";
  const output = bound(item.aggregated_output, 850);
  // Keep the complete projection below the executor's existing 1,600-character log cap.
  return `COMMAND: ${id ? `[${id}] ` : ""}${command} (${state})${output ? `\nOUTPUT: ${output}` : ""}`;
}
