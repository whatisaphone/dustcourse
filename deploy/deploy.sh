#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

REMOTE="$1"

echo "************ PRESS CTRL+C ONCE THE SERVER STARTS LISTENING ******************"
echo "****************** IT'S OKAY, IT WILL KEEP LISTENING ************************"

gulp build-website

rsync -az $(dirname "$0")/../package.json "$REMOTE":/srv/dustcourse/
rsync -az $(dirname "$0")/../build/website/{static,views,index.js} "$REMOTE":/srv/dustcourse/

ssh "$REMOTE" <<\EOSH
    killall node
    cd /srv/dustcourse
    PORT=80 nohup node index.js &
EOSH
