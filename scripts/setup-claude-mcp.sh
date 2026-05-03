#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_NAME="${1:-dcp}"

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code CLI nao encontrado no PATH. Instale o Claude Code antes de continuar." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nao encontrado no PATH." >&2
  exit 1
fi

if [ ! -f "${ROOT_DIR}/dist/index.js" ]; then
  echo "Build nao encontrado. Rodando npm run build..." >&2
  (cd "${ROOT_DIR}" && npm run build)
fi

claude mcp remove "${SERVER_NAME}" >/dev/null 2>&1 || true
claude mcp add --transport stdio --scope local "${SERVER_NAME}" -- node "${ROOT_DIR}/dist/index.js"

cat <<EOF
Servidor MCP registrado no Claude Code com nome: ${SERVER_NAME}

Proximos passos:
1. Entre na pasta do projeto:
   cd "${ROOT_DIR}"
2. Se quiser GitHub API, exporte seu token:
   export GITHUB_TOKEN=seu_token
3. Abra o Claude Code nesta pasta:
   claude
4. Dentro do Claude, rode:
   /mcp
EOF
