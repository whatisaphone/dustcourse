import * as wiamap from './wiamap';

export function init(manifest: LevelManifest) {
    var widget = new wiamap.Widget();
    populateLayers(widget, manifest);

    var el = widget.getElement();
    el.setAttribute('class', 'wiamap-stage');
    document.body.appendChild(el);

    // TODO: draw gradient and stars in a background layer instead of just using a color
    var bg = Math.abs(manifest.properties['cp_background_colour'][1]);
    (<any>el).style.background = '#' + ((bg & 0xff) << 16 | bg & 0xff00 | (bg & 0xff0000) >> 16).toString(16);

    widget.scrollTo(manifest.properties['p1_x'], manifest.properties['p1_y'], 0.5);
}

function populateLayers(widget: wiamap.Widget, manifest: LevelManifest) {
    _.each(manifest.layers, (layer, layerID) => {
        var layerNum = parseInt(layerID, 10);
        var parallax = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95][layerNum] || 1;
        var layerScale = layerNum <= 5 ? 1 : parallax;
        var scales = _.map(layer.scales, s => new LevelWiamapTileScale(s.scale, s.tile_size, layerScale, s.tiles));
        widget.addLayer(new LevelWiamapTileLayerDef(manifest, layerID, scales, layerNum, parallax));
    });
}

interface LevelManifest {
    path: string;
    properties: { [key: string]: any };
    layers: { [key: string]: LevelManifestLayer };
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
