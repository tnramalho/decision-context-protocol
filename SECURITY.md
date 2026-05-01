# Security Policy

## Reporting a vulnerability

If you discover a security issue, please do not open a public issue with exploit details.

Use a private disclosure channel with the maintainers when available.

If no private channel is published yet:

- open a public issue only for non-sensitive hardening suggestions
- avoid including secrets, tokens, repository names, or reproduction details that would put users at risk

## Scope

Areas that matter most for this project:

- credential handling
- repository write operations
- MCP transport exposure
- backend configuration
- accidental data leakage through context capture or logs

## Expectations

- Do not commit real credentials to test reports or pull requests.
- Prefer least-privilege GitHub credentials for testing.
- Treat repository contents handled by DCP as potentially sensitive project metadata.
