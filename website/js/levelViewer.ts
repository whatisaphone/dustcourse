import { Point, Rectangle } from './coords';
import * as model from './model';
import { Sprite, SpriteLoader, entityAnim, propAnim } from './spriteLoader';
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
        util.convertIntToColorRGB(colors[0]) + ',' +
        util.convertIntToColorRGB(colors[1]) + ' ' + (middle * 100) + '%,' +
        util.convertIntToColorRGB(colors[2]) + ')';
}

function populateLayers(widget: wiamap.Widget, level: model.Level) {
    _.each(level.prerenders, (layer, layerID) => {
        widget.addLayer(new wiamap.TileLayer(
            new PrerenderedTileLayerDef(level, parseInt(layerID, 10), layer)));
    });

    _.each(_.range(1, 21), layerNum => {
        widget.addLayer(new PropsLayer(level, layerNum));
    });

    widget.addLayer(new FilthLayer(level));
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
        this.zindex = layerNum * 10;
        this.parallax = layerParams.parallax;
        this.scales = _.map(layer.scales, s =>
            new PrerenderedTileScale(s.scale, s.tile_size, layerParams.scale, s.tiles));
    }

    public getTile(scale: PrerenderedTileScale, x: number, y: number): wiamap.Tile {
        var realX = Math.round(x / scale.layerScale);
        var realY = Math.round(y / scale.layerScale);
        if (!_.find(scale.tiles, t => t[0] === realX && t[1] === realY))
            return;

        return {
            imageURL: '/static/level-assets/' + this.level.path
                + '/' + this.layerNum + '_' + scale.scale + '_' + realX + ',' + realY + '.png',
        };
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
    public stage = new PIXI.Container();
    private frame = 0;
    private sprites = new SpriteLoader();
    private layerParams: DustforceLayerParams;

    constructor(private level: model.Level, private layerNum: number) {
        this.layerParams = dustforceLayerParams(layerNum);
        this.def = { zindex: layerNum * 10, parallax: this.layerParams.parallax };

        if (this.level.currentFog)
            applyFog(this.stage, this.level.currentFog, this.layerNum);
    }

    public update(viewport: wiamap.Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        ++this.frame;

        this.stage.removeChildren();

        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            _.each(slice.props, prop => {
                if (model.propLayerGroup(prop) === this.layerNum)
                    this.drawProp(viewport, prop);
            });

            if (this.layerNum === 18) {
                _.each(slice.entities, entity => {
                    var ai = _.find(slice.entities, e => model.entityName(e) === 'AI_controller' &&
                                                         model.entityProperties(e)['puppet_id'] === model.entityUid(entity));
                    this.drawEntity(viewport, entity, ai);
                });
            }
        });
    }

    private drawProp(viewport: wiamap.Viewport, prop: model.Prop) {
        var anim = propAnim(model.propSet(prop), model.propGroup(prop),
                          model.propIndex(prop), model.propPalette(prop));
        var sprite = this.sprites.get(anim.pathForFrame(this.frame));
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
        // TODO: rotation and scaling

        var canvasRect = viewport.screenRect();
        var screenRect = viewport.worldToScreenP(this, new Point(propX, propY));

        this.stage.addChild(createDustforceSprite(sprite, {
            posX: screenRect.x - canvasRect.left,
            posY: screenRect.y - canvasRect.top,
            scaleX: viewport.zoom * scaleX,
            scaleY: viewport.zoom * scaleY,
            rotation: model.propRotation(prop),
        }));
    }

    private drawEntity(viewport: wiamap.Viewport, entity: model.Entity, ai: model.Entity) {
        var anim = entityAnim(model.entityName(entity));
        if (!anim)
            return;
        var sprite = this.sprites.get(anim.pathForFrame(this.frame));
        if (!sprite)
            return;

        var entityX: number, entityY: number;
        if (ai) {
            [entityX, entityY] = model.entityProperties(ai)['nodes'][0].split(/[,\s]+/);
        } else {
            entityX = model.entityX(entity);
            entityY = model.entityY(entity);
        }

        var canvasRect = viewport.screenRect();
        var screenRect = viewport.worldToScreenP(this, new Point(entityX, entityY));

        this.stage.addChild(createDustforceSprite(sprite, {
            posX: screenRect.x - canvasRect.left,
            posY: screenRect.y - canvasRect.top,
            scale: viewport.zoom,
        }));
    }
}

class FilthLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public stage = new PIXI.Container();
    private sprites = new SpriteLoader();

    constructor(private level: model.Level) {
        this.def = { zindex: 191, parallax: 1 };
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
            var sprite = this.sprites.get(url);
            if (sprite)
                child.addChild(createDustforceSprite(sprite, { scaleX: edge.length }));
        }

        if (caps & 1) {
            var url = 'area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + 1 + '_0001';
            var sprite = this.sprites.get(url);
            if (sprite)
                child.addChild(createDustforceSprite(sprite));
        }

        if (caps & 2) {
            var url = 'area/' + model.spriteSets[center & 7] + '/filth/' + (center & 8 ? 'spikes' : 'filth') + '_' + 7 + '_0001';
            var sprite = this.sprites.get(url);
            if (sprite)
                child.addChild(createDustforceSprite(sprite, { posX: length }));
        }
    }
}

interface DustforceSpriteOptions {
    posX?: number;
    posY?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
}

class DustforceSprite extends PIXI.Sprite {
    constructor(private sprite: Sprite) {
        super(PIXI.Texture.fromImage(sprite.imageURL));
    }

    // bit of a HACK here, this method isn't documented. but we need to stack transforms
    // in a different order than pixi does, so this seems to be the logical solution
    public updateTransform() {
        this.worldTransform.identity()
            .translate(this.sprite.hitbox.left, this.sprite.hitbox.top)
            .rotate(this.rotation)
            .scale(this.scale.x, this.scale.y)
            .translate(this.position.x, this.position.y)
            .prepend(this.parent.worldTransform);

        // do some other stuff that super.updateTransform does
        this.worldAlpha = this.alpha * this.parent.worldAlpha;
        this._currentBounds = null;
    }
}

function createDustforceSprite(sprite: Sprite, options?: DustforceSpriteOptions) {
    var s = new DustforceSprite(sprite);
    s.position.x = options ? (options.posX || 0) : 0;
    s.position.y = options ? (options.posY || 0) : 0;
    s.scale.x = options ? (options.scaleX || options.scale || 1) : 1;
    s.scale.y = options ? (options.scaleY || options.scale || 1) : 1;
    s.rotation = options ? (options.rotation || 0) : 0;
    return s;
}

function applyFog(obj: PIXI.DisplayObject, fog: model.Entity, layerNum: number) {
    var fogProps = model.entityProperties(fog);
    var [r, g, b] = util.convertIntToRGB(fogProps['fog_colour'][layerNum]);
    var p = fogProps['fog_per'][layerNum];
    var cacheKey = `${r}_${g}_${b}_${p}`;
    var f = new PIXI.filters.ColorMatrixFilter();
    f.matrix = [
        1 - p, 0, 0, r * p, 0,
        0, 1 - p, 0, g * p, 0,
        0, 0, 1 - p, b * p, 0,
        0, 0, 0, 1, 0,
    ];
    obj.filters = [f];
}
