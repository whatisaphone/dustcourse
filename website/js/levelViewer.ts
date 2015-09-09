import { Rectangle } from './coords';
import * as model from './model';
import { Sprite, SpriteLoader } from './spriteLoader';
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
    var prerenderedTileLayers = _.map(level.prerenders, (layer, layerID) => {
        var layerNum = parseInt(layerID, 10);
        var layerParams = dustforceLayerParams(layerNum);
        var scales = _.map(layer.scales, s =>
            new PrerenderedTileScale(s.scale, s.tile_size, layerParams.scale, s.tiles));
        var ret = new wiamap.TileLayer(
            new PrerenderedTileLayerDef(level, layerID, scales, layerNum, layerParams.parallax));
        widget.addLayer(ret);
        return ret;
    });

    widget.addLayer(new FilthLayer(level));
}

function dustforceLayerParams(layerNum: number) {
    var parallax = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95][layerNum] || 1;
    return {
        parallax: parallax,
        scale: layerNum <= 5 ? 1 : parallax,
    }
}

class PrerenderedTileLayerDef implements wiamap.TileLayerDef {
    public type = "tile";

    constructor(private level: model.Level, public id: string,
        public scales: wiamap.TileScale[], public zindex: number, public parallax: number) { }

    public getTile(scale: PrerenderedTileScale, x: number, y: number): wiamap.Tile {
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

class PrerenderedTileScale implements wiamap.TileScale {
    public tileWidth: number;
    public tileHeight: number;

    constructor(public scale: number, public tileSize: [number, number], public layerScale: number, public tiles: [number, number][]) {
        this.tileWidth = tileSize[0] * layerScale;
        this.tileHeight = tileSize[1] * layerScale;
    }
}

class FilthLayer implements wiamap.Layer {
    public def: wiamap.LayerDef;
    public callback: wiamap.LayerCallback;
    private sprites = new SpriteLoader();

    constructor(private level: model.Level) {
        this.def = { id: 'filth', zindex: 19, parallax: 1 };
    }

    public draw(viewport: wiamap.Viewport, container: PIXI.Container, canvasRect: Rectangle, worldRect: Rectangle) {
        model.eachIntersectingSlice(this.level, worldRect, (block, slice) => {
            _.each(slice.filth, filth => {
                var filthX = model.filthX(filth);
                var filthY = model.filthY(filth);
                var tile = _.find(slice.tiles[19], t => model.tileX(t) === filthX && model.tileY(t) === filthY);
                var shape = model.tileShape(tile);
                model.eachFilthEdge(filth, shape, (edge, center, caps) => {
                    this.drawFilth(viewport, container, canvasRect, block, slice, filthX, filthY, edge, center, caps);
                });
            });
        });
    }

    private drawFilth(viewport: wiamap.Viewport, container: PIXI.Container, canvasRect: Rectangle,
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
        container.addChild(child);
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
    scaleX?: number;
}

function createDustforceSprite(sprite: Sprite, options?: DustforceSpriteOptions) {
    var s = PIXI.Sprite.fromImage(sprite.imageURL);
    s.position.x = sprite.hitbox.left + (options ? (options.posX || 0) : 0);
    s.position.y = sprite.hitbox.top + (options ? (options.posY || 0) : 0);
    s.scale.x = options ? (options.scaleX || 1) : 1;
    return s;
}
