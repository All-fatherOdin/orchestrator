# Orchestrator

Local task queue for Codex CLI. It runs tasks **sequentially**, each in a fresh `codex exec --ephemeral` session, while the browser dashboard shows live progress.

## Quick start

```powershell
npm install
npm run dev
```

Open `http://localhost:4317`, select a target repository and upload or paste a YAML queue. For a production-like local run:

```powershell
npm run build
npm start
```

The target repository's `AGENTS.md` and `.codex/config.toml` remain the source of truth: each CLI process is launched with that repository as its working directory.

## Task format

See [tasks.example.yaml](tasks.example.yaml). Models are intentionally restricted to `luna`, `terra`, and `sol`; effort is `light`, `medium`, or `high`. The MVP refuses `sol` with `high` effort to control spend.

Run history and logs are written to `.orchestrator/runs/` beside this repository. No commits are made automatically.

## Codex CLI on Windows

The runner automatically prefers the Codex Desktop CLI matching the installed app. To select another binary, set `CODEX_BIN` to its absolute path before starting the orchestrator.
