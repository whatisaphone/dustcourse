## Deploy assets

```sh
./deploy-assets.sh
```

Note there are ~3GB of assets, so it might take a bit.

## Build server image

```sh
./build.sh <tag>
```

To test the image locally:

```sh
docker run -p 3000:3000 dustcourse:<tag>
```

