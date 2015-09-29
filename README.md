# Dustcourse

[Dustcourse](https://dustcourse.com/) is a web-based level viewer for Dustforce. Like most demanding webapps, it runs best in Chrome (sorry Firefox, maybe next year).

There's a hidden feature that plays back replays. It's accessible only through manually visiting URLs ([such as this one](https://dustcourse.com/level/yottadifficult#replay=5259359,4496631,4024525,5341247,5359091,3536164,4375226,2825575,2478623,5140503)), since there isn't really a great way to expose it in the UI. Since [Dustkid](http://dustkid.com/)'s replay pages are a natural place, [msg555](https://github.com/msg555) added links from there. Thanks, buddy!

[Dustforce](http://dustforce.com/) was created by [Hitbox Team](http://hitboxteam.com/), not me — I'm just helping keep the legacy alive.

## Development

In one window, run:

    gulp watch-website --dev

In another, run:

    node build/website/index.js

Then open a web browser to http://localhost:3000/.

Restart the first command if it crashes. Restart the second whenever the server-side code is modified.

## Building

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

## Deploying

To deploy the website:

    deploy/deploy.sh user@whatever.server.com

To update the game assets (several GB; best to do this overnight unless it's a tiny change):

    deploy/update-assets.sh user@whatever.server.com

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
