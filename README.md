# Dustcourse

Dustcourse is an online viewer for Dustforce levels and replays. It lives on its own site at https://dustcourse.com/, and is also linked from Dustkid replay pages such as [this one](http://dustkid.com/replay/8866052) (click "Watch on Dustcourse").

[Dustforce](http://dustforce.com/) was created by [Hitbox Team](http://hitboxteam.com/), not me — I'm just helping keep the legacy alive.

## Development

In one window, run:

    pnpm gulp watch-website --dev

In another, run:

    pnpm node build/website/index.js

Then open a web browser to http://localhost:3000/.

Restart the first command if it crashes. Restart the second whenever the server-side code is modified.

### Building Assets

    # Extract sprites (takes about 2 hours on a HDD)
    ./level_machine/bin/Debug/level_machine extract-sprites "T:\Steam Library\steamapps\common\Dustforce\content\sprites"/*
    # Build levels (takes about 7 hours on a HDD, 2 hours on an SSD)
    ./level_machine/bin/Debug/level_machine render "T:\Steam Library\steamapps\common\Dustforce\content\levels2"/*
    # Compress images. This takes forever - about 2.5 hours per 100MB of PNGs on an
    # 8-core CPU. And there are 5GB of sprites and tiles to cover the built-in maps...
    # there goes a week. It reduces PNG file sizes by about 20-30%, occasionally more.
    python3 scripts/compress-images.py build/website/assets

The reason these take so long is because they create between between tens of
thousands and millions of files. They spend most of their time inside the file
system driver. Optimization opportunities abound.

## Various notes

### Stars

It took a little finagling to get stars looking similar to how they do in the game. It's
unimportant but also weird and fun so I may as well document it. The original stars are
colored, at their brightest, approximately rgb(240, 240, 210), and blended in screen mode.
PIXI's screen mode seems to give bad results, but luckily the stars are monochromatic
(other than alpha, of course), so screen mode can be simulated using normal blending.
First the original star sprites are edited and colorized to white (or, output levels set
to range 255-255). Then, the stars are drawn normally, but with the blue channel shaded
down to 210/240==7/8 strength. Bam, easy as it gets.
