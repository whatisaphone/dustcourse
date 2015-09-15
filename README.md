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

## Deploying

To deploy the website:

    deploy/deploy.sh user@whatever.server.com

To update the game assets (several GB; best to do this overnight unless it's a tiny change):

    deploy/upload-assets.sh user@whatever.server.com

### Various notes

#### Stars

It took a little finagling to get stars looking similar to how they do in the game. It's
unimportant but also weird and fun so I may as well document it. The original stars are
colored, at their brightest, approximately rgb(240, 240, 210), and blended in screen mode.
PIXI's screen mode seems to give bad results, but luckily the stars are monochromatic
(other than alpha, of course), so screen mode can be simulated using normal blending.
First the original star sprites are edited and colorized to white (or, output levels set
to range 255-255). Then, the stars are drawn normally, but with the blue channel shaded
down to 210/240==7/8 strength. Bam, easy as it gets.
