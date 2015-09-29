#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail

REMOTE="$1"

rsync -azW $(dirname "$0")/../build/website/assets "$REMOTE":/srv/dustcourse/
