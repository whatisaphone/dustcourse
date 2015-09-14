import { Point, Rectangle, Size, Viewport } from './coords';
import DragScroll from './dragscroll';

export class Widget implements DragScroll.Callback {
    private renderer: PIXI.SystemRenderer;
    private container: PIXI.Container;
    public viewport: Viewport;
    public layers: Layer[];
    private scroll: DragScroll;

    constructor() {
        var view = <HTMLCanvasElement>document.querySelector('canvas');
        this.renderer = PIXI.autoDetectRenderer(640, 360, { view: view, transparent: true });
        this.container = new PIXI.Container();
        this.layers = [];
        this.viewport = new Viewport(new Point(0, 0), new Size(0, 0), 1);
        this.advanceFrame();

        this.scroll = new DragScroll(this);
        this.scroll.bindEvents(this.getElement());
    }

    public getElement() {
        return this.renderer.view;
    }

    public scrollTo(x: number, y: number, zoom: number) {
        this.viewport = new Viewport(new Point(x, y), this.viewport.size, zoom);
    }

    public getViewport() {
        return this.viewport;
    }

    public setViewport(viewport: Viewport) {
        this.viewport = viewport;
    }

    public addLayer(layer: Layer) {
        this.layers.push(layer);
        this.layers.sort((x, y) => x.def.zindex - y.def.zindex);
        this.container.removeChildren();
        _.each(this.layers, layer => {
            this.container.addChild(layer.stage);
        });
    }

    public advanceFrame() {
        var screenSize = new Size(this.getElement().clientWidth, this.getElement().clientHeight);
        this.viewport = new Viewport(this.viewport.position, screenSize, this.viewport.zoom);
        this.renderer.resize(screenSize.width, screenSize.height);
        _.each(this.layers, layer => {
            var screenRect = this.viewport.screenRect();
            var worldRect = this.viewport.screenToWorldR(layer, screenRect);
            layer.update(this.viewport, screenRect, worldRect);
        });
        this.renderer.render(this.container);
        requestAnimationFrame(() => { this.advanceFrame(); });
    }
}

export interface Layer {
    def: LayerDef;
    stage: PIXI.Container;

    update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle): void;
}

export interface LayerDef {
    zindex: number;
    parallax: number;
}

export interface TileLayerDef extends LayerDef {
    scales: TileScale[];
    getTile(scale: TileScale, x: number, y: number): Tile;
}

export interface TileScale {
    scale: number;
    tileWidth: number;
    tileHeight: number;
}

export interface Tile {
    texture: PIXI.Texture;
}

export class TileLayer implements Layer {
    public stage = new PIXI.Container();

    constructor(public def: TileLayerDef) { }

    public update(viewport: Viewport, canvasRect: Rectangle, worldRect: Rectangle) {
        var scale = chooseTileScale(this.def.scales, viewport.zoom);

        this.stage.removeChildren();
        enumerateTiles(this, scale, worldRect, (wx, wy, tile) => {
            this.addTile(viewport, canvasRect, scale, wx, wy, tile);
        });
    }

    private addTile(viewport: Viewport, canvasRect: Rectangle, scale: TileScale,
                    wx: number, wy: number, tile: Tile) {
        var worldRect = new Rectangle(wx, wy, scale.tileWidth, scale.tileHeight);
        var screenRect = viewport.worldToScreenR(this, worldRect);
        var sprite = new PIXI.Sprite(tile.texture);
        sprite.position.x = Math.floor(screenRect.left - canvasRect.left);
        sprite.position.y = Math.floor(screenRect.top - canvasRect.top);
        sprite.scale.x = sprite.scale.y = viewport.zoom / scale.scale;
        this.stage.addChild(sprite);
    }
}

function chooseTileScale(scales: TileScale[], targetZoom: number) {
    var sorted = _.sortBy(scales, s => s.scale);
    return _.find(sorted, s => s.scale >= targetZoom) || sorted[sorted.length - 1];
}

function enumerateTiles(layer: TileLayer, scale: TileScale, area: Rectangle, callback: (wx: number, wy: number, t: Tile) => void) {
    var minX = Math.floor(area.left / scale.tileWidth) * scale.tileWidth;
    var maxX = Math.ceil(area.right() / scale.tileWidth) * scale.tileWidth;
    var minY = Math.floor(area.top / scale.tileHeight) * scale.tileHeight;
    var maxY = Math.ceil(area.bottom() / scale.tileHeight) * scale.tileHeight;

    for (var wx = minX; wx < maxX; wx += scale.tileWidth) {
        for (var wy = minY; wy < maxY; wy += scale.tileHeight) {
            var tile = layer.def.getTile(scale, wx, wy);
            if (tile)
                callback(wx, wy, tile);
        }
    }
}
