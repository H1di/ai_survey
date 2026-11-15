#!/usr/bin/env bash
# Applies the migrations to a throwaway Postgres container and runs the RLS
# proof. Needs only docker. Usage: supabase/tests/run-rls.sh
set -euo pipefail

dir="$(cd "$(dirname "$0")/.." && pwd)"
name="lifepath-rls-test-$$"

docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=test postgres:17-alpine >/dev/null
trap 'docker stop "$name" >/dev/null' EXIT

# The image's init runs a temporary server on the unix socket only, then
# restarts. Probing over TCP passes only once the final server is up; a socket
# probe (even a real query) can pass against the temporary one and then lose it.
until docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -q; do sleep 0.5; done

run() { docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

run < "$dir/tests/supabase-stub.sql"
for migration in "$dir"/migrations/*.sql; do
  run < "$migration"
done
run < "$dir/tests/rls.test.sql"
