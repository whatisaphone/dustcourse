import { Point, Rectangle, Viewport } from './coords';
import { addWheelListener } from './mousewheel';

class DragScroll {
    private scrolling: boolean;
    private lastX: number;
    private lastY: number;

    public constructor(private callback: DragScroll.Callback) {}

    public bindEvents(element: Element) {
        element.addEventListener('mousedown', (e: MouseEvent) => { this.mousedown(e); });
        addWheelListener(element, e => { this.mousewheel(e); });
        window.addEventListener('mousemove', (e: MouseEvent) => { this.mousemove(e); });
        window.addEventListener('mouseup', (e: MouseEvent) => { this.mouseup(e); });
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
        var v = this.callback.getViewport();
        var relX = (this.lastX - event.pageX) / v.zoom;
        var relY = (this.lastY - event.pageY) / v.zoom;
        this.callback.setViewport(new Viewport(new Point(v.position.x + relX, v.position.y + relY), v.size, v.zoom));
        this.lastX = event.pageX;
        this.lastY = event.pageY;
    }

    public mouseup(event: MouseEvent) {
        this.scrolling = false;
    }

    public mousewheel(event: WheelEvent) {
        if (this.scrolling)
            return;

        var viewport = this.callback.getViewport();
        var screen = viewport.screenRect();
        var aroundPoint = new Point(event.pageX + screen.left, event.pageY + screen.top);

        var lines = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY / (100 / 3)
            : event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY
            : event.deltaY * 4;
        var ratio = Math.pow(1.1, -lines);
        ratio = Math.max(0.05 / viewport.zoom, Math.min(2 / viewport.zoom, ratio));

        screen.left -= aroundPoint.x;
        screen.top -= aroundPoint.y;
        screen = Rectangle.ltrb(screen.left / ratio, screen.top / ratio, screen.right() / ratio, screen.bottom() / ratio);
        screen.left += aroundPoint.x;
        screen.top += aroundPoint.y;

        var world = viewport.screenToWorldR({ def: { parallax: 1 }}, screen);
        var center = new Point(world.left + world.width / 2, world.top + world.height / 2);
        var zoom = Math.max(0.05, Math.min(2, viewport.zoom * ratio));
        this.callback.setViewport(new Viewport(center, viewport.size, zoom));
    }
}

module DragScroll {
    export interface Callback {
        getViewport(): Viewport;
        setViewport(viewport: Viewport): void;
    }
}

export { DragScroll as default };
