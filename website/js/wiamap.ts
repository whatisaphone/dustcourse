import { Point, Rectangle, Size } from './coords';
import DragScroll from './dragscroll';

export class Widget implements LayerCallback,DragScroll.Callback {
    private renderer: PIXI.SystemRenderer;
    private container: PIXI.Container;
    public viewport: Viewport;
    public layers: Layer[];
    private scroll: DragScroll;

    constructor() {
        this.renderer = PIXI.autoDetectRenderer(640, 360, { transparent: true });
        this.container = new PIXI.Container();
        this.layers = [];
        this.viewport = new Viewport(new Point(0, 0), new Size(0, 0), 1);
        this.draw();

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
        return new Rectangle(this.viewport.position.x - this.viewport.size.width / this.viewport.zoom / 2,
            this.viewport.position.y - this.viewport.size.height / this.viewport.zoom / 2,
            this.viewport.size.width / this.viewport.zoom, this.viewport.size.height / this.viewport.zoom);
    }

    public setViewport(viewport: Rectangle) {
        var x = viewport.left + viewport.width / 2;
        var y = viewport.top + viewport.height / 2;
        var zoom = Math.min(2, this.viewport.size.width / viewport.width);
        this.viewport = new Viewport(new Point(x, y), this.viewport.size, zoom);
    }

    public scrollRelative(x: number, y: number) {
        var newX = this.viewport.position.x + x / this.viewport.zoom;
        var newY = this.viewport.position.y + y / this.viewport.zoom;
        this.viewport = new Viewport(new Point(newX, newY), this.viewport.size, this.viewport.zoom);
    }

    public addLayer(layer: Layer) {
        layer.callback = this;
        this.layers.push(layer);
    }

    public redrawArea(layer: Layer, area: Rectangle) {
        throw new Error();
    }

    private draw() {
        var screenSize = new Size(this.getElement().clientWidth, this.getElement().clientHeight);
        this.viewport = new Viewport(this.viewport.position, screenSize, this.viewport.zoom);
        this.renderer.resize(screenSize.width, screenSize.height);
        this.container.removeChildren();
        _.each(this.layers, layer => {
            var screenRect = this.viewport.screenRect();
            var worldRect = this.viewport.screenToWorldR(layer, screenRect);
            layer.draw(this.viewport, this.container, screenRect, worldRect);
        });
        this.renderer.render(this.container);
        requestAnimationFrame(() => { this.draw(); });
    }
}

export class Viewport {
    constructor(public position: Point, public size: Size, public zoom: number) { }

    public screenRect() {
        return new Rectangle(-this.size.width / 2, -this.size.height / 2, this.size.width, this.size.height);
    }

    public screenToWorldP(layer: Layer, screenP: Point) {
        var tileScale = 1;
        var x = screenP.x / this.zoom / tileScale + this.position.x * layer.def.parallax;
        var y = screenP.y / this.zoom / tileScale + this.position.y * layer.def.parallax;
        return new Point(x, y);
    }

    public worldToScreenP(layer: Layer, worldP: Point) {
        var tileScale = 1;
        var x = (worldP.x - this.position.x * layer.def.parallax) * this.zoom * tileScale;
        var y = (worldP.y - this.position.y * layer.def.parallax) * this.zoom * tileScale;
        return new Point(x, y);
    }

    public screenToWorldR(layer: Layer, screenR: Rectangle) {
        var tileScale = 1;
        var topLeft = this.screenToWorldP(layer, screenR.topLeft());
        return new Rectangle(topLeft.x, topLeft.y, screenR.width / tileScale / this.zoom, screenR.height / tileScale / this.zoom);
    }

    public worldToScreenR(layer: Layer, worldR: Rectangle) {
        var tileScale = 1;
        var topLeft = this.worldToScreenP(layer, worldR.topLeft());
        return new Rectangle(topLeft.x, topLeft.y, worldR.width * tileScale * this.zoom, worldR.height * tileScale * this.zoom);
    }
}

export interface Layer {
    def: LayerDef;
    callback: LayerCallback;

    draw(viewport: Viewport, container: PIXI.Container, canvasRect: Rectangle, worldRect: Rectangle): void;
}

export interface LayerDef {
    id: string;
    zindex: number;
    parallax: number;
}

export interface LayerCallback {
    redrawArea(layer: Layer, area: Rectangle): void;
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
    imageURL: string;
}

export class TileLayer implements Layer {
    public callback: LayerCallback;
    private container: PIXI.Container;

    constructor(public def: TileLayerDef) {
        this.container = new PIXI.Container();
    }

    public draw(viewport: Viewport, container: PIXI.Container, canvasRect: Rectangle, worldRect: Rectangle) {
        var scale = chooseTileScale(this.def.scales, viewport.zoom);
        //var scale = this.def.scales[0];

        enumerateTiles(this, scale, worldRect, (wx, wy, tile) => {
            this.addTile(viewport, container, canvasRect, scale, wx, wy, tile);
        });
    }

    private addTile(viewport: Viewport, container: PIXI.Container, canvasRect: Rectangle, scale: TileScale, wx: number, wy: number, tile: Tile) {
        var worldRect = new Rectangle(wx, wy, scale.tileWidth, scale.tileHeight);
        var screenRect = viewport.worldToScreenR(this, worldRect);
        var left = Math.floor(screenRect.left - canvasRect.left);
        var top = Math.floor(screenRect.top - canvasRect.top);
        var sprite = PIXI.Sprite.fromImage(tile.imageURL);
        sprite.position.x = left;
        sprite.position.y = top;
        sprite.scale.x = sprite.scale.y = viewport.zoom / scale.scale;
        container.addChild(sprite);
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
