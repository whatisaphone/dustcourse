export class Point {
	public constructor(public x: number, public y: number) { }
}

export class Rectangle {
	public constructor(public left: number, public top: number, public width: number, public height: number) { }

	public static ltrb(left: number, top: number, right: number, bottom: number) {
		return new Rectangle(left, top, right - left, bottom - top);
	}

	public right() { return this.left + this.width; }

	public bottom() { return this.top + this.height; }

	public topLeft() { return new Point(this.left, this.top); }

	public bottomRight() { return new Point(this.left + this.width, this.top + this.height); }

	public contains(point: Point) {
		return point.x >= this.left && point.y >= this.top &&
			point.x < this.right() && point.y < this.bottom();
	}

	public intersects(rect: Rectangle) {
		return rect.left < this.right() && this.left < rect.right() &&
            rect.top < this.bottom() && this.top < rect.bottom();
	}
}

export class Size {
	public constructor(public width: number, public height: number) { }
}

interface LayerShim {
	def: { parallax: number };
}

export class Viewport {
    constructor(public position: Point, public size: Size, public zoom: number) { }

    public screenRect() {
        return new Rectangle(-this.size.width / 2, -this.size.height / 2, this.size.width, this.size.height);
    }

    public screenToWorldP(layer: LayerShim, screenP: Point) {
        var tileScale = 1;
        var x = screenP.x / this.zoom / tileScale + this.position.x * layer.def.parallax;
        var y = screenP.y / this.zoom / tileScale + this.position.y * layer.def.parallax;
        return new Point(x, y);
    }

    public worldToScreenP(layer: LayerShim, worldP: Point) {
        var tileScale = 1;
        var x = (worldP.x - this.position.x * layer.def.parallax) * this.zoom * tileScale;
        var y = (worldP.y - this.position.y * layer.def.parallax) * this.zoom * tileScale;
        return new Point(x, y);
    }

    public screenToWorldR(layer: LayerShim, screenR: Rectangle) {
        var tileScale = 1;
        var topLeft = this.screenToWorldP(layer, screenR.topLeft());
        return new Rectangle(topLeft.x, topLeft.y, screenR.width / tileScale / this.zoom, screenR.height / tileScale / this.zoom);
    }

    public worldToScreenR(layer: LayerShim, worldR: Rectangle) {
        var tileScale = 1;
        var topLeft = this.worldToScreenP(layer, worldR.topLeft());
        return new Rectangle(topLeft.x, topLeft.y, worldR.width * tileScale * this.zoom, worldR.height * tileScale * this.zoom);
    }
}
