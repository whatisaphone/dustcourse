## Development

In one window, run:

    gulp watch-website --dev

In another, run:

    cd build/website && node index.js

Restart the first command if it crashes. Restart the second whenever the server-side the code is modified.

## Building

    # Extract sprites
    ./level_machine/bin/Debug/level_machine extract-sprites "T:\Steam Library\steamapps\common\Dustforce\content\sprites\*"
    # Build levels
    ./level_machine/bin/Debug/level_machine render "T:\Steam Library\steamapps\common\Dustforce\content\levels2\*"
