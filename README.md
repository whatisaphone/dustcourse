## Development

In one window, run:

    gulp watch-website --dev

In another, run:

    cd build/website && node index.js

Restart the first command if it crashes. Restart the second whenever the server-side the code is modified.

## Building

    # Extract sprites (takes about 2 hours)
    ./level_machine/bin/Debug/level_machine extract-sprites "T:\Steam Library\steamapps\common\Dustforce\content\sprites"/*
    # Build levels (takes about 7 hours)
    ./level_machine/bin/Debug/level_machine render "T:\Steam Library\steamapps\common\Dustforce\content\levels2"/*

The reason these take so long is because they create between between tens of
thousands and millions of files. They spend most of their time inside the file
system driver. Optimization opportunities abound.
