import { Point, Rectangle, Size } from './coords';
import DragScroll from './dragscroll';

export class Widget implements DragScroll.Callback {
    private view: View;
    public viewport: Viewport;
    private scroll: DragScroll;

    constructor(public source: Source) {
        this.view = new MultiCanvasView(this);
        this.viewport = new Viewport(new Point(0, 0), new Size(0, 0), 1);

        this.scroll = new DragScroll(this);
        this.scroll.bindEvents(this.getElement());
    }

    public getElement() {
        return this.view.getElement();
    }

    public setViewportSize(size) {
        this.viewport = new Viewport(this.viewport.position, size, this.viewport.zoom);
    }

    public enumerateVisibleTiles(layer: Layer, scale: Scale, callback: (wx: number, wy: number, t: Tile) => void) {
        var viewRect = new Rectangle(-this.viewport.size.width / 2, -this.viewport.size.height / 2,
            this.viewport.size.width, this.viewport.size.height);
        var bounds = this.viewport.cameraToLayerR(layer, scale, viewRect);
        return this.enumerateTiles(layer, scale, bounds, callback);
    }

    public enumerateTiles(layer: Layer, scale: Scale, bounds: Rectangle, callback: (wx: number, wy: number, t: Tile) => void) {
        var minX = Math.floor(bounds.left / scale.tileWidth) * scale.tileWidth;
        var maxX = Math.ceil(bounds.right() / scale.tileWidth) * scale.tileWidth;
        var minY = Math.floor(bounds.top / scale.tileHeight) * scale.tileHeight;
        var maxY = Math.ceil(bounds.bottom() / scale.tileHeight) * scale.tileHeight;

        for (var wx = minX; wx < maxX; wx += scale.tileWidth) {
            for (var wy = minY; wy < maxY; wy += scale.tileHeight) {
                var tile = this.source.getTile(layer, scale, wx, wy);
                if (tile)
                    callback(wx, wy, tile);
            }
        }
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

    public screenToLayerP(layer: Layer, scale: Scale, screenP: Point) {
        var x = screenP.x / this.zoom / layer.tileScale + this.position.x * layer.parallax;
        var y = screenP.y / this.zoom / layer.tileScale + this.position.y * layer.parallax;
        return new Point(x, y);
    }

    public layerToScreenP(layer: Layer, scale: Scale, layerP: Point) {
        var x = (layerP.x - this.position.x * layer.parallax) * this.zoom * layer.tileScale;
        var y = (layerP.y - this.position.y * layer.parallax) * this.zoom * layer.tileScale;
        return new Point(x, y);
    }

    public cameraToLayerR(layer: Layer, scale: Scale, cameraR: Rectangle) {
        var topLeft = this.screenToLayerP(layer, scale, cameraR.topLeft());
        return new Rectangle(topLeft.x, topLeft.y, cameraR.width / layer.tileScale / this.zoom, cameraR.height / layer.tileScale / this.zoom);
    }

    public layerToCameraR(layer: Layer, scale: Scale, layerR: Rectangle) {
        var topLeft = this.layerToScreenP(layer, scale, layerR.topLeft());
        return new Rectangle(topLeft.x, topLeft.y, layerR.width * layer.tileScale * this.zoom, layerR.height * layer.tileScale * this.zoom);
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
        var cameraSize = new Size(this.element.clientWidth, this.element.clientHeight);
        this.widget.setViewportSize(cameraSize);
        if (this.canvas.width != cameraSize.width || this.canvas.height != cameraSize.height) {
            this.canvas.width = cameraSize.width;
            this.canvas.height = cameraSize.height;
        }

        this.context.fillStyle = '#ccf';
        this.context.fillRect(0, 0, cameraSize.width, cameraSize.height);

        _.each(this.widget.source.layers, layer => {
            var scale = chooseScale(layer.scales, this.widget.viewport.zoom);
            this.widget.enumerateVisibleTiles(layer, scale, (wx, wy, tile) => {
                this.drawTile(layer, scale, wx, wy, tile);
            });
        });
    }

    private drawTile(layer: Layer, scale: Scale, wx: number, wy: number, tile: Tile) {
        var tileKey = layer.name + '_' + scale.scale + '_' + wx + '_' + wy;
        var image = this.images[tileKey];
        if (!image) {
            image = this.images[tileKey] = document.createElement('img');
            image.addEventListener('load', e => this.redraw());
            image.src = tile.imageURL;
        }
        var layerRect = new Rectangle(wx, wy, scale.tileWidth, scale.tileHeight);
        var cameraRect = this.widget.viewport.layerToCameraR(layer, scale, layerRect);
        var left = Math.floor(cameraRect.left + this.widget.viewport.size.width / 2);
        var top = Math.floor(cameraRect.top + this.widget.viewport.size.height / 2);
        this.context.drawImage(image, left, top, Math.ceil(cameraRect.width), Math.ceil(cameraRect.height));
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
        this.easels = _.map(this.widget.source.layers, l => this.makeEasel(l));
    }

    private makeEasel(layer: Layer) {
        var frames = _.times(9, n => {
            var f = new MultiCanvasFrame();
            f.canvas = document.createElement('canvas');
            f.canvas.style.position = 'absolute';
            this.element.appendChild(f.canvas);
            f.context = <CanvasRenderingContext2D>f.canvas.getContext('2d');
            return f;
        });
        var ret = new MultiCanvasEasel();
        ret.frames = frames;
        return ret;
    }

    public getElement() {
        return this.element;
    }

    public onViewportChanged() {
        var cameraSize = new Size(this.element.clientWidth, this.element.clientHeight);
        this.widget.setViewportSize(cameraSize);
        if (this.widget.viewport.size.width !== this.prevViewport.size.width
            || this.widget.viewport.size.height !== this.prevViewport.size.height
            || this.widget.viewport.zoom !== this.prevViewport.zoom) {
            while (this.element.lastChild)
                this.element.removeChild(this.element.lastChild);
            this.initLayers();
        }
        this.prevViewport = this.widget.viewport;

        (<any>_).zipWith(this.widget.source.layers, this.easels, (layer, easel) => {
            this.moveOrDrawFrames(layer, easel);
        });
    }

    private moveOrDrawFrames(layer: Layer, easel: MultiCanvasEasel) {
        var scale = chooseScale(layer.scales, this.widget.viewport.zoom);
        var screenRect = new Rectangle(
            -this.widget.viewport.size.width / 2, -this.widget.viewport.size.height / 2,
            this.widget.viewport.size.width, this.widget.viewport.size.height);
        var worldRect = this.widget.viewport.cameraToLayerR(layer, scale, screenRect);

        _.each(easel.frames, frame => {
            if (frame.drawnWorldRect) {
                if (frame.drawnWorldRect.right() < worldRect.left || frame.drawnWorldRect.left > worldRect.right()
                    || frame.drawnWorldRect.bottom() < worldRect.top || frame.drawnWorldRect.top > worldRect.bottom()) {
                    frame.drawnWorldRect = void 0;
                    frame.context.clearRect(0, 0, frame.screenRect.width, frame.screenRect.height);
                }
            }
        });

        var strideX = Math.ceil(worldRect.width / 2 / scale.tileWidth) * scale.tileWidth;
        var strideY = Math.ceil(worldRect.height / 2 / scale.tileHeight) * scale.tileHeight;
        var tilesX = 3;
        var tilesY = 3;
        var minX = Math.floor(worldRect.left / strideX) * strideX;
        var minY = Math.floor(worldRect.top / strideY) * strideY;

        for (var x = minX; x < worldRect.right(); x += strideX) {
            for (var y = minY; y < worldRect.bottom(); y += strideY) {
                var frameWorldRect = new Rectangle(x, y, strideX, strideY);
                var frameScreenRect = this.widget.viewport.layerToCameraR(layer, scale, frameWorldRect);
                var frame = _.find(easel.frames, f => f.drawnWorldRect && f.drawnWorldRect.left == frameWorldRect.left && f.drawnWorldRect.top == frameWorldRect.top);
                if (frame) {
                    frame.screenRect = frameScreenRect;
                    frame.canvas.style.left = Math.floor(frame.screenRect.left + this.widget.viewport.size.width / 2) + 'px';
                    frame.canvas.style.top = Math.floor(frame.screenRect.top + this.widget.viewport.size.height / 2) + 'px';
                } else {
                    frame = _.find(easel.frames, f => !f.drawnWorldRect);
                    frame.screenRect = frameScreenRect;
                    frame.canvas.style.left = Math.floor(frame.screenRect.left + this.widget.viewport.size.width / 2) + 'px';
                    frame.canvas.style.top = Math.floor(frame.screenRect.top + this.widget.viewport.size.height / 2) + 'px';
                    frame.canvas.width = Math.ceil(frame.screenRect.width);
                    frame.canvas.height = Math.ceil(frame.screenRect.height);
                    frame.drawnWorldRect = frameWorldRect;
                    this.drawFrame(layer, scale, frame);
                }
            }
        }
    }

    private drawFrame(layer: Layer, scale: Scale, frame: MultiCanvasFrame) {
        frame.context.clearRect(0, 0, frame.screenRect.width, frame.screenRect.height);

        this.widget.enumerateTiles(layer, scale, frame.drawnWorldRect, (wx, wy, tile) => {
            this.drawTile(layer, scale, frame, wx, wy, tile);
        });
    }

    private drawTile(layer: Layer, scale: Scale, frame: MultiCanvasFrame, wx: number, wy: number, tile: Tile) {
        var tileKey = layer.name + '_' + scale.scale + '_' + wx + '_' + wy;
        var image = this.images[tileKey];
        if (!image) {
            image = this.images[tileKey] = document.createElement('img');
            // TODO: instead of this, call a higher-level redraw function to avoid possible leaks and glitches
            image.addEventListener('load', e => { this.drawTile(layer, scale, frame, wx, wy, tile); });
            image.src = tile.imageURL;
            return;
        }
        var layerRect = new Rectangle(wx, wy, scale.tileWidth, scale.tileHeight);
        var cameraRect = this.widget.viewport.layerToCameraR(layer, scale, layerRect);
        var left = Math.floor(cameraRect.left - frame.screenRect.left);
        var top = Math.floor(cameraRect.top - frame.screenRect.top);
        frame.context.drawImage(image, left, top, Math.ceil(cameraRect.width), Math.ceil(cameraRect.height));
    }
}

class MultiCanvasEasel {
    public frames: MultiCanvasFrame[];
}

class MultiCanvasFrame {
    public canvas: HTMLCanvasElement;
    public context: CanvasRenderingContext2D;
    public screenRect: Rectangle;
    public drawnWorldRect: Rectangle;
}

function chooseScale(scales: Scale[], targetZoom: number) {
    var sorted = _.sortBy(scales, s => s.scale);
    return _.find(sorted, s => s.scale >= targetZoom) || sorted[sorted.length - 1];
}

export interface Source {
    layers: Layer[];
    getTile(layer: Layer, scale: Scale, x: number, y: number): Tile;
}

export interface Layer {
    name: string;
    scales: Scale[];
    zindex: number;
    parallax: number;
    tileScale: number;
}

export interface Scale {
    scale: number;
    tileWidth: number;
    tileHeight: number;
}

export interface Tile {
    imageURL: string;
}
