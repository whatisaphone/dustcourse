import { Rectangle } from './coords';
import * as util from './util';
import * as wiamap from './wiamap';

export function init(manifest: LevelManifest) {
    var widget = new wiamap.Widget();
    populateLayers(widget, manifest);

    var el = widget.getElement();
    el.setAttribute('class', 'wiamap-stage');
    document.body.appendChild(el);

    var fogEntity = getFogEntityNearestPlayer(manifest);
    if (fogEntity) {
        el.style.background = 'linear-gradient(' +
            util.convertIntToColorRGB(fogEntity.properties['gradient'][0]) + ',' +
            util.convertIntToColorRGB(fogEntity.properties['gradient'][1]) + ' ' +
                (fogEntity.properties['gradient_middle'] * 100) + '%,' +
            util.convertIntToColorRGB(fogEntity.properties['gradient'][2]) + ')';
    } else {
        el.style.background = 'linear-gradient(' +
            util.convertIntToColorRGB(manifest.properties['cp_background_colour'][0]) + ',' +
            util.convertIntToColorRGB(manifest.properties['cp_background_colour'][1]) + ' ' +
                (manifest.properties['cp_background_middle'] * 100) + '%,' +
            util.convertIntToColorRGB(manifest.properties['cp_background_colour'][2]) + ')';
    }

    widget.scrollTo(manifest.properties['p1_x'], manifest.properties['p1_y'], 0.5);
}

function populateLayers(widget: wiamap.Widget, manifest: LevelManifest) {
    var fogEntity = getFogEntityNearestPlayer(manifest);
    if (fogEntity)
        widget.addLayer(new StarsLayer({ id: 'sky', zindex: 0, parallax: 0.02 }, fogEntity.properties));

    _.each(manifest.layers, (layer, layerID) => {
        var layerNum = parseInt(layerID, 10);
        var parallax = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95][layerNum] || 1;
        var layerScale = layerNum <= 5 ? 1 : parallax;
        var scales = _.map(layer.scales, s => new LevelWiamapTileScale(s.scale, s.tile_size, layerScale, s.tiles));
        var layerDef = new LevelWiamapTileLayerDef(manifest, layerID, scales, layerNum, parallax);
        widget.addLayer(new wiamap.TileLayer(layerDef));
    });
}

function getFogEntityNearestPlayer(manifest: LevelManifest) {
    var ret = _.min(_.filter(manifest.entities, e => e.kind == 'fog_trigger'), e => Math.pow(manifest.properties['p1_x'] - e.x, 2) + Math.pow(manifest.properties['p1_y'] - e.y, 2));
    return <any>ret !== Infinity ? ret : null;
}

interface LevelManifest {
    path: string;
    properties: { [key: string]: any };
    layers: { [key: string]: LevelManifestLayer };
    entities: { kind: string, x: number, y: number, properties: { [key: string]: any } }[];
}

interface LevelManifestLayer {
    scales: LevelManifestTileScale[];
}

interface LevelManifestTileScale {
    scale: number;
    tile_size: [number, number];
    tiles: [number, number][];
}

class LevelWiamapTileLayerDef implements wiamap.TileLayerDef {
    public type = "tile";

    constructor(private manifest: LevelManifest, public id: string,
        public scales: wiamap.TileScale[], public zindex: number, public parallax: number) { }

    public getTile(scale: LevelWiamapTileScale, x: number, y: number): wiamap.Tile {
        var realX = Math.round(x / scale.layerScale);
        var realY = Math.round(y / scale.layerScale);
        if (!_.find(scale.tiles, t => t[0] === realX && t[1] === realY))
            return;

        return {
            imageURL: '/static/level-assets/' + this.manifest.path
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
    public callback: wiamap.LayerCallback;

    constructor(public def: wiamap.LayerDef, private fog: { [key: string]: any }) { }

    public draw(viewport: wiamap.Viewport, context: CanvasRenderingContext2D, canvasRect: Rectangle, worldRect: Rectangle) {
        context.fillStyle = 'white';  // TODO: blend with white using fog_colour and fog_per
        var midpoint = this.fog['gradient_middle'] * viewport.size.height;
        for (var s = 0; s < 500; ++s) {
            var x = Math.random() * canvasRect.width;
            var y = Math.random() * canvasRect.height;
            var [topY, botY, topA, botA] = canvasRect.top + y < midpoint
                ? [0, midpoint, this.fog['star_top'], this.fog['star_middle']]
                : [midpoint, viewport.size.height, this.fog['star_middle'], this.fog['star_bottom']];
            var pct = (canvasRect.top + y - topY) / (botY - topY);
            context.globalAlpha = topA * pct + botA * (1 - pct);
            // TODO: glowing circle instead of flat square
            context.fillRect(x, y, 2, 2);
        }
    }
}
