import { Point, Rectangle, Viewport } from './coords';
import * as gfx from './gfx';
import * as hud from './hud';
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

    constructor(private level: model.Level, widget: wiamap.Widget) {
        this.replayer = new Replayer(widget);
        widget.addLayer(this.replayer);
        // hud.addPageHeaderButton('Replays').onclick = () => { this.headerButtonClicked(); };
    }

    public playReplay(replayId: number) {
        var xhr = new XMLHttpRequest();
        xhr.open('get', '/replay/' + replayId + '.json');
        xhr.send();
        xhr.onload = () => { this.loaded(xhr); };
        xhr.onerror = () => { this.errored(); };
    }

    private errored() {
        // TODO
    }

    private loaded(xhr: XMLHttpRequest) {
        if (xhr.status !== 200) {
            this.errored();
            return;
        }
        var replay = JSON.parse(xhr.response);
        this.replayer.load([replay]);
        this.replayer.seek(0);
        this.replayer.play();
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
    private frame = 0;
    private state = STATE_STOPPED;

    constructor(private widget: wiamap.Widget) {
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
        this.frame = frame;
    }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.stage.position.x = -worldRect.left;
        this.stage.position.y = -worldRect.top;
        this.stage.scale.x = this.stage.scale.y = viewport.zoom;

        if (this.state !== STATE_PLAYING)
            return;

        var thisFrameTime = Date.now();
        if (this.lastFrameTime) {
            var framesElapsed = (thisFrameTime - this.lastFrameTime) / 1000 * 60;
            this.frame += framesElapsed;
        } else {
            ++this.frame;
        }
        this.lastFrameTime = thisFrameTime;
        if (this.frame > this.replayFrameCount) {
            this.state = STATE_STOPPED;
            return;
        }

        this.stage.removeChildren();
        _.each(this.replays, replay => {
            this.processReplay(replay);
        });
    }

    private processReplay(replay: Replay) {
        var playerEntity = _.find(replay.sync, s => s.entity_uid === 2);
        var cameraEntity = _.find(replay.sync, s => s.entity_uid === 3);
        var playerCor = interpolateFrame(playerEntity, this.frame);
        if (!playerCor)
            return;
        var cameraCor = interpolateFrame(cameraEntity, this.frame);
        this.widget.viewport.position = new Point(cameraCor[1] / 10, cameraCor[2] / 10);

        var px = playerCor[1] / 10;
        var py = playerCor[2] / 10;
        var fc = gfx.getFrame('hud/head_' + (replay.character + 1) + '_0001', 250);
        this.stage.addChild(util.createDustforceSprite(fc, px - 24, py - 52, { scale: 2.5 }));
    }
}

function interpolateFrame(entity: ReplayEntity, frame: number) {
    var index = _.sortedIndex(entity.corrections, [frame], c => c[0]);
    var b = entity.corrections[index];
    if (!b)
        return entity.corrections[entity.corrections.length - 1];
    if (b[0] === frame)
        return b;
    var a = entity.corrections[index - 1];
    var p = (frame - a[0]) / (b[0] - a[0]);
    return [frame, a[1] * (1 - p) + b[1] * p, a[2] * (1 - p) + b[2] * p];
}
