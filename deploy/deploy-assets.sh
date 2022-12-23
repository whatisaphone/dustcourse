#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

# Janky run with `dlx` since netlify-cli doesn't support this ancient Node version.
pnpm -C / --package netlify-cli dlx \
    netlify deploy \
    --site 10be0d2c-e3be-4ee3-afc8-580baea6d694 \
    --prod
