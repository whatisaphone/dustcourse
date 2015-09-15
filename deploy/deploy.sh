#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

REMOTE="$1"

gulp build-website

rsync -az $(dirname "$0")/../package.json "$REMOTE":/srv/dustcourse/
rsync -az $(dirname "$0")/../build/website/{static,views,*.js} "$REMOTE":/srv/dustcourse/

ssh "$REMOTE" <<\EOSH
    cd /srv/dustcourse
    PORT=80 node_modules/.bin/pm2 restart index.js
EOSH
