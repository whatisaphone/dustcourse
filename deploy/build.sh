#!/usr/bin/env bash

set -euo pipefail

here=$(dirname "$0")
tag=$1

repo=registry.gitlab.com/whatisaphone/dustcourse
image=${repo}:${tag}

pnpm gulp build-website --assetsRoot https://assets.dustcourse.com 

docker build "${here}/.." -f deploy/Dockerfile -t "${image}"
docker push "${image}"
