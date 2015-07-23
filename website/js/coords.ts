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
}

export class Size {
	public constructor(public width: number, public height: number) { }
}
