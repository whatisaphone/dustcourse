import { Point, Rectangle, Viewport } from './coords';
import * as gfx from './gfx';
import * as hud from './hud';
import * as levelViewer from './levelViewer';
import * as model from './model';
import * as util from './util';
import * as wiamap from './wiamap';

interface Replay {
    user: string;
    level: string;
    frames: number;
    character: number;
    inputs: string[];
    sync: ReplayEntity[];
    headTintMatrix: number[];
    headSprite: util.DustforceSprite;
    headSpriteFilter: PIXI.filters.ColorMatrixFilter;
    fxs: [gfx.SpriteAnim, util.DustforceSprite, number][];
}

interface ReplayEntity {
    entity_uid: number;
    corrections: number[][];
}

export class ReplayUI {
    private replayer: Replayer;
    private replays: Replay[];

    constructor(private level: model.Level, widget: wiamap.Widget) {
        this.replayer = new Replayer(widget, level);
        // hud.addPageHeaderButton('Replays').onclick = () => { this.headerButtonClicked(); };
    }

    public playReplays(replayIds: number[]) {
        this.replays = _.map(replayIds, _ => null);

        _.each(replayIds, (replayId, index) => {
            var xhr = new XMLHttpRequest();
            xhr.open('get', '/replay/' + replayId + '.json');
            xhr.send();
            xhr.onload = () => { this.loaded(xhr, index); };
            xhr.onerror = () => { this.errored(); };
        });
    }

    private errored() {
        // TODO
    }

    private loaded(xhr: XMLHttpRequest, index: number) {
        if (xhr.status !== 200) {
            this.errored();
            return;
        }
        this.replays[index] = JSON.parse(xhr.response);

        var done = _.all(this.replays, r => r);
        if (done) {
            this.prepareReplays(this.replays);
        }
    }

    private prepareReplays(replays: Replay[]) {
        this.replayer.load(replays);
        this.replayer.seek(0);
        this.replayer.play();
    }
}

const STATE_STOPPED = 0;
const STATE_PLAYING = 1;

class Replayer {
    private replays: Replay[];
    private replayFrameCount: number;
    private counter = new util.FrameCounter();
    private state = STATE_STOPPED;
    private hud = new HUDLayer(this);
    private heads = new HeadsLayer(this);
    private metadataElement: HTMLElement;
    private lastDrawnFrame: number;

    constructor(private widget: wiamap.Widget, private level: model.Level) {
        widget.addLayer(this.hud);
        widget.addLayer(this.heads);
    }

    public load(replays: Replay[]) {
        this.replays = replays;
        this.replayFrameCount = _.max(replays, r => r.frames).frames;

        this.metadataElement = document.createElement('div');
        this.metadataElement.className = 'replay-metadata';
        document.body.appendChild(this.metadataElement);

        var dupChars = _.object(_.map(_.filter(_.pairs(_.groupBy(replays, r => r.character)), p => p[1].length > 1), p => [p[0], [0, p[1].length]]));

        replays.forEach(replay => {
            var dup = dupChars[replay.character];
            if (dup) {
                var [r, g, b] = util.hsvToRgb(dup[0], 1, 1);
                var p = [0, 0, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55][dup[1]] || 0.6;
                replay.headTintMatrix = [1 - p, 0,     0,     r * p, 0,
                                         0,     1 - p, 0,     g * p, 0,
                                         0,     0,     1 - p, b * p, 0,
                                         0,     0,     0,     1,     0];
                dup[0] += 1 / dup[1];
            }

            var row = document.createElement('div');
            row.className = 'replay-metadata-row';
            row.textContent = replay.user;
            this.metadataElement.appendChild(row);

            var fc = gfx.getFrame('hud/head_' + (replay.character + 1) + '_0001', 250);
            var sprite = util.createDustforceSprite(fc, 0, 0);
            if (replay.headTintMatrix) {
                var hudSpriteFilter = new PIXI.filters.ColorMatrixFilter();
                hudSpriteFilter.matrix = replay.headTintMatrix;
                sprite.filters = [hudSpriteFilter];
            }
            this.hud.stage.addChild(sprite);

            replay.headSprite = util.createDustforceSprite(fc, 0, 0, { scale: 2.5 });
            replay.headSpriteFilter = new PIXI.filters.ColorMatrixFilter();
            replay.headSprite.filters = [replay.headSpriteFilter];
            this.heads.stage.addChild(replay.headSprite);

            replay.fxs = [];
        });
    }

    public play() {
        this.state = STATE_PLAYING;
    }

    public seek(frame: number) {
        this.counter.setFrame(frame);
        this.lastDrawnFrame = frame;
    }

    public updateHUD(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        if (!this.replays)
            return;

        this.replays.forEach((replay, replayIndex) => {
            var row = this.metadataElement.children[replayIndex];
            var rowRect = row.getBoundingClientRect();
            var sprite = this.hud.stage.children[replayIndex];
            sprite.position.x = rowRect.left - 40;
            sprite.position.y = rowRect.top + rowRect.height / 2;
        });

        if (this.state !== STATE_PLAYING)
            return;

        var frame = this.counter.advance();
        if (frame > this.replayFrameCount) {
            this.state = STATE_STOPPED;
            return;
        }

        this.updateCamera(viewport);
    }

    private updateCamera(viewport: Viewport) {
        var cameras = this.replays
            .map(r => interpolateFrame(_.find(r.sync, s => s.entity_uid === 3), this.counter.frame()))
            .filter(r => <any>r)
            .map(([f, x, y, dx, dy]) => [x / 10, y / 10]);
        var avgX = _.sum(cameras, c => c[0]) / cameras.length;
        var avgY = _.sum(cameras, c => c[1]) / cameras.length;
        var minX = _.min(cameras, c => c[0])[0];
        var maxX = _.max(cameras, c => c[0])[0];
        var minY = _.min(cameras, c => c[1])[1];
        var maxY = _.max(cameras, c => c[1])[1];
        var dist = util.distance(minX - 960, minY - 540, maxX + 960, maxY + 540);
        var zoom = Math.min(1, Math.min(viewport.size.width / (1920 + maxX - minX),
                                        viewport.size.height / (1080 + maxY - minY)));
        this.widget.setViewport(new Viewport(new Point(avgX, avgY), viewport.size, zoom));
    }

    public updateHeads(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.heads.stage.position.x = -worldRect.left;
        this.heads.stage.position.y = -worldRect.top;
        this.heads.stage.scale.x = this.heads.stage.scale.y = viewport.zoom;

        if (this.state !== STATE_PLAYING)
            return;

        _.each(this.replays, replay => {
            this.drawEntities(replay, this.replays.length === 1);

            if (replay.headTintMatrix)
                util.multiplyColorMatrices(replay.headSpriteFilter.matrix, replay.headTintMatrix, this.level.currentFogFilters[18][0].matrix);
            else
                replay.headSpriteFilter.matrix = this.level.currentFogFilters[18][0].matrix;
        });

        this.lastDrawnFrame = this.counter.frame();
    }

    private drawEntities(replay: Replay, doEnemies: boolean) {
        _.each(replay.sync, sync => {
            var corr = interpolateFrame(sync, this.counter.frame());
            if (!corr)
                return;
            if (sync.entity_uid === 2) {
                var head = replay.headSprite;
                head.position.x = corr[1] / 10 - 24;
                head.position.y = corr[2] / 10 - 52;
                this.drawFx(replay, sync);
            } else if (doEnemies) {
                var entity: levelViewer.Entity;
                _.each(this.widget.propsLayers[18 - 1].sliceEntities, slen => {
                    if (!entity)
                        entity = slen[sync.entity_uid];
                });
                if (entity) {
                    if (corr[0] < sync.corrections[sync.corrections.length - 1][0]) {
                        entity.sprite.position.x = corr[1] / 10;
                        entity.sprite.position.y = corr[2] / 10;
                    } else {
                        entity.sprite.visible = false;
                    }
                }
            }
        });
    }

    private drawFx(replay: Replay, entity: ReplayEntity) {
        var frame = Math.floor(this.counter.frame());

        for (var fxi = 0, fxl = replay.fxs.length; fxi < fxl; ++fxi) {
            var [anim, sprite, spawned] = replay.fxs[fxi];
            if (frame - spawned >= anim.frameCount * anim.frameDuration60) {
                this.heads.stage.removeChild(sprite);
                replay.fxs.splice(fxi, 1);
                --fxi;
                --fxl;
                continue;
            }
            var fc = gfx.getFrame(anim.frameName(frame - spawned), this.heads.def.zindex);
            sprite.setFrame(fc);
        }

        for (var f = Math.ceil(this.lastDrawnFrame) + 1; f <= frame; ++f)
            this.checkForNewFxs(replay, entity, f);
    }

    private checkForNewFxs(replay: Replay, entity: ReplayEntity, frame: number) {
        function inp(inputRow: number, offset: number) {
            return replay.inputs[inputRow].charCodeAt(frame + offset) - 48;
        }

        var corr = interpolateFrame(entity, frame);

        if (inp(2, 0) && !inp(2, -1)) {
            var anim = new gfx.SpriteAnim('player/dustman/movementfx/dmdbljump_', 5, 6);
            this.addFx(replay, anim, corr[1] / 10, corr[2] / 10, 1);
        }

        if (inp(3, 0) && !inp(3, -1)) {
            var anim = new gfx.SpriteAnim('player/dustman/movementfx/dmairdash_', 5, 6);
            var scaleX = inp(0, 0) === 2 ? 1 : inp(0, 0) === 0 ? -1 : 1;
            this.addFx(replay, anim, corr[1] / 10 - 30 * scaleX, corr[2] / 10, scaleX);
        } else if (inp(4, 0) && !inp(4, -1)) {
            var anim = new gfx.SpriteAnim('player/dustman/movementfx/dmfastfall_', 5, 6);
            this.addFx(replay, anim, corr[1] / 10, corr[2] / 10 - 80, 1);
        }

        anim = null;
        var offX = 0, offY = 0;
        if ((inp(5, 0) && inp(6, 0)) && !(inp(5, -1) && inp(6, -1))) {
            anim = new gfx.SpriteAnim('player/dustman/attackfx/dmcleanse_', 15, 6);
        } else if (inp(5, -6) && !inp(5, -7)) {
            offX = 90;
            if (inp(1, 0) === 0) {
                anim = new gfx.SpriteAnim('player/dustman/attackfx/dmgroundstrikeu2_', 6, 6);
                offX = 50;
                offY = -50;
            } else if (inp(1, 0) === 2)
                anim = new gfx.SpriteAnim('player/dustman/sweepfx/dmsweep2_', 4, 6);
            else
                anim = new gfx.SpriteAnim('player/dustman/attackfx/dmgroundstrike1_', 6, 6);
            var scaleX = inp(0, -4) === 2 ? 1 : inp(0, -4) === 0 ? -1 : 1;
        } else if (inp(6, -16) && !inp(6, -17)) {
            offX = 90;
            if (inp(1, -10) === 0) {
                anim = new gfx.SpriteAnim('player/dustman/attackfx/dmheavyu_', 6, 6);
                offY = -90;
            } else if (inp(1, -10) === 2)
                anim = new gfx.SpriteAnim('player/dustman/attackfx/dmairheavyd_', 6, 6);
            else
                anim = new gfx.SpriteAnim('player/dustman/attackfx/dmheavyf_', 6, 6);
            var scaleX = inp(0, -10) === 2 ? 1 : inp(0, -10) === 0 ? -1 : 1;
        }
        if (anim)
            this.addFx(replay, anim, corr[1] / 10 + offX * scaleX, corr[2] / 10 + offY, scaleX);
    }

    private addFx(replay: Replay, anim: gfx.SpriteAnim, x: number, y: number, scaleX: number) {
        var fc = gfx.getFrame(anim.frameName(0), this.heads.def.zindex);
        var sprite = util.createDustforceSprite(fc, x, y, { scaleX: scaleX });
        sprite.filters = [replay.headSpriteFilter];
        this.heads.stage.addChild(sprite);

        // BLUUHHHHHHH whatever it fixes the problem
        sprite.updateTransform = function () {
            var b = this.getBounds();
            this.filterArea = new PIXI.Rectangle(b.x - b.width, b.y - b.height, b.width * 2, b.height * 2);
            util.DustforceSprite.prototype.updateTransform.call(this);
        };

        replay.fxs.push([anim, sprite, this.counter.frame()]);
    }
}

class HUDLayer implements wiamap.Layer {
    public def = { zindex: 250, parallax: 1 };
    public stage = new PIXI.Container();

    constructor(private replayer: Replayer) { }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.replayer.updateHUD(viewport, canvasRect, worldRect);
    }
}

class HeadsLayer implements wiamap.Layer {
    public def = { zindex: 199, parallax: 1 };
    public stage = new util.ChunkContainer();

    constructor(private replayer: Replayer) { }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.replayer.updateHeads(viewport, canvasRect, worldRect);
    }
}

function interpolateFrame(entity: ReplayEntity, frame: number) {
    var index = _.sortedIndex(entity.corrections, [frame], c => c[0]);
    if (index === 0)
        return entity.corrections[0];
    var b = entity.corrections[index];
    if (!b)
        return entity.corrections[entity.corrections.length - 1];
    if (b[0] === frame)
        return b;
    var a = entity.corrections[index - 1];
    var p = (frame - a[0]) / (b[0] - a[0]);
    return [frame, a[1] * (1 - p) + b[1] * p, a[2] * (1 - p) + b[2] * p, b[3], b[4]];
}
