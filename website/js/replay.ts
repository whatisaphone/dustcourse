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
        widget.addLayer(this.replayer);
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
            this.replayer.load(this.replays);
            this.replayer.seek(0);
            this.replayer.play();
        }
    }
}

const STATE_STOPPED = 0;
const STATE_PLAYING = 1;

export class Replayer implements wiamap.Layer {
    public def = { zindex: 199, parallax: 1 };
    public stage = new util.ChunkContainer();
    private replays: Replay[];
    private replayFrameCount: number;
    private lastFrameTime: number;
    private counter = new util.FrameCounter();
    private state = STATE_STOPPED;

    constructor(private widget: wiamap.Widget, private level: model.Level) {
        widget.addLayer(this);
    }

    public load(replays: Replay[]) {
        this.replays = replays;
        this.replayFrameCount = _.max(replays, r => r.frames).frames;
    }

    public play() {
        this.state = STATE_PLAYING;
        this.lastFrameTime = 0;
    }

    public seek(frame: number) {
        this.counter.setFrame(frame);
    }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.stage.position.x = -worldRect.left;
        this.stage.position.y = -worldRect.top;
        this.stage.scale.x = this.stage.scale.y = viewport.zoom;
        util.applyFog(this.stage, this.level, 18);

        if (this.state !== STATE_PLAYING)
            return;

        var frame = this.counter.advance();
        if (frame > this.replayFrameCount) {
            this.state = STATE_STOPPED;
            return;
        }

        this.stage.removeChildren();

        var cameras = this.replays
            .map(r => interpolateFrame(_.find(r.sync, s => s.entity_uid === 3), frame))
            .filter(r => <any>r)
            .map(([f, x, y, dx, dy]) => [x / 10, y / 10]);
        var avgX = _.sum(cameras, c => c[0]) / cameras.length;
        var avgY = _.sum(cameras, c => c[1]) / cameras.length;
        var minX = _.min(cameras, c => c[0])[0];
        var maxX = _.max(cameras, c => c[0])[0];
        var minY = _.min(cameras, c => c[1])[1];
        var maxY = _.max(cameras, c => c[1])[1];
        var dist = util.distance(minX - 1, minY - 1, maxX + 1, maxY + 1);
        var viewportSize = this.widget.getViewport().size;
        var zoom = Math.min(0.5, Math.min(
            0.5 * viewportSize.height / (270 + dist),
            0.5 * viewportSize.width / (480 + dist)
        ));
        this.widget.setViewport(new Viewport(new Point(avgX, avgY), viewportSize, zoom));

        _.each(this.replays, replay => {
            this.processReplay(replay, this.replays.length === 1);
        });
    }

    private processReplay(replay: Replay, doEnemies: boolean) {
        _.each(replay.sync, sync => {
            var corr = interpolateFrame(sync, this.counter.frame());
            if (!corr)
                return;
            if (sync.entity_uid === 2) {
                var px = corr[1] / 10;
                var py = corr[2] / 10;
                var fc = gfx.getFrame('hud/head_' + (replay.character + 1) + '_0001', 250);
                this.stage.addChild(util.createDustforceSprite(fc, px - 24, py - 52, { scale: 2.5 }));
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
