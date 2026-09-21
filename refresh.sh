#!/usr/bin/env bash
# Keep the deployed agent-trust demo current.
#
# Judging runs to 2026-11-03 and Dynamic's bounty requires an app judges can actually use, so a
# service whose numbers froze on the day we shipped is a weakness a judge can see. The catch-up is
# cheap: the store records the block it covered, so a rerun asks only for what happened since
# (0.1 s on the run that motivated this script, against ~120 s for a full backfill).
#
# Order matters: index first, then provenance off that index, then the picture off that provenance.
# The API is restarted last because it loads the data files at boot, and the page's farm.json is
# copied only when it actually changed, so an unchanged day touches nothing under /var/www.
set -euo pipefail

cd /home/solana/metropolis-agent-trust

node src/index-erc8004.mjs
node src/score.mjs
node src/farm-map.mjs

SRC=web/public/farm.json
DST=/var/www/proofline-public/monad/agent-trust/farm.json
if ! cmp -s "$SRC" "$DST"; then
    sudo -n install -o www-data -g www-data -m 644 "$SRC" "$DST"
    echo "farm.json обновлён на сайте"
else
    echo "farm.json без изменений"
fi

sudo -n systemctl restart monad-agent-trust

# Fail loudly if the restart did not produce a service that answers, otherwise a broken refresh
# would look identical to a quiet one in the journal.
sleep 3
curl -fsS --max-time 20 http://127.0.0.1:8460/health \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("indexedAt", d["indexedAt"], "| registrations", d["totals"]["registrations"])'
