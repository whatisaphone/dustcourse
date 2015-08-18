import { Point, Rectangle } from './coords';
import * as model from './model';
import { SpriteAnim, SpriteLoader, entityAnim, propAnim } from './spriteLoader';
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
    var closestFog = _.min(fogs, e => Math.pow(p1_x - model.entityX(e), 2) + Math.pow(p1_y - model.entityY(e), 2));
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
        util.convertIntToColorRGB(colors[0]) + ',' +
        util.convertIntToColorRGB(colors[1]) + ' ' + (middle * 100) + '%,' +
        util.convertIntToColorRGB(colors[2]) + ')';
}

function populateLayers(widget: wiamap.Widget, level: model.Level) {
    widget.addLayer(new StarsLayer(level));

    var prerenderLayers = _.map(level.prerenders, (layer, layerID) => {
        var layerNum = parseInt(layerID, 10);
        var parallax = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95][layerNum] || 1;
        var layerScale = layerNum <= 5 ? 1 : parallax;
        var scales = _.map(layer.scales, s => new LevelWiamapTileScale(s.scale, s.tile_size, layerScale, s.tiles));
        var layerDef = new LevelWiamapTileLayerDef(level, layerID, scales, layerNum, parallax);
        var ret = new wiamap.TileLayer(layerDef);
        widget.addLayer(ret);
        return ret;
    });

    _.each(_.range(1, 21), layerNum => {
        var layer = _.find(prerenderLayers, l => parseInt(l.def.id, 10) === layerNum);
        if (layer)
            new PropsAnimator(level, widget, layerNum, layer);
    });

    var filthLayer = new FilthLayer(level);
    widget.addLayer(filthLayer);
    new FilthParticles(level, widget, filthLayer);
}


class LevelWiamapTileLayerDef implements wiamap.TileLayerDef {
    public type = "tile";

    constructor(private level: model.Level, public id: string,
        public scales: wiamap.TileScale[], public zindex: number, public parallax: number) { }

    public getTile(scale: LevelWiamapTileScale, x: number, y: number): wiamap.Tile {
        var realX = Math.round(x / scale.layerScale);
        var realY = Math.round(y / scale.layerScale);
        if (!_.find(scale.tiles, t => t[0] === realX && t[1] === realY))
            return;

        return {
            imageURL: '/static/level-assets/' + this.level.path
                + '/' + this.id + '_' + scale.scale + '_' + realX + ',' + realY + '.png',
        };
    }
}

class LevelWiamapTileScale implements wiamap.TileScale {
    public tileWidth: number;
    public tileHeight: number;

    constructor(public scale: number, public tileSize: [number, number], public layerScale: number, public tiles: [number, number][]) {
        this.tileWidth = tileSize[0] * layerScale;
        this.tileHeight = tileSize[1] * layerScale;
    }
}

class StarsLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public callback: wiamap.LayerCallback;

    constructor(private level: model.Level) {
        this.def = { id: 'stars', zindex: 0, parallax: 0.025 };
    }

    public draw(viewport: wiamap.Viewport, context: CanvasRenderingContext2D, canvasRect: Rectangle, worldRect: Rectangle) {
        if (!this.level.currentFog)
            return;
        var fog = model.entityProperties(this.level.currentFog);
        context.fillStyle = 'white';  // TODO: blend with white using fog_colour and fog_per
        var midpoint = fog['gradient_middle'] * viewport.size.height;
        for (var s = 0; s < 500; ++s) {
            var x = Math.random() * canvasRect.width;
            var y = Math.random() * canvasRect.height;
            var [topY, botY, topA, botA] = canvasRect.top + y < midpoint
                ? [0, midpoint, fog['star_top'], fog['star_middle']]
                : [midpoint, viewport.size.height, fog['star_middle'], fog['star_bottom']];
            var pct = (canvasRect.top + y - topY) / (botY - topY);
            context.globalAlpha = Math.max(0, Math.min(1, topA * (1 - pct) + botA * pct));
            // TODO: glowing circle instead of flat square
            context.fillRect(x, y, 2, 2);
        }

        if (this.level.currentFog)
            applyFog(context, canvasRect.width, canvasRect.height, this.level.currentFog, 0);
    }
}

class FilthLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public callback: wiamap.LayerCallback;
    private sprites = new SpriteLoader();

    constructor(private level: model.Level) {
        this.def = { id: 'filth', zindex: 19, parallax: 1 };
    }

    public draw(viewport: wiamap.Viewport, context: CanvasRenderingContext2D, canvasRect: Rectangle, worldRect: Rectangle) {
        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            _.each(slice.filth, filth => {
                var filthX = model.filthX(filth);
                var filthY = model.filthY(filth);
                var tile = _.find(slice.tiles[19], t => model.tileX(t) === filthX && model.tileY(t) === filthY);
                var shape = model.tileShape(tile);
                model.eachFilthEdge(filth, shape, (edge, center, caps) => {
                    this.drawFilth(viewport, context, canvasRect, block, slice, filthX, filthY, edge, center, caps);
                });
            });
        });
    }

    private drawFilth(viewport: wiamap.Viewport, context: CanvasRenderingContext2D, canvasRect: Rectangle,
                      block: model.Block, slice: model.Slice, filthX: number, filthY: number,
                      edge: model.TileEdge, center: number, caps: number) {
        context.save();
        var tileRect = model.tileWorldRect(block, slice, filthX, filthY);
        tileRect.left += edge.x1 * model.pixelsPerTile;
        tileRect.top += edge.y1 * model.pixelsPerTile;
        var screenRect = viewport.worldToScreenR(this, tileRect);
        context.translate(screenRect.left - canvasRect.left, screenRect.top - canvasRect.top);
        context.scale(screenRect.width / model.pixelsPerTile, screenRect.height / model.pixelsPerTile);
        context.rotate(edge.angle);
        var length = edge.length * 50;

        if (center) {
            var url = '/static/sprites/area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + (2 + (filthX + filthY) % 5) + '_0001';
            var sprite = this.sprites.get(url, () => { /* TODO: somehow queue up this.callback.redrawArea(this, worldRect);*/ });
            if (sprite)
                context.drawImage(sprite.image, sprite.hitbox.left, sprite.hitbox.top, length, sprite.hitbox.height);
        }

        if (caps & 1) {
            var url = '/static/sprites/area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + 1 + '_0001';
            var sprite = this.sprites.get(url, () => { /* TODO: somehow queue up this.callback.redrawArea(this, worldRect);*/ });
            if (sprite)
                context.drawImage(sprite.image, sprite.hitbox.left, sprite.hitbox.top);
        }

        if (caps & 2) {
            var url = '/static/sprites/area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + 7 + '_0001';
            var sprite = this.sprites.get(url, () => { /* TODO: somehow queue up this.callback.redrawArea(this, worldRect);*/ });
            if (sprite)
                context.drawImage(sprite.image, length + sprite.hitbox.left, sprite.hitbox.top);
        }

        context.restore();
    }
}

class FilthParticles {
    private element: HTMLCanvasElement;
    private sprites = new SpriteLoader();
    private particles: Particle[] = [];

    constructor(private level: model.Level, private map: wiamap.Widget, private filthLayer: FilthLayer) {
        this.element = document.createElement('canvas');
        this.element.className = 'map-overlay';
        document.body.appendChild(this.element);

        requestAnimationFrame(() => this.animationFrame());
    }

    private animationFrame() {
        var canvasWidth = this.element.clientWidth;
        var canvasHeight = this.element.clientHeight;
        if (this.element.width !== canvasWidth || this.element.height !== canvasHeight) {
            this.element.width = canvasWidth;
            this.element.height = canvasHeight;
        }

        var context = this.element.getContext('2d');
        context.clearRect(0, 0, canvasWidth, canvasHeight);

        var worldRect = this.map.viewport.screenToWorldR(this.filthLayer, this.map.viewport.screenRect());
        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            _.each(slice.filth, filth => {
                var filthX = model.filthX(filth);
                var filthY = model.filthY(filth);
                var tile = _.find(slice.tiles[19], t => model.tileX(t) === filthX && model.tileY(t) === filthY);
                var shape = model.tileShape(tile);
                var tileRect = model.tileWorldRect(block, slice, filthX, filthY);
                model.eachFilthEdge(filth, shape, (edge, center, caps) => {
                    var particle = this.createParticle(tileRect, edge, center);
                    if (particle) {
                        this.particles.push(particle);
                    }
                });
            });
        });

        for (var pi = 0; pi < this.particles.length; ++pi) {
            var particle = this.particles[pi];
            var sprite = this.sprites.get(particle.anim.urlPrefix + (Math.floor(particle.frame / particle.anim.frameDuration60) % particle.anim.frameCount + 1) + '_0001', () => { });
            if (sprite) {
                context.save();
                var screenRect = this.map.viewport.screenRect();
                var screen = this.map.viewport.worldToScreenP(this.filthLayer, new Point(particle.x, particle.y));
                context.translate(screen.x - screenRect.left, screen.y - screenRect.top);
                context.rotate(particle.rotation);
                context.scale(this.map.viewport.zoom, this.map.viewport.zoom);
                context.translate(sprite.hitbox.left, sprite.hitbox.top);
                context.globalAlpha = particle.alpha;
                context.drawImage(sprite.image, 0, 0);
                context.restore();
            }
            ++particle.frame;
            particle.x += particle.dx;
            particle.y += particle.dy;
            if (particle.frame >= particle.fadeOutStart) {
                particle.alpha -= 1 / particle.fadeOutDuration;
                if (particle.alpha <= 0) {
                    this.particles.splice(pi, 1);
                    --pi;
                }
            }
        }

        requestAnimationFrame(() => this.animationFrame());
    }

    private createParticle(tileRect: Rectangle, tileEdge: model.TileEdge, spriteSet: number) {
        if (spriteSet === 1) {
            if (Math.random() < 0.02)
                return this.createDust(tileRect, tileEdge);
        } else if (spriteSet === 2) {
            if (Math.random() < 0.02)
                return this.createLeaf(tileRect, tileEdge);
        } else if (spriteSet === 3) {
            if (Math.random() < 0.0075)
                return this.createTrash(tileRect, tileEdge);
        } else if (spriteSet === 4) {
            if (Math.random() < 0.01)
                return this.createSlime(tileRect, tileEdge);
        } else if (spriteSet === 5) {
            if (Math.random() < 0.025)
                return this.createPolygon(tileRect, tileEdge);
        }
    }

    private generateParticleDrift(angle: number, parMin: number, parMax: number, perpMin: number, perpMax: number) {
        var par = parMin + Math.random() * (parMax - parMin);
        var perp = perpMin + Math.random() * (perpMax - perpMin);
        var x = Math.cos(angle) * par + Math.sin(angle) * perp;
        var y = Math.sin(angle) * par + Math.cos(angle) * perp;
        return [x, -y];  // negative y, because converting from cartesian coords to computer coords
    }

    private createLeaf(tileRect: Rectangle, tileEdge: model.TileEdge) {
        var anim = [
            new SpriteAnim('/static/sprites/area/forest/particles/leafdrift1_', 15, 6),
            new SpriteAnim('/static/sprites/area/forest/particles/leafdrift2_', 15, 6),
            new SpriteAnim('/static/sprites/area/forest/particles/leafdrift3_', 15, 6),
            new SpriteAnim('/static/sprites/area/forest/particles/leafspin1_', 5, 6),
            new SpriteAnim('/static/sprites/area/forest/particles/leafspin2_', 5, 6),
            new SpriteAnim('/static/sprites/area/forest/particles/leafspin3_', 5, 6),
        ][Math.floor(Math.random() * 6)];
        var x = tileRect.left + (tileEdge.x1 + Math.random() * (tileEdge.x2 - tileEdge.x1)) * model.pixelsPerTile;
        var y = tileRect.top + (tileEdge.y1 + Math.random() * (tileEdge.y2 - tileEdge.y1)) * model.pixelsPerTile;
        var theta = Math.random() * Math.PI * 2;
        var [dx, dy] = this.generateParticleDrift(tileEdge.angle, -0.5, 0.5, 0, 1);
        return new Particle(anim, 30 + Math.random() * 90, 8 + Math.random() * 16, x, y, theta, dx, dy);
    }

    private createDust(tileRect: Rectangle, tileEdge: model.TileEdge) {
        var anim = [
            new SpriteAnim('/static/sprites/area/mansion/particles/dust1_', 13, 6),
            new SpriteAnim('/static/sprites/area/mansion/particles/dust2_', 8, 6),
            new SpriteAnim('/static/sprites/area/mansion/particles/dust3_', 6, 6),
        ][Math.floor(Math.random() * 3)];
        var x = tileRect.left + (tileEdge.x1 + Math.random() * (tileEdge.x2 - tileEdge.x1)) * model.pixelsPerTile;
        var y = tileRect.top + (tileEdge.y1 + Math.random() * (tileEdge.y2 - tileEdge.y1)) * model.pixelsPerTile;
        var [dx, dy] = this.generateParticleDrift(tileEdge.angle, -0.1, 0.1, 0, 0.2);
        return new Particle(anim, anim.frameCount * anim.frameDuration60, 1, x, y, 0, dx, dy);
    }

    private createTrash(tileRect: Rectangle, tileEdge: model.TileEdge) {
        var anim = [
            new SpriteAnim('/static/sprites/area/city/particles/bigpuff_', 5, 12),
            new SpriteAnim('/static/sprites/area/city/particles/medpuff_', 5, 12),
            new SpriteAnim('/static/sprites/area/city/particles/littlepuff_', 8, 12),
            new SpriteAnim('/static/sprites/area/city/particles/fly1_', 21, 6),
        ][Math.floor(Math.random() * 4)];
        var x = tileRect.left + (tileEdge.x1 + Math.random() * (tileEdge.x2 - tileEdge.x1)) * model.pixelsPerTile;
        var y = tileRect.top + (tileEdge.y1 + Math.random() * (tileEdge.y2 - tileEdge.y1)) * model.pixelsPerTile;
        var [dx, dy] = this.generateParticleDrift(tileEdge.angle, -0.1, 0.1, 0, 0.2);
        return new Particle(anim, anim.frameCount * anim.frameDuration60, 1, x, y, 0, dx, dy);
    }

    private createSlime(tileRect: Rectangle, tileEdge: model.TileEdge) {
        var anim = [
            new SpriteAnim('/static/sprites/area/laboratory/particles/bigbubble_', 18, 6),
            new SpriteAnim('/static/sprites/area/laboratory/particles/smallbubble_', 17, 6),
        ][Math.floor(Math.random() * 2)];
        var x = tileRect.left + (tileEdge.x1 + Math.random() * (tileEdge.x2 - tileEdge.x1)) * model.pixelsPerTile;
        var y = tileRect.top + (tileEdge.y1 + Math.random() * (tileEdge.y2 - tileEdge.y1)) * model.pixelsPerTile;
        var [dx, dy] = this.generateParticleDrift(tileEdge.angle, -0.1, 0.1, 0, 0.2);
        return new Particle(anim, anim.frameCount * anim.frameDuration60, 1, x, y, 0, dx, dy);
    }

    private createPolygon(tileRect: Rectangle, tileEdge: model.TileEdge) {
        var anim = [
            new SpriteAnim('/static/sprites/area/tutorial/particles/poly1_', 8, 6),
            new SpriteAnim('/static/sprites/area/tutorial/particles/poly2_', 6, 6),
        ][Math.floor(Math.random() * 2)];
        var x = tileRect.left + (tileEdge.x1 + Math.random() * (tileEdge.x2 - tileEdge.x1)) * model.pixelsPerTile;
        var y = tileRect.top + (tileEdge.y1 + Math.random() * (tileEdge.y2 - tileEdge.y1)) * model.pixelsPerTile;
        var theta = Math.random() * Math.PI * 2;
        var [dx, dy] = this.generateParticleDrift(tileEdge.angle, -0.5, 0.5, 0, 1);
        return new Particle(anim, 120 + Math.random() * 120, 8 + Math.random() * 16, x, y, theta, dx, dy);
    }
}

class Particle {
    public frame = 1;
    public alpha = 1;

    constructor(public anim: SpriteAnim, public fadeOutStart: number, public fadeOutDuration: number, public x: number, public y: number, public rotation: number, public dx: number, public dy: number) { }
}

class PropsAnimator {
    private element: HTMLCanvasElement;
    private sprites = new SpriteLoader();
    private frame = 0;

    constructor(private level: model.Level, private map: wiamap.Widget, private layerNum: number, private tileLayer: wiamap.Layer) {
        this.element = document.createElement('canvas');
        this.element.className = 'map-overlay';
        document.body.appendChild(this.element);

        requestAnimationFrame(() => this.animationFrame());
    }

    private animationFrame() {
        var canvasWidth = this.element.clientWidth;
        var canvasHeight = this.element.clientHeight;
        if (this.element.width !== canvasWidth || this.element.height !== canvasHeight) {
            this.element.width = canvasWidth;
            this.element.height = canvasHeight;
        }

        ++this.frame;

        var context = this.element.getContext('2d');
        context.clearRect(0, 0, canvasWidth, canvasHeight);

        var worldRect = this.map.viewport.screenToWorldR(this.tileLayer, this.map.viewport.screenRect());
        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            _.each(slice.props, prop => {
                if (model.propLayerGroup(prop) === this.layerNum)
                    this.drawProp(context, prop);
            });

            if (this.layerNum === 19) {  // TODO: this is actually 18, not 19. needs canvas created above. quick fix for later.
                _.each(slice.entities, entity => {
                    this.drawEntity(context, entity);
                });
            }
        });

        if (this.level.currentFog)
            applyFog(context, canvasWidth, canvasHeight, this.level.currentFog, this.layerNum);

        requestAnimationFrame(() => this.animationFrame());
    }

    private drawProp(context: CanvasRenderingContext2D, prop: model.Prop) {
        var anim = propAnim(model.propSet(prop), model.propGroup(prop),
                          model.propIndex(prop), model.propPalette(prop));
        var sprite = this.sprites.get(anim.pathForFrame(this.frame), () => { });
        if (!sprite)
            return;

        context.save();
        var propX = model.propX(prop);
        var propY = model.propY(prop);

        propX -= Math.floor(propX / 286) * 32;
        propY += Math.floor(propY / 232) * 32;
        // TODO: rotation and scaling

        var canvasRect = this.map.viewport.screenRect();
        var screenRect = this.map.viewport.worldToScreenP(this.tileLayer, new Point(propX, propY));
        context.translate(screenRect.x - canvasRect.left, screenRect.y - canvasRect.top);
        context.scale(this.map.viewport.zoom, this.map.viewport.zoom);
        context.drawImage(sprite.image, sprite.hitbox.left, sprite.hitbox.top);
        context.restore();
    }

    private drawEntity(context: CanvasRenderingContext2D, entity: model.Entity) {
        var anim = entityAnim(model.entityName(entity));
        if (!anim)
            return;
        var sprite = this.sprites.get(anim.pathForFrame(this.frame), () => { });
        if (!sprite)
            return;

        var entityX = model.entityX(entity);
        var entityY = model.entityY(entity);

        context.save();
        var canvasRect = this.map.viewport.screenRect();
        var screenRect = this.map.viewport.worldToScreenP(this.tileLayer, new Point(entityX, entityY));
        context.translate(screenRect.x - canvasRect.left, screenRect.y - canvasRect.top);
        context.scale(this.map.viewport.zoom, this.map.viewport.zoom);
        context.drawImage(sprite.image, sprite.hitbox.left, sprite.hitbox.top);
        context.restore();
    }
}

function applyFog(context: CanvasRenderingContext2D, width: number, height: number, fog: model.Entity, layerNum: number) {
    var fogProps = model.entityProperties(fog);
    context.save();
    context.fillStyle = util.convertIntToColorRGB(fogProps['fog_colour'][layerNum]);
    context.globalAlpha = fogProps['fog_per'][layerNum];
    context.globalCompositeOperation = 'source-atop';
    context.fillRect(0, 0, width, height);
    context.restore();
}
