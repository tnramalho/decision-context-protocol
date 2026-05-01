# Contributing

Thanks for contributing to DCP.

## Before you start

- Open an issue for bugs, design changes, or new features when the change is non-trivial.
- Keep the MVP scope in mind. DCP is intentionally narrow.
- Prefer small pull requests with one clear purpose.

## Development setup

```bash
npm install
npm run check
npm run build
```

For local development:

```bash
npm run dev
```

For local HTTP testing:

```bash
npm run dev:http
npm run test:http
```

## Project principles

- Repository-backed shared context, not chat history
- Snapshot-first loading
- Append-only capture by default
- Explicit consolidation
- Human-confirmed decisions
- One active repository per session

## Pull request guidelines

- Keep changes focused.
- Update documentation when behavior changes.
- Add or adjust validation when introducing new input shapes.
- Do not expand context loading in ways that break the token budget model.
- Preserve backend portability when possible.

## Code expectations

- TypeScript only
- Prefer simple, explicit code over abstraction-heavy designs
- Validate external inputs
- Keep repository backends isolated behind the shared interface

## Suggested workflow

1. Fork the repository.
2. Create a branch for your change.
3. Run `npm run check`.
4. Run `npm run build`.
5. Open a pull request with a concise explanation.

## Documentation

If you add a tool, backend, or user-facing behavior, update:

- `README.md`
- `.env.example` when config changes
- templates under `templates/` when DCP structure changes
