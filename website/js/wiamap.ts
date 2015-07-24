import { Point, Rectangle, Size } from './coords';
import DragScroll from './dragscroll';
import ImageCache from './imageCache';

export class Widget implements DragScroll.Callback {
    private view: View;
    public viewport: Viewport;
    private scroll: DragScroll;
    public layers: Layer[];

    constructor() {
        this.view = new MultiCanvasView(this);
        this.viewport = new Viewport(new Point(0, 0), new Size(0, 0), 1);
        this.layers = [];

        this.scroll = new DragScroll(this);
        this.scroll.bindEvents(this.getElement());
    }

    public getElement() {
        return this.view.getElement();
    }

    public addLayer(layer: Layer) {
        layer.callback = this;
        this.layers.push(layer);
    }

    public setViewportSize(size) {
        this.viewport = new Viewport(this.viewport.position, size, this.viewport.zoom);
    }

    public scrollTo(x: number, y: number, zoom: number) {
        this.viewport = new Viewport(new Point(x, y), this.viewport.size, zoom);
        this.view.onViewportChanged();
    }

    public scrollRelative(x: number, y: number) {
        var newX = this.viewport.position.x + x / this.viewport.zoom;
        var newY = this.viewport.position.y + y / this.viewport.zoom;
        this.viewport = new Viewport(new Point(newX, newY), this.viewport.size, this.viewport.zoom);
        this.view.onViewportChanged();
    }

    public redrawArea(layer: Layer, area: Rectangle) {
        this.view.redrawArea(layer, area);
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
        this.view.onViewportChanged();
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

export interface View {
    getElement();
    redrawArea(layer: Layer, area: Rectangle);
    onViewportChanged();
}

class NaiveCanvasView implements View {
    private element: HTMLDivElement;
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;

    constructor(private widget: Widget) {
        this.element = document.createElement('div');
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.element.appendChild(this.canvas);
        this.context = <CanvasRenderingContext2D>this.canvas.getContext('2d');
    }

    public getElement() {
        return this.element;
    }

    public onViewportChanged() {
        this.redraw();
    }

    public redrawArea(layer: Layer, area: Rectangle) {
        this.redraw();
    }

    private redraw() {
        var screenSize = new Size(this.element.clientWidth, this.element.clientHeight);
        this.widget.setViewportSize(screenSize);
        if (this.canvas.width != screenSize.width || this.canvas.height != screenSize.height) {
            this.canvas.width = screenSize.width;
            this.canvas.height = screenSize.height;
        }

        this.context.fillStyle = '#ccf';
        this.context.fillRect(0, 0, screenSize.width, screenSize.height);

        _.each(this.widget.layers, layer => {
            this.drawLayer(layer);
        });
    }

    private drawLayer(layer: Layer) {
        var screenRect = this.widget.viewport.screenRect();
        var worldRect = this.widget.viewport.screenToWorldR(layer, screenRect);
        layer.draw(this.widget.viewport, this.context, screenRect, worldRect);
    }
}

class MultiCanvasView implements View {
    private element: HTMLDivElement;
    private prevViewport: Viewport;
    private easels: { [layerID: string]: MultiCanvasEasel };

    constructor(private widget: Widget) {
        this.element = document.createElement('div');
        this.prevViewport = new Viewport(new Point(0, 0), new Size(0, 0), 1);
    }

    private initLayers() {
        this.easels = _.object(_.map(this.widget.layers, l => [l.def.id, this.makeEasel(l)]));
    }

    private makeEasel(layer: Layer) {
        var panes = _.times(9, n => {
            var f = new MultiCanvasPane();
            f.canvas = document.createElement('canvas');
            f.canvas.style.position = 'absolute';
            this.element.appendChild(f.canvas);
            f.context = <CanvasRenderingContext2D>f.canvas.getContext('2d');
            return f;
        });
        var ret = new MultiCanvasEasel();
        ret.panes = panes;
        return ret;
    }

    public getElement() {
        return this.element;
    }

    public redrawArea(layer: Layer, area: Rectangle) {
        var easel = this.easels[layer.def.id];
        _.each(easel.panes, pane => {
            if (pane.drawnWorldRect && pane.drawnWorldRect.intersects(area)) {
                this.drawPane(layer, pane);
            }
        });
    }

    public onViewportChanged() {
        var screenSize = new Size(this.element.clientWidth, this.element.clientHeight);
        this.widget.setViewportSize(screenSize);
        if (this.widget.viewport.size.width !== this.prevViewport.size.width
                || this.widget.viewport.size.height !== this.prevViewport.size.height
                || this.widget.viewport.zoom !== this.prevViewport.zoom) {
            while (this.element.lastChild)
                this.element.removeChild(this.element.lastChild);
            this.initLayers();
        }
        this.prevViewport = this.widget.viewport;

        _.each(this.widget.layers, layer => {
            this.moveOrDrawPanes(layer, this.easels[layer.def.id]);
        });
    }

    private moveOrDrawPanes(layer: Layer, easel: MultiCanvasEasel) {
        var screenRect = this.widget.viewport.screenRect();
        var worldRect = this.widget.viewport.screenToWorldR(layer, screenRect);

        _.each(easel.panes, pane => {
            if (pane.drawnWorldRect) {
                if (pane.drawnWorldRect.right() < worldRect.left || pane.drawnWorldRect.left > worldRect.right()
                    || pane.drawnWorldRect.bottom() < worldRect.top || pane.drawnWorldRect.top > worldRect.bottom()) {
                    pane.drawnWorldRect = void 0;
                    pane.context.clearRect(0, 0, pane.screenRect.width, pane.screenRect.height);
                }
            }
        });

        var naturalSizeToSplit = 200; // TODO
        var strideX = Math.ceil(worldRect.width / 2 / naturalSizeToSplit) * naturalSizeToSplit;
        var strideY = Math.ceil(worldRect.height / 2 / naturalSizeToSplit) * naturalSizeToSplit;
        var tilesX = 3;
        var tilesY = 3;
        var minX = Math.floor(worldRect.left / strideX) * strideX;
        var minY = Math.floor(worldRect.top / strideY) * strideY;

        for (var x = minX; x < worldRect.right(); x += strideX) {
            for (var y = minY; y < worldRect.bottom(); y += strideY) {
                var paneWorldRect = new Rectangle(x, y, strideX, strideY);
                var paneScreenRect = this.widget.viewport.worldToScreenR(layer, paneWorldRect);
                var pane = _.find(easel.panes, f => f.drawnWorldRect && f.drawnWorldRect.left == paneWorldRect.left && f.drawnWorldRect.top == paneWorldRect.top);
                if (pane) {
                    pane.screenRect = paneScreenRect;
                    pane.canvas.style.left = Math.floor(pane.screenRect.left + this.widget.viewport.size.width / 2) + 'px';
                    pane.canvas.style.top = Math.floor(pane.screenRect.top + this.widget.viewport.size.height / 2) + 'px';
                } else {
                    pane = _.find(easel.panes, f => !f.drawnWorldRect);
                    pane.screenRect = paneScreenRect;
                    pane.canvas.style.left = Math.floor(pane.screenRect.left + this.widget.viewport.size.width / 2) + 'px';
                    pane.canvas.style.top = Math.floor(pane.screenRect.top + this.widget.viewport.size.height / 2) + 'px';
                    pane.canvas.width = Math.ceil(pane.screenRect.width);
                    pane.canvas.height = Math.ceil(pane.screenRect.height);
                    pane.drawnWorldRect = paneWorldRect;
                    this.drawPane(layer, pane);
                }
            }
        }
    }

    private drawPane(layer: Layer, pane: MultiCanvasPane) {
        pane.context.clearRect(0, 0, pane.screenRect.width, pane.screenRect.height);
        layer.draw(this.widget.viewport, pane.context, pane.screenRect, pane.drawnWorldRect);
    }
}

class MultiCanvasEasel {
    public panes: MultiCanvasPane[];
}

class MultiCanvasPane {
    public canvas: HTMLCanvasElement;
    public context: CanvasRenderingContext2D;
    public screenRect: Rectangle;
    public drawnWorldRect: Rectangle;
}

function chooseScale(scales: TileScale[], targetZoom: number) {
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

export interface Source {
    layers: Layer[];
}

export interface LayerDef {
    id: string;
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
    imageURL: string;
}

export interface Layer {
    def: LayerDef;
    callback: LayerCallback;

    draw(viewport: Viewport, context: CanvasRenderingContext2D, canvasRect: Rectangle, worldRect: Rectangle);
}

export interface LayerCallback {
    redrawArea(layer: Layer, area: Rectangle);
}

export class TileLayer implements Layer {
    public callback: LayerCallback;
    private imageCache = new ImageCache();

    constructor(public def: TileLayerDef) { }

    public draw(viewport: Viewport, context: CanvasRenderingContext2D, canvasRect: Rectangle, worldRect: Rectangle) {
        var scale = chooseScale(this.def.scales, viewport.zoom);

        enumerateTiles(this, scale, worldRect, (wx, wy, tile) => {
            this.drawTile(viewport, context, canvasRect, scale, wx, wy, tile);
        });
    }

    private drawTile(viewport: Viewport, context: CanvasRenderingContext2D, canvasRect: Rectangle, scale: TileScale, wx: number, wy: number, tile: Tile) {
        var worldRect = new Rectangle(wx, wy, scale.tileWidth, scale.tileHeight);

        var image = this.imageCache.get(tile.imageURL, () => this.callback.redrawArea(this, worldRect));
        if (!image.complete)
            return;

        var screenRect = viewport.worldToScreenR(this, worldRect);
        var left = Math.floor(screenRect.left - canvasRect.left);
        var top = Math.floor(screenRect.top - canvasRect.top);
        context.drawImage(image, left, top, Math.ceil(screenRect.width), Math.ceil(screenRect.height));
    }
}
