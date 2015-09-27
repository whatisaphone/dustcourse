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
                var filter = new PIXI.filters.ColorMatrixFilter();
                var [r, g, b] = util.hsvToRgb(dup[0], 1, 1);
                var p = [0, 0, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55][dup[1]] || 0.6;
                util.tintMatrix(filter.matrix, r, g, b, p, 1);
                dup[0] += 1 / dup[1];
            }

            var row = document.createElement('div');
            row.className = 'replay-metadata-row';
            row.textContent = replay.user;
            this.metadataElement.appendChild(row);

            var fc = gfx.getFrame('hud/head_' + (replay.character + 1) + '_0001', 250);
            var sprite = util.createDustforceSprite(fc, 0, 0);
            if (filter)
                sprite.filters = [filter];
            this.hud.stage.addChild(sprite);

            sprite = util.createDustforceSprite(fc, 0, 0, { scale: 2.5 });
            if (filter)
                sprite.filters = [filter];
            this.heads.stage.addChild(sprite);
        });
    }

    public play() {
        this.state = STATE_PLAYING;
    }

    public seek(frame: number) {
        this.counter.setFrame(frame);
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
        var dist = util.distance(minX - 1, minY - 1, maxX + 1, maxY + 1);
        var zoom = Math.min(0.5, Math.min(
            0.5 * viewport.size.height / (270 + dist),
            0.5 * viewport.size.width / (480 + dist)
        ));
        this.widget.setViewport(new Viewport(new Point(avgX, avgY), viewport.size, zoom));
    }

    public updateHeads(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.heads.stage.position.x = -worldRect.left;
        this.heads.stage.position.y = -worldRect.top;
        this.heads.stage.scale.x = this.heads.stage.scale.y = viewport.zoom;
        util.applyFog(this.heads.stage, this.level, 18);

        if (this.state !== STATE_PLAYING)
            return;

        _.each(this.replays, (replay, replayIndex) => {
            this.drawHead(replay, replayIndex, this.replays.length === 1);
        });
    }

    private drawHead(replay: Replay, replayIndex: number, doEnemies: boolean) {
        _.each(replay.sync, sync => {
            var corr = interpolateFrame(sync, this.counter.frame());
            if (!corr)
                return;
            if (sync.entity_uid === 2) {
                var sprite = this.heads.stage.children[replayIndex];
                sprite.position.x = corr[1] / 10 - 24;
                sprite.position.y = corr[2] / 10 - 52;
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
    return [frame, a[1] * (1 - p) + b[1] * p, a[2] * (1 - p) + b[2] * p];
}
