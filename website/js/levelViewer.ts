import { Point, Rectangle, Viewport } from './coords';
import * as gfx from './gfx';
import * as hud from './hud';
import * as model from './model';
import { ReplayUI } from './replay';
import * as util from './util';
import * as wiamap from './wiamap';

export function init(levelName: string) {
    if (levelName !== 'Main Nexus DX')
        hud.addPageHeaderButton('Nexus').href = '/level/Main%20Nexus%20DX';

    new LevelDownloader(levelName).download();
}

class LevelDownloader {
    private xhr: XMLHttpRequest;
    private overlay: HTMLElement;

    constructor(private levelName: string) { }

    public download() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'opaque-overlay';
        document.body.appendChild(this.overlay);

        this.xhr = new XMLHttpRequest();
        this.xhr.open('get', '/assets/levels/' + this.levelName + '/manifest.json');
        this.xhr.send();
        this.xhr.onload = () => { this.loaded(); };
        this.xhr.onerror = () => { this.error(); };
    }

    private error() {
        hud.setLevelName('There was an error downloading "' + this.levelName + '".');
    }

    private loaded() {
        if (this.xhr.status === 404) {
            hud.setLevelName('The level "' + this.levelName + '" was not found on the server.');
            return;
        }
        if (this.xhr.status !== 200) {
            this.error();
            return;
        }

        this.overlay.style.opacity = '0';  // CSS fade out transition
        setTimeout(() => { this.overlay.parentNode.removeChild(this.overlay); }, 2000);

        // stagger these out of an abundance of caution to avoid frame skips
        setTimeout(() => {
            var level = JSON.parse(this.xhr.response);
            setTimeout(() => {
                model.levelPopulate(level);
                setTimeout(() => {
                    createLevelViewer(level);
                }, 0);
            }, 0);
        }, 0);
    }
}

function createLevelViewer(level: model.Level) {
    hud.setLevelName(level.properties['level_name']);

    var widget = new wiamap.Widget();
    var fogger = new FogMachine(widget, level);

    widget.advanceFrame = () => {
        ++level.frame;
        fogger.everyFrame();
        wiamap.Widget.prototype.advanceFrame.call(widget);
    };

    populateLayers(widget, level);

    if (level.properties['level_type'] === 0) {
        var replayer = new ReplayUI(level, widget);
        var m = /[#&]replay=(-?\d+)/.exec(location.hash);
        if (m)
            replayer.playReplay(parseInt(m[1], 10));
    }

    if (level.path === 'Main Nexus DX')  // first impressions matter
        widget.scrollTo(1182.91, -1200, 0.5);
    else
        widget.scrollTo(level.properties['p1_x'], level.properties['p1_y'], 0.5);
}

function findClosestFog(level: model.Level, x: number, y: number) {
    var closestFog = _.min(level.allFogTriggers, e => util.distance(x, y, model.entityX(e), model.entityY(e)));
    return <any>closestFog !== Infinity ? closestFog : null;
}

function makeBackgroundGradient(level: model.Level) {
    if (level.currentFog) {
        return makeSkyGradient(level.currentFog['gradient'], level.currentFog['gradient_middle']);
    }

    return makeSkyGradient(level.properties['cp_background_colour'], level.properties['cp_background_middle']);
}

function makeSkyGradient(colors: number[], middle: number) {
    return 'linear-gradient(' +
        util.convertIntToCSSRGB(colors[0]) + ',' +
        util.convertIntToCSSRGB(colors[1]) + ' ' + (middle * 100) + '%,' +
        util.convertIntToCSSRGB(colors[2]) + ')';
}

function populateLayers(widget: wiamap.Widget, level: model.Level) {
    _.each(level.prerenders, (layer, layerID) => {
        widget.addLayer(new PrerenderedTileLayer(level, parseInt(layerID, 10), layer));
    });

    widget.propsLayers = _.map(_.range(1, 21), layerNum => new PropsLayer(level, layerNum));
    _.each(widget.propsLayers, layer => {
        widget.addLayer(layer);
    });

    widget.addLayer(new StarsLayer(level));
    widget.addLayer(new FilthLayer(level));
    widget.addLayer(new FilthParticlesLayer(level));
}

interface DustforceLayerParams {
    parallax: number;
    scale: number;
}

function dustforceLayerParams(layerNum: number): DustforceLayerParams {
    var parallax = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95][layerNum] || 1;
    return {
        parallax: parallax,
        scale: layerNum <= 5 ? 1 : parallax,
    }
}

class FogMachine {
    private tweenFrom: model.Fog;
    private tweenTo: model.Fog;
    private tweenCurTime: number;
    private tweenTotalTime: number;
    private tweenFog: model.Fog = {
        fog_colour: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        fog_per: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        fog_speed: 0,
        gradient: [0, 0, 0],
        gradient_middle: 0,
        star_top: 0,
        star_middle: 0,
        star_bottom: 0,
        width: 0,
    };

    constructor(private widget: wiamap.Widget, private level: model.Level) {
        var fog = findClosestFog(level, level.properties['p1_x'], level.properties['p1_y']);
        this.tweenTo = fog && <any>model.entityProperties(fog);
        this.drawFog(this.tweenTo);
    }

    private tweening() {
        return this.tweenCurTime <= this.tweenTotalTime;
    }

    public everyFrame() {
        var v = this.widget.viewport;
        var s = v.screenRect();
        var screenCenter = v.screenToWorldP({ def: { parallax: 1 }}, new Point(s.left + s.width / 2, s.top + s.height / 2));
        var fog = findClosestFog(this.level, screenCenter.x, screenCenter.y);
        if (fog) {
            var fogX = model.entityX(fog);
            var fogY = model.entityY(fog);
            var fogProps: model.Fog = <any>model.entityProperties(fog);
            var distance = util.distance(screenCenter.x, screenCenter.y, fogX, fogY);
            if (distance < 384 / v.zoom + fogProps.width)
                this.setNextFog(fogProps);
        }

        if (this.tweening()) {
            this.tweenCurTime += 1 / 60;
            if (this.tweening()) {
                var pct = this.tweenCurTime / this.tweenTotalTime;
                this.calcTween(this.tweenFrom, this.tweenTo, pct, this.tweenFog);
                this.drawFog(this.tweenFog);
            } else {
                this.drawFog(this.tweenTo);
            }
        }
    }

    private setNextFog(fog: model.Fog) {
        if (fog !== this.tweenTo) {
            this.tweenFrom = this.tweening() ? _.clone(this.tweenFog, true) : this.tweenTo;
            this.tweenTo = fog;
            this.tweenCurTime = 0;
            this.tweenTotalTime = fog.fog_speed;
        }
    }

    private calcTween(from: model.Fog, to: model.Fog, pct: number, dest: model.Fog) {
        for (var i = 0; i <= 20; ++i)
            dest.fog_colour[i] = util.lerpRGB(from.fog_colour[i], to.fog_colour[i], pct);
        for (var i = 0; i <= 20; ++i)
            dest.fog_per[i] = util.lerp(from.fog_per[i], to.fog_per[i], pct);
        for (var i = 0; i < 3; ++i)
            dest.gradient[i] = util.lerpRGB(from.gradient[i], to.gradient[i], pct);
        dest.gradient_middle = util.lerp(from.gradient_middle, to.gradient_middle, pct);
        dest.star_top = util.lerp(from.star_top, to.star_top, pct);
        dest.star_middle = util.lerp(from.star_middle, to.star_middle, pct);
        dest.star_bottom = util.lerp(from.star_bottom, to.star_bottom, pct);
    }

    private drawFog(fog: model.Fog) {
        this.level.currentFog = fog;
        var el = this.widget.getElement();
        el.style.background = makeBackgroundGradient(this.level);
    }
}

class PrerenderedTileLayerDef implements wiamap.TileLayerDef {
    public zindex: number;
    public parallax: number;
    public scales: PrerenderedTileScale[];

    constructor(private level: model.Level, private layerNum: number, layer: model.PrerenderLayer) {
        var layerParams = dustforceLayerParams(layerNum);
        this.zindex = layerNum * 10 + 3;
        this.parallax = layerParams.parallax;
        this.scales = _.map(layer.scales, s =>
            new PrerenderedTileScale(s.scale, s.tile_size, layerParams.scale, s.tiles));
    }

    public getTile(scale: PrerenderedTileScale, x: number, y: number): wiamap.Tile {
        var realX = Math.round(x / scale.layerScale);
        var realY = Math.round(y / scale.layerScale);
        if (!_.find(scale.tiles, t => t[0] === realX && t[1] === realY))
            return;

        var imageURL = '/assets/levels/' + this.level.path
            + '/' + scale.scale + '_' + this.layerNum + '_' + realX + ',' + realY + '.png';
        var fc = gfx.getFrameFromRawImage(imageURL, this.zindex);
        return { texture: fc.texture };
    }
}

class PrerenderedTileScale implements wiamap.TileScale {
    public tileWidth: number;
    public tileHeight: number;

    constructor(public scale: number, public tileSize: [number, number], public layerScale: number, public tiles: [number, number][]) {
        this.tileWidth = tileSize[0] * layerScale;
        this.tileHeight = tileSize[1] * layerScale;
    }
}

class PrerenderedTileLayer extends wiamap.TileLayer {
    constructor(private level: model.Level, private layerNum: number, layer: model.PrerenderLayer) {
        super(new PrerenderedTileLayerDef(level, layerNum, layer));
    }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        super.update(viewport, canvasRect, worldRect);

        util.applyFog(this.stage, this.level, this.layerNum);
    }
}

export class PropsLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public stage = new util.ChunkContainer();
    private sliceStages: { [sliceKey: string]: PIXI.Container } = {};
    private propSprites: { [uid: number]: util.DustforceSprite } = {};
    public sliceEntities: { [sliceKey: string]: { [uid: number]: Entity } } = {};
    private frame = 0;
    private layerParams: DustforceLayerParams;

    constructor(private level: model.Level, private layerNum: number) {
        this.layerParams = dustforceLayerParams(layerNum);
        this.def = { zindex: layerNum * 10 + 5, parallax: this.layerParams.parallax };
    }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        ++this.frame;

        this.stage.position.x = -worldRect.left;
        this.stage.position.y = -worldRect.top;
        this.stage.scale.x = this.stage.scale.y = viewport.zoom;

        util.applyFog(this.stage, this.level, this.layerNum);

        if (this.layerNum <= 5) {
            // background layers use weird coordinates and since there aren't usually many
            // props back there it's not that bad to just process every slice every time
            _.each(this.level.blocks, block => {
                _.each(block.slices, slice => {
                    this.runSlice(block, slice);
                });
            });
        } else {
            model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
                this.runSlice(block, slice);
            });
        }
    }

    private runSlice(block: model.Block, slice: model.Slice) {
        var sliceKey = model.sliceKey(block, slice);
        var stage = this.sliceStages[sliceKey];
        if (!stage)
            stage = this.populateSliceStage(block, slice);

        _.each(slice.props, prop => {
            if (model.propLayerGroup(prop) === this.layerNum)
                this.updateProp(prop);
        });

        if (this.layerNum === 18) {
            _.each(slice.entities, entity => {
                var ent = this.sliceEntities[sliceKey][model.entityUid(entity)];
                if (ent)
                    ent.update();
            });
        }
    }

    private populateSliceStage(block: model.Block, slice: model.Slice) {
        var sliceKey = model.sliceKey(block, slice);
        var stage = new PIXI.Container();
        this.sliceStages[sliceKey] = stage;
        this.stage.addChild(stage);
        this.sliceEntities[sliceKey] = {};

        _.each(slice.props, prop => {
            if (model.propLayerGroup(prop) === this.layerNum)
                this.propSprites[model.propUid(prop)] = this.addProp(stage, prop);
        });

        if (this.layerNum === 18) {
            _.each(slice.entities, entity => {
                var ent = this.addEntity(stage, entity);
                if (ent)
                    this.sliceEntities[sliceKey][model.entityUid(entity)] = ent;
            });
        }

        return stage;
    }

    private addProp(stage: PIXI.Container, prop: model.Prop) {
        var propX = model.propX(prop);
        var propY = model.propY(prop);
        var scaleX = model.propScaleX(prop);
        var scaleY = model.propScaleY(prop);

        if (model.propLayerGroup(prop) <= 5) {
            propX *= this.layerParams.parallax;
            propY *= this.layerParams.parallax;
            scaleX *= 2;
            scaleY *= 2;
        }

        var sprite = util.createDustforceSprite(null, propX, propY, {
            scaleX: scaleX,
            scaleY: scaleY,
            rotation: model.propRotation(prop),
        });
        stage.addChild(sprite);
        return sprite;
    }

    private updateProp(prop: model.Prop) {
        var anim = gfx.propAnim(model.propSet(prop), model.propGroup(prop),
                                model.propIndex(prop), model.propPalette(prop));
        var fc = gfx.getFrame(anim.frameName(this.frame), this.def.zindex);
        this.propSprites[model.propUid(prop)].setFrame(fc);
    }

    private addEntity(stage: PIXI.Container, entity: model.Entity) {
        var entityName = model.entityName(entity);
        var ent: Entity;
        if (entityName.slice(0, 6) === 'enemy_')
            ent = new SimpleEntity(this.level, entity, gfx.entityAnim(entityName));
        else if (entityName === 'giga_gate')
            ent = new SimpleEntity(this.level, entity, new gfx.SpriteAnim('entities/nexus/interactables/redkeybarrierclosed_', 1, 1));
        else if (entityName === 'hittable_apple')
            ent = new SimpleEntity(this.level, entity, new gfx.SpriteAnim('entities/forest/apple/idle_', 1, 1));
        else if (entityName === 'level_door')
            ent = new LevelDoorEntity(this.level, entity);
        else if (entityName === 'score_book')
            ent = createScoreBookEntity(this.level, entity);

        if (ent) {
            ent.add(stage);
            return ent;
        }
    }
}

export interface Entity {
    sprite: PIXI.DisplayObject;
    add(stage: PIXI.Container): void;
    update(): void;
}

class SimpleEntity implements Entity {
    public sprite: util.DustforceSprite;

    constructor(private level: model.Level, private entity: model.Entity, private anim: gfx.SpriteAnim) { }

    public add(stage: PIXI.Container) {
        var [entityX, entityY] = model.getEntityOrAIPosition(this.level, this.entity);
        this.sprite = util.createDustforceSprite(null, entityX, entityY);
        stage.addChild(this.sprite);
    }

    public update() {
        var fc = gfx.getFrame(this.anim.frameName(this.level.frame), 185);
        this.sprite.setFrame(fc);
    }
}

class LevelDoorEntity implements Entity {
    private fc: gfx.FrameContainer;
    public sprite: PIXI.DisplayObject;

    constructor(private level: model.Level, private entity: model.Entity) { }

    public add(stage: PIXI.Container) {
        var [entityX, entityY] = model.getEntityOrAIPosition(this.level, this.entity);
        var props = model.entityProperties(this.entity);
        var doorSet = props['door_set'];

        if (doorSet === 0) {
            this.sprite = util.transparentSprite(-78, -187, 156, 189);
            this.sprite.position.x = entityX;
            this.sprite.position.y = entityY;
        } else {
            this.fc = gfx.getFrame('entities/nexus/door/closed' + doorSet + '_1_0001', 185);
            this.sprite = util.createDustforceSprite(this.fc, entityX, entityY);
        }
        this.sprite.interactive = true;
        this.sprite.buttonMode = true;  // sets mouse cursor to 'pointer' (i.e., hand)
        this.sprite.on('mousedown', () => {
            location.href = '/level/' + props['file_name'];
        });

        stage.addChild(this.sprite);
    }

    public update() {
        if (this.fc)
            (<util.DustforceSprite>this.sprite).setFrame(this.fc);
    }
}

function createScoreBookEntity(level: model.Level, entity: model.Entity) {
    var irregulars: { [type: string]: gfx.SpriteAnim } = {
        'cl': new gfx.SpriteAnim('entities/nexus/interactables/playcustom_', 2, 6),
        'dlc': new gfx.SpriteAnim('entities/nexus/interactables/dlclevels_', 2, 6),
        'le': new gfx.SpriteAnim('entities/nexus/interactables/customlevels_', 2, 6),
    };
    var props = model.entityProperties(entity);
    var anim: gfx.SpriteAnim = irregulars[props['book_type']] ||
        new gfx.SpriteAnim('entities/nexus/interactables/' + props['book_type'] + 'bookclosed_', 1, 1);
    return new SimpleEntity(level, entity, anim);
}

class FilthLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public stage = new util.ChunkContainer();
    private sliceStages: { [sliceKey: string]: PIXI.Container } = {};

    constructor(private level: model.Level) {
        this.def = { zindex: 198, parallax: 1 };
    }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.stage.position.x = -worldRect.left;
        this.stage.position.y = -worldRect.top;
        this.stage.scale.x = this.stage.scale.y = viewport.zoom;
        util.applyFog(this.stage, this.level, 19);

        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            var sliceKey = model.sliceKey(block, slice);
            var sliceStage = this.sliceStages[sliceKey];
            if (!sliceStage) {
                sliceStage = new PIXI.Container();
                this.sliceStages[sliceKey] = sliceStage;
                this.stage.addChild(sliceStage);

                _.each(slice.filth, filth => {
                    filth.eachEdge((edge, center, caps) => {
                        this.drawFilth(sliceStage, block, slice, filth.x, filth.y, edge, center, caps);
                    });
                });
            }
        });
    }

    private drawFilth(stage: PIXI.Container, block: model.Block, slice: model.Slice,
                      filthX: number, filthY: number, edge: model.TileEdge, center: number, caps: number) {
        var tileRect = model.tileWorldRect(block, slice, filthX, filthY);
        tileRect.left += edge.x1 * model.pixelsPerTile;
        tileRect.top += edge.y1 * model.pixelsPerTile;

        var container = util.createDustforceSprite(null, tileRect.left, tileRect.top, { rotation: edge.angle });
        stage.addChild(container);
        var length = edge.length * model.pixelsPerFilth;

        if (center) {
            var url = 'area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + (2 + (filthX + filthY) % 5) + '_0001';
            var fc = gfx.getFrame(url, this.def.zindex);
            container.addChild(util.createDustforceSprite(fc, 0, 0, { scaleX: edge.length }));
        }
        if (caps & 1) {
            var url = 'area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + 1 + '_0001';
            var fc = gfx.getFrame(url, this.def.zindex);
            container.addChild(util.createDustforceSprite(fc, 0, 0));
        }
        if (caps & 2) {
            var url = 'area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + 7 + '_0001';
            var fc = gfx.getFrame(url, this.def.zindex);
            container.addChild(util.createDustforceSprite(fc, length, 0));
        }
    }
}

class FilthParticlesLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public stage = new util.ChunkContainer();
    private particles: Particle[] = [];

    constructor(private level: model.Level) {
        this.def = { zindex: 191, parallax: 1 };
    }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.stage.alpha = Math.max(0, Math.min(1, (viewport.zoom - 0.15) * 5));
        if (this.stage.alpha <= 0) {
            this.stage.visible = false;
            return;
        }

        this.stage.visible = true;

        this.stage.position.x = -worldRect.left;
        this.stage.position.y = -worldRect.top;
        this.stage.scale.x = this.stage.scale.y = viewport.zoom;
        util.applyFog(this.stage, this.level, 19);

        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            _.each(slice.filth, filth => {
                var tileRect = model.tileWorldRect(block, slice, filth.x, filth.y);
                filth.eachEdge((edge, center, caps) => {
                    var p = this.maybeCreateParticle(tileRect, edge, center);
                    if (p) {
                        this.particles.push(p);
                        p.sprite = util.createDustforceSprite(null, p.x, p.y, { rotation: p.rotation });
                        this.stage.addChild(p.sprite);
                    }
                });
            });
        });

        for (var pi = 0; pi < this.particles.length; ++pi) {
            var particle = this.particles[pi];
            if (!this.drawAndUpdateParticle(viewport, particle)) {
                this.stage.removeChild(particle.sprite);
                this.particles.splice(pi, 1);
                --pi;
            }
        }
    }

    private maybeCreateParticle(tileRect: Rectangle, tileEdge: model.TileEdge, spriteSet: number) {
        var info = filthParticleInfos[spriteSet];
        if (!info || Math.random() > info.spawnChance)
            return;

        var anim = info.sprites[Math.floor(Math.random() * info.sprites.length)];
        var x = tileRect.left + (tileEdge.x1 + Math.random() * (tileEdge.x2 - tileEdge.x1)) * model.pixelsPerTile;
        var y = tileRect.top + (tileEdge.y1 + Math.random() * (tileEdge.y2 - tileEdge.y1)) * model.pixelsPerTile;
        var theta = info.rotate ? Math.random() * Math.PI * 2 : tileEdge.angle;
        var [dx, dy] = this.generateParticleDrift(tileEdge.angle, info.drift[0], info.drift[1], info.drift[2], info.drift[3]);
        var [fs, fd] = info.fade
            ? [info.fade[0] + Math.random() * info.fade[1], info.fade[2] + Math.random() * info.fade[3]]
            : [anim.frameCount * anim.frameDuration60, 1];
        var fadeOutStart = 30 + Math.random() * 90;
        var fadeOutDuration = 8 + Math.random() * 16;
        return new Particle(anim, fs, fd, x, y, theta, dx, dy);
    }

    private generateParticleDrift(angle: number, parMin: number, parMax: number, perpMin: number, perpMax: number) {
        var par = parMin + Math.random() * (parMax - parMin);
        var perp = perpMin + Math.random() * (perpMax - perpMin);
        var x = Math.cos(angle) * par + Math.sin(angle) * perp;
        var y = Math.sin(angle) * par + Math.cos(angle) * perp;
        return [x, -y];  // negative y, because converting from cartesian coords to computer coords
    }

    private drawAndUpdateParticle(viewport: Viewport, particle: Particle) {
        var fc = gfx.getFrame(particle.anim.frameName(particle.frame), this.def.zindex);
        particle.sprite.setFrame(fc);

        particle.sprite.position.x = particle.x;
        particle.sprite.position.y = particle.y;
        particle.sprite.alpha = particle.alpha;

        ++particle.frame;
        particle.x += particle.dx;
        particle.y += particle.dy;
        if (particle.frame >= particle.fadeOutStart) {
            particle.alpha -= 1 / particle.fadeOutDuration;
            if (particle.alpha <= 0)
                return false;
        }
        return true;
    }
}

class FilthParticleInfo {
    constructor(public spawnChance: number, public rotate: boolean, public drift: number[], public fade: number[], public sprites: gfx.SpriteAnim[]) { }
}

var filthParticleInfos = [
    null,
    new FilthParticleInfo(0.02, false, [-0.1, 0.1, 0, 0.2], null, [
        new gfx.SpriteAnim('area/mansion/particles/dust1_', 13, 6),
        new gfx.SpriteAnim('area/mansion/particles/dust2_', 8, 6),
        new gfx.SpriteAnim('area/mansion/particles/dust3_', 6, 6),
    ]),
    new FilthParticleInfo(0.02, true, [-0.5, 0.5, 0, 1], [30, 90, 8, 16], [
        new gfx.SpriteAnim('area/forest/particles/leafdrift1_', 15, 6),
        new gfx.SpriteAnim('area/forest/particles/leafdrift2_', 15, 6),
        new gfx.SpriteAnim('area/forest/particles/leafdrift3_', 15, 6),
        new gfx.SpriteAnim('area/forest/particles/leafspin1_', 5, 6),
        new gfx.SpriteAnim('area/forest/particles/leafspin2_', 5, 6),
        new gfx.SpriteAnim('area/forest/particles/leafspin3_', 5, 6),
    ]),
    new FilthParticleInfo(0.005, false, [-0.1, 0.1, 0, 0.2], null, [
        new gfx.SpriteAnim('area/city/particles/bigpuff_', 5, 12),
        new gfx.SpriteAnim('area/city/particles/medpuff_', 5, 12),
        new gfx.SpriteAnim('area/city/particles/littlepuff_', 8, 12),
        new gfx.SpriteAnim('area/city/particles/fly1_', 21, 6),
    ]),
    new FilthParticleInfo(0.01, false, [-0.1, 0.1, 0, 0.2], null, [
        new gfx.SpriteAnim('area/laboratory/particles/bigbubble_', 18, 6),
        new gfx.SpriteAnim('area/laboratory/particles/smallbubble_', 17, 6),
    ]),
    new FilthParticleInfo(0.025, true, [-0.5, 0.5, 0, 1], [120, 120, 8, 16], [
        new gfx.SpriteAnim('area/tutorial/particles/poly1_', 8, 6),
        new gfx.SpriteAnim('area/tutorial/particles/poly2_', 6, 6),
    ]),
];

class Particle {
    public frame = 1;
    public alpha = 1;
    public sprite: util.DustforceSprite;

    constructor(public anim: gfx.SpriteAnim, public fadeOutStart: number, public fadeOutDuration: number, public x: number, public y: number, public rotation: number, public dx: number, public dy: number) { }
}

class StarsLayer implements wiamap.Layer {
    public def = { zindex: 4, parallax: 0.02 };
    public stage = new util.ChunkContainer();
    public starStages: util.ViewportParticleContainer[] = [];
    private universeBounds = new Rectangle(0, 0, 0, 0);

    constructor(private level: model.Level) {
        _.each(_.range(0, 3), i => {
            var s = new util.ViewportParticleContainer();
            this.starStages.push(s);
            this.stage.addChild(s);
        });
    }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        if (!this.level.currentFog) {
            this.stage.visible = false;
            return;
        }

        this.stage.alpha = Math.max(0, Math.min(1, (viewport.zoom - 0.2) * 3.5));
        if (this.stage.alpha <= 0) {
            this.stage.visible = false;
            return;
        }

        this.stage.visible = true;
        this.stage.position.x = -worldRect.left;
        this.stage.position.y = -worldRect.top;
        this.stage.scale.x = this.stage.scale.y = viewport.zoom;
        util.applyFog(this.stage, this.level, 0);

        this.expandUniverse(worldRect);

        var fog = this.level.currentFog;
        var topY = worldRect.top;
        var midY = worldRect.top + fog['gradient_middle'] * worldRect.height;
        var botY = worldRect.bottom();
        var topA = fog['star_top'];
        var midA = fog['star_middle'];
        var botA = fog['star_bottom'];

        // Yeah, yeah, I know stuff like this belongs in a shader. I don't
        // feel like figuring that out right now. This runs quick *enough*

        for (var ssi = 0, ssl = this.starStages.length; ssi < ssl; ++ssi) {
            var ss = this.starStages[ssi];
            for (var ci = 0, cl = ss.children.length; ci < cl; ++ci) {
                var child = ss.children[ci];
                if (child.position.y < midY) {
                    var pct = (child.position.y - topY) / (midY - topY);
                    var alpha = topA * (1 - pct) + midA * pct;
                } else {
                    var pct = (child.position.y - midY) / (botY - midY);
                    var alpha = midA * (1 - pct) + botA * pct;
                }
                alpha *= (ci % 9) / 8;  // add some "shimmer"
                child.alpha = Math.max(0, Math.min(1, alpha));
            }
        }
    }

    private expandUniverse(area: Rectangle) {
        var galaxySize = 192;
        var minX = Math.floor(area.left / galaxySize) * galaxySize;
        var minY = Math.floor(area.top / galaxySize) * galaxySize;
        var maxX = Math.floor(area.right() / galaxySize) * galaxySize;
        var maxY = Math.floor(area.bottom() / galaxySize) * galaxySize;
        for (var galaxyX = minX; galaxyX < maxX; galaxyX += galaxySize)
        for (var galaxyY = minY; galaxyY < maxY; galaxyY += galaxySize) {
            if (this.universeBounds.contains(new Point(galaxyX, galaxyY)))
                continue;
            for (var s = 0; s < 36; ++s) {
                var x = galaxyX + Math.random() * galaxySize;
                var y = galaxyY + Math.random() * galaxySize;

                var whichStar = Math.floor(Math.random() * 3);
                var texURL = '/static/star' + (whichStar + 1) + '.png';
                var tex = gfx.getFrameFromRawImage(texURL, this.def.zindex).texture;
                var sprite = new PIXI.Sprite(tex);
                sprite.position.x = x;
                sprite.position.y = y;
                // sprite.scale.x = sprite.scale.y = 1.5;
                this.starStages[whichStar].addChild(sprite);
            }
        }
        this.universeBounds = Rectangle.ltrb(
            Math.min(minX, this.universeBounds.left),
            Math.min(minY, this.universeBounds.top),
            Math.max(maxX, this.universeBounds.right()),
            Math.max(maxY, this.universeBounds.bottom()));
    }
}
