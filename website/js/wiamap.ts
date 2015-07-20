import DragScroll = require('./dragscroll');
import coords = require('./coords');
import Point = coords.Point;
import Rectangle = coords.Rectangle;

export class View implements DragScroll.Callback {
	public element: Element;
	private scroll: DragScroll;
	private children: { [key: string]: Element };
	private camemraPos: Point;
	private cameraWidth: number;
	private cameraHeight: number;
	private cameraZoom: number;

	constructor(private model: Model) {
		this.element = document.createElement('div');
		this.scroll = new DragScroll(this);
		this.children = {};
		this.element.addEventListener('mousedown', (e: MouseEvent) => this.mousedown(e));
		this.element.addEventListener('mousemove', (e: MouseEvent) => this.mousemove(e));
		this.element.addEventListener('mouseup', (e: MouseEvent) => this.mouseup(e));
		this.element.addEventListener('mousewheel', (e: MouseWheelEvent) => this.mousewheel(e));

		this.camemraPos = new Point(0, 0);
		this.cameraZoom = 1;
	}

	private update() {
		this.cameraWidth = this.element.clientWidth;
		this.cameraHeight = this.element.clientHeight;
		var viewport = new Rectangle(0, 0, //-this.cameraWidth / 2, -this.cameraHeight / 2,
			this.cameraWidth, this.cameraHeight);
		var oldChildren = this.children;
		var newChildren: { [key: string]: Element } = {};

		_.each(this.model.layers, layer => {
			var scale = layer.scales[0];
			var layerRect = this.cameraToLayerR(layer, scale, viewport);

			var minX = Math.floor(layerRect.left / scale.tileWidth) * scale.tileWidth;
			var maxX = Math.ceil(layerRect.right() / scale.tileWidth) * scale.tileWidth;
			var minY = Math.floor(layerRect.top / scale.tileHeight) * scale.tileHeight;
			var maxY = Math.ceil(layerRect.bottom() / scale.tileHeight) * scale.tileHeight;

			for (var lx = minX; lx < maxX; lx += scale.tileWidth) {
				for (var ly = minY; ly < maxY; ly += scale.tileHeight) {
					var tileKey = layer.name + '_' + scale.scale + '_' + lx + '_' + ly;
					var oldChild = oldChildren[tileKey];
					if (oldChild) {
						this.moveTileElement(layer, scale, lx, ly, oldChild);
						newChildren[tileKey] = oldChild;
						delete oldChildren[tileKey];
					} else {
						var tile = this.model.getTile(layer, scale, lx, ly);
						if (tile)
							newChildren[tileKey] = this.addTile(layer, scale, lx, ly, tile);
					}
				}
			}
		});

		for (var key in oldChildren)
			this.element.removeChild(oldChildren[key]);

		this.children = newChildren;
	}

	private addTile(layer: Layer, scale: Scale, lx: number, ly: number, tile: Tile) {
		var el = document.createElement('img');
		el.setAttribute('src', tile.imageURL);
		this.moveTileElement(layer, scale, lx, ly, el);
		this.element.appendChild(el);
		return el;
	}

	private moveTileElement(layer: Layer, scale: Scale, lx: number, ly: number, el: Element) {
		var layerRect = new Rectangle(lx, ly, scale.tileWidth, scale.tileHeight);
		var cameraRect = this.layerToCameraR(layer, scale, layerRect);
		el.setAttribute('width', '' + Math.ceil(cameraRect.width));
		el.setAttribute('height', '' + Math.ceil(cameraRect.height));
		el.setAttribute('style', 'position:absolute;left:' + Math.floor(cameraRect.left) +
			'px;top:' + Math.floor(cameraRect.top) + 'px;z-index:' + layer.zindex);
	}

	private cameraToLayerP(layer: Layer, scale: Scale, screenP: Point) {
		var x = (screenP.x - this.cameraWidth / 2) / this.cameraZoom / layer.tileScale + this.camemraPos.x * layer.parallax;
		var y = (screenP.y - this.cameraHeight / 2) / this.cameraZoom / layer.tileScale + this.camemraPos.y * layer.parallax;
		// var x = (cameraP.x / layer.parallax + this.camemraPos.x) * scale.scale / this.cameraZoom;
		// var y = (cameraP.y / layer.parallax + this.camemraPos.y) * scale.scale / this.cameraZoom;
		return new Point(x, y);
	}

	private layerToCameraP(layer: Layer, scale: Scale, layerP: Point) {
		var x = (layerP.x - this.camemraPos.x * layer.parallax) * this.cameraZoom * layer.tileScale + this.cameraWidth / 2;
		var y = (layerP.y - this.camemraPos.y * layer.parallax) * this.cameraZoom * layer.tileScale + this.cameraHeight / 2;
		// var x = (layerP.x / scale.scale * this.cameraZoom - this.camemraPos.x) * layer.parallax;
		// var y = (layerP.y / scale.scale * this.cameraZoom - this.camemraPos.y) * layer.parallax;
		return new Point(x, y);
	}

	private cameraToLayerR(layer: Layer, scale: Scale, cameraR: Rectangle) {
		var topLeft = this.cameraToLayerP(layer, scale, cameraR.topLeft());
		return new Rectangle(topLeft.x, topLeft.y, cameraR.width / layer.tileScale / this.cameraZoom, cameraR.height / layer.tileScale / this.cameraZoom);
	}

	private layerToCameraR(layer: Layer, scale: Scale, layerR: Rectangle) {
		var topLeft = this.layerToCameraP(layer, scale, layerR.topLeft());
		return new Rectangle(topLeft.x, topLeft.y, layerR.width * layer.tileScale * this.cameraZoom, layerR.height * layer.tileScale * this.cameraZoom);
	}

	private mousedown(event: MouseEvent) {
		this.scroll.mousedown(event);
	}

	private mousemove(event: MouseEvent) {
		this.scroll.mousemove(event);
	}

	private mouseup(event: MouseEvent) {
		this.scroll.mouseup(event);
	}

	private mousewheel(event: MouseWheelEvent) {
		this.scroll.mousewheel(event);
	}

	public scrollTo(x: number, y: number, zoom: number) {
		this.camemraPos = new Point(x, y);
		this.cameraZoom = zoom;
		this.update();
	}

	public scrollRelative(x: number, y: number) {
		this.camemraPos = new Point(this.camemraPos.x + x / this.cameraZoom, this.camemraPos.y + y / this.cameraZoom);
		this.update();
	}

	public getViewport() {
		return new Rectangle(this.camemraPos.x - this.element.clientWidth / this.cameraZoom / 2,
			this.camemraPos.y - this.element.clientHeight / this.cameraZoom / 2,
			this.element.clientWidth / this.cameraZoom, this.element.clientHeight / this.cameraZoom);
	}

	public setViewport(viewport: Rectangle) {
		this.camemraPos.x = viewport.left + viewport.width / 2;
		this.camemraPos.y = viewport.top + viewport.height / 2;
		this.cameraZoom = this.element.clientWidth / viewport.width;
		this.update();
	}
}

export interface Model {
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
