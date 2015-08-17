import { Point, Rectangle } from './coords';

class DragScroll {
	private scrolling: boolean;
	private lastX: number;
	private lastY: number;

	public constructor(private callback: DragScroll.Callback) {}

	public bindEvents(element: Element) {
		element.addEventListener('mousedown', (e: MouseEvent) => this.mousedown(e));
		element.addEventListener('mousewheel', (e: MouseWheelEvent) => this.mousewheel(e));
		window.addEventListener('mousemove', (e: MouseEvent) => this.mousemove(e));
		window.addEventListener('mouseup', (e: MouseEvent) => this.mouseup(e));
	}

	public mousedown(event: MouseEvent) {
		this.scrolling = true;
		this.lastX = event.pageX;
		this.lastY = event.pageY;
		event.preventDefault();
	}

	public mousemove(event: MouseEvent) {
		if (!this.scrolling)
			return;
		this.callback.scrollRelative(this.lastX - event.pageX, this.lastY - event.pageY);
		this.lastX = event.pageX;
		this.lastY = event.pageY;
	}

	public mouseup(event: MouseEvent) {
		this.scrolling = false;
	}

	public mousewheel(event: MouseWheelEvent) {
		if (this.scrolling)
			return;

		var delta = event.wheelDelta;
		var ratio = Math.pow(2, delta / -480);
		var viewport = this.callback.getViewport();
		var aroundPoint = new Point(viewport.left + viewport.width / 2, viewport.top + viewport.height / 2);

		viewport.left -= aroundPoint.x;
		viewport.top -= aroundPoint.y;
		viewport = Rectangle.ltrb(viewport.left * ratio, viewport.top * ratio, viewport.right() * ratio, viewport.bottom() * ratio);
		viewport.left += aroundPoint.x;
		viewport.top += aroundPoint.y;

		this.callback.setViewport(viewport);
	}
}

module DragScroll {
	export interface Callback {
		scrollRelative(x: number, y: number): void;
		getViewport(): Rectangle;
		setViewport(viewport: Rectangle): void;
	}
}

export { DragScroll as default };
