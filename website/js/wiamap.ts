import { Point, Rectangle, Size } from './coords';
import DragScroll from './dragscroll';

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

    public addLayer(def: LayerDef) {
        var layer;
        if (def.type === "tile")
            layer = new TileLayer(<TileLayerDef>def);
        else
            throw new Error();
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

class Viewport {
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
    onViewportChanged();
}

class NaiveCanvasView implements View {
    private element: HTMLDivElement;
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private images: { [key: string]: HTMLImageElement };

    constructor(private widget: Widget) {
        this.element = document.createElement('div');
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.element.appendChild(this.canvas);
        this.context = <CanvasRenderingContext2D>this.canvas.getContext('2d');
        this.images = {};
    }

    public getElement() {
        return this.element;
    }

    public onViewportChanged() {
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
        if (layer.def.type === "tile")
            this.drawTileLayer(<TileLayer>layer);
        else
            throw new Error();
    }

    private drawTileLayer(layer: TileLayer) {
        var scale = chooseScale(layer.def.scales, this.widget.viewport.zoom);
        var area = this.widget.viewport.screenToWorldR(layer, this.widget.viewport.screenRect());
        enumerateTiles(layer, scale, area, (wx, wy, tile) => {
            this.drawTile(layer, scale, wx, wy, tile);
        });
    }

    private drawTile(layer: Layer, scale: TileScale, wx: number, wy: number, tile: Tile) {
        var tileKey = layer.def.id + '_' + scale.scale + '_' + wx + '_' + wy;
        var image = this.images[tileKey];
        if (!image) {
            image = this.images[tileKey] = document.createElement('img');
            image.addEventListener('load', e => this.redraw());
            image.src = tile.imageURL;
        }
        var worldRect = new Rectangle(wx, wy, scale.tileWidth, scale.tileHeight);
        var screenRect = this.widget.viewport.worldToScreenR(layer, worldRect);
        var left = Math.floor(screenRect.left + this.widget.viewport.size.width / 2);
        var top = Math.floor(screenRect.top + this.widget.viewport.size.height / 2);
        this.context.drawImage(image, left, top, Math.ceil(screenRect.width), Math.ceil(screenRect.height));
    }
}

class MultiCanvasView implements View {
    private element: HTMLDivElement;
    private prevViewport: Viewport;
    private images: { [key: string]: HTMLImageElement };
    private easels: MultiCanvasEasel[];

    constructor(private widget: Widget) {
        this.element = document.createElement('div');
        this.prevViewport = new Viewport(new Point(0, 0), new Size(0, 0), 1);
        this.images = {};
    }

    private initLayers() {
        this.easels = _.map(this.widget.layers, l => this.makeEasel(l));
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

        (<any>_).zipWith(this.widget.layers, this.easels, (layer, easel) => {
            this.moveOrDrawPanes(layer, easel);
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
        if (layer.def.type === "tile")
            this.drawPaneTiles(<TileLayer>layer, pane);
        else
            throw new Error();
    }

    private drawPaneTiles(layer: TileLayer, pane: MultiCanvasPane) {
        var scale = chooseScale(layer.def.scales, this.widget.viewport.zoom);

        pane.context.clearRect(0, 0, pane.screenRect.width, pane.screenRect.height);

        enumerateTiles(layer, scale, pane.drawnWorldRect, (wx, wy, tile) => {
            this.drawTile(layer, scale, pane, wx, wy, tile);
        });
    }

    private drawTile(layer: TileLayer, scale: TileScale, pane: MultiCanvasPane, wx: number, wy: number, tile: Tile) {
        var tileKey = layer.def.id + '_' + scale.scale + '_' + wx + '_' + wy;
        var image = this.images[tileKey];
        if (!image) {
            image = this.images[tileKey] = document.createElement('img');
            image.addEventListener('load', e => { this.drawPane(layer, pane); });
            image.src = tile.imageURL;
            return;
        }
        var worldRect = new Rectangle(wx, wy, scale.tileWidth, scale.tileHeight);
        var screenRect = this.widget.viewport.worldToScreenR(layer, worldRect);
        var left = Math.floor(screenRect.left - pane.screenRect.left);
        var top = Math.floor(screenRect.top - pane.screenRect.top);
        pane.context.drawImage(image, left, top, Math.ceil(screenRect.width), Math.ceil(screenRect.height));
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
    type: string;
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

class Layer {
    constructor(public def: LayerDef) { }
}

class TileLayer extends Layer {
    constructor(public def: TileLayerDef) {
        super(def);
    }
}
