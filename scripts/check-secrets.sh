#!/usr/bin/env bash
# Fails if staged changes (or, with --all, tracked files) look like they contain secrets.
set -u
cd "$(git rev-parse --show-toplevel)"
fail=0

if [ "${1:-}" = "--all" ]; then
  files=$(git ls-files)
else
  files=$(git diff --cached --name-only --diff-filter=ACM)
fi

# Forbidden file names
for f in $files; do
  case "$f" in
    .dev.vars|.env|.env.*) echo "BLOCKED: secret file staged: $f"; fail=1 ;;
  esac
done

# Secret-looking content. Pattern list kept generic; no real key is ever stored here.
pat='(Bearer[[:space:]]+[A-Za-z0-9_\-\.]{20,}|CLOCKED_API_KEY[[:space:]]*=[[:space:]]*[A-Za-z0-9_.-]{12,}|(^|[^A-Za-z0-9])(sk|pk|ck|clk)[-_][A-Za-z0-9_\-]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
for f in $files; do
  [ -f "$f" ] || continue
  [ "$f" = "scripts/check-secrets.sh" ] && continue
  if [ "${1:-}" = "--all" ]; then
    hits=$(grep -InE "$pat" -- "$f" 2>/dev/null)
  else
    hits=$(git show ":$f" 2>/dev/null | grep -InE "$pat")
  fi
  if [ -n "$hits" ]; then
    echo "BLOCKED: possible secret in $f (content hidden)"; fail=1
  fi
done

[ $fail -eq 0 ] && echo "check-secrets: OK" || echo "check-secrets: FAILED"
exit $fail
