import { Point, Rectangle } from './coords';
import * as model from './model';
import * as sprites from './sprites';
import * as util from './util';
import * as wiamap from './wiamap';

export function init(level: model.Level) {
    model.levelPopulate(level);

    var widget = new wiamap.Widget();

    var el = widget.getElement();
    el.setAttribute('class', 'wiamap-stage');
    document.body.appendChild(el);

    level.currentFog = findFogEntityNearestPlayer(level);
    el.style.background = makeBackgroundGradient(level);

    populateLayers(widget, level);

    widget.scrollTo(level.properties['p1_x'], level.properties['p1_y'], 0.5);
}

function findFogEntityNearestPlayer(level: model.Level) {
    var p1_x = level.properties['p1_x'];
    var p1_y = level.properties['p1_y'];
    var fogs = _.filter(level.allEntities, e => model.entityName(e) == 'fog_trigger');
    var closestFog = _.min(fogs, e => util.distance(p1_x, p1_y, model.entityX(e), model.entityY(e)));
    return <any>closestFog !== Infinity ? closestFog : null;
}

function makeBackgroundGradient(level: model.Level) {
    if (level.currentFog) {
        var properties = model.entityProperties(level.currentFog);
        return makeSkyGradient(properties['gradient'], properties['gradient_middle']);
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
        widget.addLayer(new wiamap.TileLayer(
            new PrerenderedTileLayerDef(level, parseInt(layerID, 10), layer)));
    });

    _.each(_.range(1, 21), layerNum => {
        widget.addLayer(new PropsLayer(level, layerNum));
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

        var imageURL = '/static/level-assets/' + this.level.path
                + '/' + this.layerNum + '_' + scale.scale + '_' + realX + ',' + realY + '.png';
        return { texture: sprites.getTexture(imageURL, this.zindex).texture };
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

class PropsLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public stage = new util.ChunkContainer();
    private frame = 0;
    private layerParams: DustforceLayerParams;

    constructor(private level: model.Level, private layerNum: number) {
        this.layerParams = dustforceLayerParams(layerNum);
        this.def = { zindex: layerNum * 10 + 5, parallax: this.layerParams.parallax };

        if (this.level.currentFog)
            util.applyFog(this.stage, this.level.currentFog, this.layerNum);
    }

    public update(viewport: wiamap.Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        ++this.frame;

        this.stage.removeChildren();
        this.stage.position.x = -worldRect.left;
        this.stage.position.y = -worldRect.top;
        this.stage.scale.x = this.stage.scale.y = viewport.zoom;

        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            _.each(slice.props, prop => {
                if (model.propLayerGroup(prop) === this.layerNum)
                    this.drawProp(prop);
            });

            if (this.layerNum === 18) {
                _.each(slice.entities, entity => {
                    this.drawEntity(entity);
                });
            }
        });
    }

    private drawProp(prop: model.Prop) {
        var anim = sprites.propAnim(model.propSet(prop), model.propGroup(prop),
                          model.propIndex(prop), model.propPalette(prop));
        var sprite = sprites.loadSprite(anim.pathForFrame(this.frame), this.def.zindex);
        if (!sprite)
            return;

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

        // no idea wtf is up with these constants
        // it's still far from perfect, but it's better than just using the numbers as found
        propX -= Math.floor(propX / 286) * 32;
        propY += Math.floor(propY / 232) * 32;

        util.addDustforceSprite(this.stage, sprite, {
            posX: propX,
            posY: propY,
            scaleX: scaleX,
            scaleY: scaleY,
            rotation: model.propRotation(prop),
        });
    }

    private drawEntity(entity: model.Entity) {
        var entityName = model.entityName(entity);
        if (entityName.slice(0, 6) === 'enemy_')
            this.drawEnemy(entity);
        else if (entityName === 'giga_gate')
            this.drawGigaGate(entity);
        else if (entityName === 'level_door')
            this.drawLevelDoor(entity);
        else if (entityName === 'score_book')
            this.drawScoreBook(entity);
    }

    private getEntityOrAIPosition(entity: model.Entity) {
        var entityX: number, entityY: number;
        var ai = _.find(this.level.allEntities, e => model.entityName(e) === 'AI_controller' &&
                                                     model.entityProperties(e)['puppet_id'] === model.entityUid(entity));
        if (ai) {
            var entityPos: string[] = model.entityProperties(ai)['nodes'][0].split(/[,\s]+/);
            return _.map(entityPos, p => parseInt(p, 10));
        } else {
            return [model.entityX(entity), model.entityY(entity)];
        }
    }

    private drawEnemy(entity: model.Entity) {
        var entityName = model.entityName(entity);
        var anim = sprites.entityAnim(entityName);
        if (!anim)
            return;
        var sprite = sprites.loadSprite(anim.pathForFrame(this.frame), this.def.zindex);
        if (!sprite)
            return;

        var [entityX, entityY] = this.getEntityOrAIPosition(entity);

        util.addDustforceSprite(this.stage, sprite, {
            posX: entityX,
            posY: entityY,
        });
    }

    private drawGigaGate(entity: model.Entity) {
        var [entityX, entityY] = this.getEntityOrAIPosition(entity);
        var props = model.entityProperties(entity);
        var sprite = sprites.loadSprite('entities/nexus/interactables/redkeybarrierclosed_1_0001', this.def.zindex);
        if (!sprite)
            return;

        util.addDustforceSprite(this.stage, sprite, { posX: entityX, posY: entityY });
    }

    private drawLevelDoor(entity: model.Entity) {
        var entityX = model.entityX(entity);
        var entityY = model.entityY(entity);
        var props = model.entityProperties(entity);
        var doorSet = props['door_set'];
        var sprite = doorSet === 0 ? null : sprites.loadSprite('entities/nexus/door/closed' + doorSet + '_1_0001', this.def.zindex);

        var s: PIXI.DisplayObject;
        if (sprite) {
            s = util.addDustforceSprite(this.stage, sprite, { posX: entityX, posY: entityY });
        } else {
            s = util.transparentSprite(-78, -187, 156, 189);
            s.position.x = entityX;
            s.position.y = entityY;
            this.stage.addChild(s);
        }
        s.interactive = true;
        s.buttonMode = true;  // sets cursor to 'pointer'
        s.on('mousedown', () => {
            location.href = '/level/' + props['file_name'];
        });
    }

    private drawScoreBook(entity: model.Entity) {
        var entityX = model.entityX(entity);
        var entityY = model.entityY(entity);
        var props = model.entityProperties(entity);
        var sprite = sprites.loadSprite('entities/nexus/interactables/' + props['book_type'] + 'bookclosed_1_0001', this.def.zindex);
        if (!sprite)
            return;

        util.addDustforceSprite(this.stage, sprite, { posX: entityX, posY: entityY });
    }
}

class FilthLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public stage = new PIXI.Container();

    constructor(private level: model.Level) {
        this.def = { zindex: 198, parallax: 1 };
    }

    public update(viewport: wiamap.Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.stage.removeChildren();

        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            _.each(slice.filth, filth => {
                var filthX = model.filthX(filth);
                var filthY = model.filthY(filth);
                var tile = _.find(slice.tiles[19], t => model.tileX(t) === filthX && model.tileY(t) === filthY);
                var shape = model.tileShape(tile);
                model.eachFilthEdge(filth, shape, (edge, center, caps) => {
                    this.drawFilth(viewport, canvasRect, block, slice, filthX, filthY, edge, center, caps);
                });
            });
        });
    }

    private drawFilth(viewport: wiamap.Viewport, canvasRect: Rectangle,
                      block: model.Block, slice: model.Slice, filthX: number, filthY: number,
                      edge: model.TileEdge, center: number, caps: number) {
        var tileRect = model.tileWorldRect(block, slice, filthX, filthY);
        tileRect.left += edge.x1 * model.pixelsPerTile;
        tileRect.top += edge.y1 * model.pixelsPerTile;
        var screenRect = viewport.worldToScreenR(this, tileRect);

        var child = new PIXI.Container();
        child.position.x = screenRect.left - canvasRect.left;
        child.position.y = screenRect.top - canvasRect.top;
        child.scale.x = screenRect.width / model.pixelsPerTile;
        child.scale.y = screenRect.height / model.pixelsPerTile;
        child.rotation = edge.angle;
        this.stage.addChild(child);
        var length = edge.length * model.pixelsPerFilth;

        if (center) {
            var url = 'area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + (2 + (filthX + filthY) % 5) + '_0001';
            var sprite = sprites.loadSprite(url, this.def.zindex);
            if (sprite)
                util.addDustforceSprite(child, sprite, { scaleX: edge.length });
        }

        if (caps & 1) {
            var url = 'area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + 1 + '_0001';
            var sprite = sprites.loadSprite(url, this.def.zindex);
            if (sprite)
                util.addDustforceSprite(child, sprite);
        }

        if (caps & 2) {
            var url = 'area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + 7 + '_0001';
            var sprite = sprites.loadSprite(url, this.def.zindex);
            if (sprite)
                util.addDustforceSprite(child, sprite, { posX: length });
        }
    }
}

class FilthParticlesLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public stage = new PIXI.Container();
    private particles: Particle[] = [];

    constructor(private level: model.Level) {
        this.def = { zindex: 197, parallax: 1 };
    }

    public update(viewport: wiamap.Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        this.stage.removeChildren();

        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            _.each(slice.filth, filth => {
                var filthX = model.filthX(filth);
                var filthY = model.filthY(filth);
                var tile = _.find(slice.tiles[19], t => model.tileX(t) === filthX && model.tileY(t) === filthY);
                var shape = model.tileShape(tile);
                var tileRect = model.tileWorldRect(block, slice, filthX, filthY);
                model.eachFilthEdge(filth, shape, (edge, center, caps) => {
                    var particle = this.maybeCreateParticle(tileRect, edge, center);
                    if (particle)
                        this.particles.push(particle);
                });
            });
        });

        for (var pi = 0; pi < this.particles.length; ++pi) {
            var particle = this.particles[pi];
            if (!this.drawAndUpdateParticle(viewport, particle)) {
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

    private drawAndUpdateParticle(viewport: wiamap.Viewport, particle: Particle) {
        var sprite = sprites.loadSprite(particle.anim.pathForFrame(particle.frame), this.def.zindex);
        if (sprite) {
            var screenRect = viewport.screenRect();
            var screen = viewport.worldToScreenP(this, new Point(particle.x, particle.y));
            util.addDustforceSprite(this.stage, sprite, {
                posX: screen.x - screenRect.left,
                posY: screen.y - screenRect.top,
                scale: viewport.zoom,
                rotation: particle.rotation,
                alpha: particle.alpha,
            });
        }

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
    constructor(public spawnChance: number, public rotate: boolean, public drift: number[], public fade: number[], public sprites: sprites.SpriteAnim[]) { }
}

var filthParticleInfos = [
    null,
    new FilthParticleInfo(0.02, false, [-0.1, 0.1, 0, 0.2], null, [
        new sprites.SpriteAnim('area/mansion/particles/dust1_', 13, 6),
        new sprites.SpriteAnim('area/mansion/particles/dust2_', 8, 6),
        new sprites.SpriteAnim('area/mansion/particles/dust3_', 6, 6),
    ]),
    new FilthParticleInfo(0.02, true, [-0.5, 0.5, 0, 1], [30, 90, 8, 16], [
        new sprites.SpriteAnim('area/forest/particles/leafdrift1_', 15, 6),
        new sprites.SpriteAnim('area/forest/particles/leafdrift2_', 15, 6),
        new sprites.SpriteAnim('area/forest/particles/leafdrift3_', 15, 6),
        new sprites.SpriteAnim('area/forest/particles/leafspin1_', 5, 6),
        new sprites.SpriteAnim('area/forest/particles/leafspin2_', 5, 6),
        new sprites.SpriteAnim('area/forest/particles/leafspin3_', 5, 6),
    ]),
    new FilthParticleInfo(0.005, false, [-0.1, 0.1, 0, 0.2], null, [
        new sprites.SpriteAnim('area/city/particles/bigpuff_', 5, 12),
        new sprites.SpriteAnim('area/city/particles/medpuff_', 5, 12),
        new sprites.SpriteAnim('area/city/particles/littlepuff_', 8, 12),
        new sprites.SpriteAnim('area/city/particles/fly1_', 21, 6),
    ]),
    new FilthParticleInfo(0.01, false, [-0.1, 0.1, 0, 0.2], null, [
        new sprites.SpriteAnim('area/laboratory/particles/bigbubble_', 18, 6),
        new sprites.SpriteAnim('area/laboratory/particles/smallbubble_', 17, 6),
    ]),
    new FilthParticleInfo(0.025, true, [-0.5, 0.5, 0, 1], [120, 120, 8, 16], [
        new sprites.SpriteAnim('area/tutorial/particles/poly1_', 8, 6),
        new sprites.SpriteAnim('area/tutorial/particles/poly2_', 6, 6),
    ]),
];

class Particle {
    public frame = 1;
    public alpha = 1;

    constructor(public anim: sprites.SpriteAnim, public fadeOutStart: number, public fadeOutDuration: number, public x: number, public y: number, public rotation: number, public dx: number, public dy: number) { }
}

class StarsLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public stage = new util.ViewportParticleContainer();
    private universeBounds = new Rectangle(0, 0, 0, 0);

    constructor(private level: model.Level) {
        this.def = { zindex: 4, parallax: 0.02 };
        this.stage.blendMode = PIXI.BLEND_MODES.ADD;
        if (this.level.currentFog)
            util.applyFog(this.stage, this.level.currentFog, 0);
    }

    public update(viewport: wiamap.Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        // something is weird with the coordinates here, I have to figure that out before I can enable this
        //return;

        if (!this.level.currentFog) {
            this.stage.visible = false;
            return;
        }
        var fog = model.entityProperties(this.level.currentFog);

        this.stage.alpha = Math.max(0, Math.min(1, (viewport.zoom - 0.2) * 3.5));
        if (this.stage.alpha <= 0) {
            this.stage.visible = false;
            return;
        }

        this.stage.visible = true;
        this.stage.position.x = -worldRect.left - canvasRect.left;
        this.stage.position.y = -worldRect.top - canvasRect.top;
        this.stage.scale.x = this.stage.scale.y = viewport.zoom;

        this.expandUniverse(worldRect);

        var midpoint = worldRect.top + fog['gradient_middle'] * worldRect.height;
        for (var ci = 0, cl = this.stage.children.length; ci < cl; ++ci) {
            var child = this.stage.children[ci];
            var [topY, botY, topA, botA] = child.position.y < midpoint
                ? [worldRect.top, midpoint, fog['star_top'], fog['star_middle']]
                : [midpoint, worldRect.bottom(), fog['star_middle'], fog['star_bottom']];
            var pct = (child.position.y - topY) / (botY - topY);
            child.alpha = Math.max(0, Math.min(1, topA * (1 - pct) + botA * pct));
        }
    }

    private expandUniverse(area: Rectangle) {
        if (!this.level.currentFog)
            return;
        var galaxySize = 96;
        var minX = Math.floor(area.left / galaxySize) * galaxySize;
        var minY = Math.floor(area.top / galaxySize) * galaxySize;
        var maxX = Math.floor(area.right() / galaxySize) * galaxySize;
        var maxY = Math.floor(area.bottom() / galaxySize) * galaxySize;
        for (var galaxyX = minX; galaxyX < maxX; galaxyX += galaxySize)
        for (var galaxyY = minY; galaxyY < maxY; galaxyY += galaxySize) {
            if (this.universeBounds.contains(new Point(galaxyX, galaxyY)))
                continue;
            for (var s = 0; s < 4; ++s) {
                var x = galaxyX + Math.random() * galaxySize;
                var y = galaxyY + Math.random() * galaxySize;

                var texURL = sprites.spriteTextureURL('effects/stars/star_' + Math.floor(Math.random() * 3 + 1) + '_0001');
                var tex = sprites.getTexture(texURL, this.def.zindex);
                var sprite = new PIXI.Sprite(tex.texture);
                sprite.position.x = x;
                sprite.position.y = y;
                sprite.scale.x = sprite.scale.y = 2;
                sprite.scale
                this.stage.addChild(sprite);
            }
        }
        this.universeBounds = Rectangle.ltrb(
            Math.min(minX, this.universeBounds.left),
            Math.min(minY, this.universeBounds.top),
            Math.max(maxX, this.universeBounds.right()),
            Math.max(maxY, this.universeBounds.bottom()));
    }
}
