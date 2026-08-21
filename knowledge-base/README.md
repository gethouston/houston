# Knowledge base

Audits and inventories that are true of the code at the commit they were
written, but too wide to live in one module's comments. Every row cites the
module that makes it true; when the code and a row disagree, the code wins and
the row is stale. Re-run the audit, do not patch the table from memory.

| Folder | What it answers |
|---|---|
| [`houston-folder/`](houston-folder/README.md) | For every file in an agent's workspace: where the truth lives, what a pool worker hydrates and writes back, what is projected to a Postgres doc, what the gateway serves while the agent sleeps, and where two copies can disagree |
