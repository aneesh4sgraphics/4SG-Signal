#!/bin/bash
set -e

# Install dependencies quietly to save time
npm install --prefer-offline --no-audit --no-fund

# Apply schema changes.
# db:push pulls current DB state and diffs against schema — fast when no changes needed,
# but can be slow (~20s) on large schemas when new columns are present.
# Run with a generous timeout to avoid false failures.
timeout 60 npm run db:push || {
  echo "db:push timed out or failed — will retry on next boot (server applies DDL at startup)"
  exit 0
}
