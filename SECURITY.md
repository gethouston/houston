# Security Policy

## Report a Vulnerability

Report suspected vulnerabilities privately through GitHub Security Advisories.
Open the repository's **Security** tab, select **Advisories**, then choose
**Report a vulnerability**. Do not open a public issue for a vulnerability.

We will acknowledge every report and follow up as we assess its impact and next
steps.

## Scope

Security reports may cover the Houston desktop app, `packages/host`,
`packages/runtime`, and the self-host Docker image.

A self-hosted Houston server is single-user. `HOUSTON_HOST_TOKEN` is the bearer
credential that gates every route with access to user data or agents. Never
share it, commit it, or include it in logs or issue reports.
