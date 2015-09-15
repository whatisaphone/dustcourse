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
    echo "************ PRESS CTRL+C ONCE THE SERVER STARTS LISTENING ******************"
    echo "****************** IT'S OKAY, IT WILL KEEP LISTENING ************************"
    killall node
    PORT=80 nohup node index.js &
EOSH
