import { Rectangle } from './coords';
import * as model from './model';
import { Frame, FrameContainer } from './gfx';

export function lerp(x1: number, x2: number, p: number) {
    return x1 + (x2 - x1) * p;
}

export function lerpRGB(rgb1: number, rgb2: number, p: number) {
    var r1 = (rgb1 & 0xff0000) >> 16;
    var g1 = (rgb1 & 0xff00) >> 8;
    var b1 = rgb1 & 0xff;
    var r2 = (rgb2 & 0xff0000) >> 16;
    var g2 = (rgb2 & 0xff00) >> 8;
    var b2 = rgb2 & 0xff;
    var r = r1 + (r2 - r1) * p;
    var g = g1 + (g2 - g1) * p;
    var b = b1 + (b2 - b1) * p;
    return (r << 16) + (g << 8) + (b | 0);
}

export function distance(x1: number, y1: number, x2: number, y2: number) {
    return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

export function moveArrayElement<T>(array: T[], element: T, newIndex: number) {
    if (array[newIndex] === element)
        return;
    var oldIndex = _.indexOf(array, element);
    if (oldIndex !== -1)
        array.splice(oldIndex, 1);
    array.splice(newIndex - <any>(newIndex > oldIndex), 0, element);
}

export function convertIntToRGB(color: number) {
    var r = (color & 0xff0000) >> 16;
    var g = (color & 0xff00) >> 8;
    var b = color & 0xff;
    return [r / 255, g / 255, b / 255];
}

export function convertIntToCSSRGB(color: number) {
    var r = (color & 0xff0000) >> 16;
    var g = (color & 0xff00) >> 8;
    var b = color & 0xff;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

export class FrameCounter {
    public frame: number;
    private lastFrameTime: number;

    public advance() {
        var time = window.performance && performance.now ? performance.now() : Date.now();
        if (!this.lastFrameTime) {
            this.frame = 0;
            this.lastFrameTime = time;
        } else {
            var framesPassed = Math.floor((time - this.lastFrameTime) / 1000 * 60);
            if (framesPassed > 0 && framesPassed < 300)
                this.frame += framesPassed;
            else
                this.frame += 1;
            this.lastFrameTime = time;
        }
        return this.frame;
    }
}

export function addDustforceSprite(stage: PIXI.Container, fc: FrameContainer, options?: DustforceSpriteOptions) {
    var s = new DustforceSprite(fc);
    s.position.x = options ? (options.posX || 0) : 0;
    s.position.y = options ? (options.posY || 0) : 0;
    s.scale.x = options ? (options.scaleX || options.scale || 1) : 1;
    s.scale.y = options ? (options.scaleY || options.scale || 1) : 1;
    s.rotation = options ? (options.rotation || 0) : 0;
    s.alpha = options ? (options.alpha || 1) : 1;
    stage.addChild(s);
    return s;
}

export function createDustforceSprite(fc: FrameContainer, x: number, y: number, options?: DustforceSpriteOptions) {
    var s = new DustforceSprite(fc);
    s.position.x = x;
    s.position.y = y;
    s.scale.x = options ? (options.scaleX || options.scale || 1) : 1;
    s.scale.y = options ? (options.scaleY || options.scale || 1) : 1;
    s.rotation = options ? (options.rotation || 0) : 0;
    s.alpha = options ? (options.alpha || 1) : 1;
    return s;
}

export function transparentSprite(x: number, y: number, width: number, height: number) {
    var g = new PIXI.Graphics();
    g.alpha = 0;
    g.beginFill(0);
    g.drawRect(x, y, width, height);
    g.endFill();
    return g;
}

interface DustforceSpriteOptions {
    posX?: number;
    posY?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
    alpha?: number;
}

// These classes exist because I needed finer control over the transformation matrix than pixi.js provides
// updateTransform isn't actually documented, but it seems like a logical enough solution

export class ChunkContainer extends PIXI.Container {
    public updateTransform() {
        this.worldTransform.identity()
            .translate(this.position.x, this.position.y)
            .scale(this.scale.x, this.scale.y)
            .prepend(this.parent.worldTransform);

        // copied from PIXI.DisplayObject.updateTransform
        this.worldAlpha = this.alpha * this.parent.worldAlpha;
        this._currentBounds = null;

        for (var ci = 0, cl = this.children.length; ci < cl; ++ci)
            this.children[ci].updateTransform();
    }
}

export class ViewportParticleContainer extends PIXI.ParticleContainer {
    public updateTransform() {
        this.worldTransform.identity()
            .translate(this.position.x, this.position.y)
            .scale(this.scale.x, this.scale.y)
            .prepend(this.parent.worldTransform);

        // copied from PIXI.DisplayObject.updateTransform
        this.worldAlpha = this.alpha * this.parent.worldAlpha;
        this._currentBounds = null;

        for (var ci = 0, cl = this.children.length; ci < cl; ++ci)
            this.children[ci].updateTransform();
    }
}

export class DustforceSprite extends PIXI.Sprite {
    constructor(private fc?: FrameContainer) {
        super(fc && fc.frame && fc.frame.texture);
    }

    public setFrame(fc: FrameContainer) {
        this.fc = fc;
        var texture = fc && fc.frame && fc.frame.texture || PIXI.Texture.EMPTY;
        if (this.texture !== texture)
            this.texture = texture;
    }

    public updateTransform() {
        this.setFrame(this.fc);

        var hitbox = this.fc && this.fc.frame && this.fc.frame.hitbox;

        this.worldTransform.identity()
            .translate(hitbox ? hitbox.left : 0, hitbox ? hitbox.top : 0)
            .scale(this.scale.x, this.scale.y)
            .rotate(this.rotation)
            .translate(this.position.x, this.position.y)
            .prepend(this.parent.worldTransform);

        // copied from PIXI.DisplayObject.updateTransform
        this.worldAlpha = this.alpha * this.parent.worldAlpha;
        this._currentBounds = null;

        for (var ci = 0, cl = this.children.length; ci < cl; ++ci)
            this.children[ci].updateTransform();
    }
}

export function applyFog(obj: PIXI.DisplayObject, level: model.Level, layerNum: number) {
    if (!level.currentFog)
        return;

    var filter = level.currentFogFilters[layerNum];
    if (!filter)
        filter = level.currentFogFilters[layerNum] = [new PIXI.filters.ColorMatrixFilter()];
    // as you can see, this function doesn't play nice with other filters on the passed object. oh well.
    if (!obj.filters)
        obj.filters = filter;

    var [r, g, b] = convertIntToRGB(level.currentFog['fog_colour'][layerNum]);
    var p = level.currentFog['fog_per'][layerNum];

    var starFactor = layerNum === 0 ? 7 / 8 : 1;  // see the stars section in README

    // filter.matrix = [
    //     1 - p, 0,     0,     r * p, 0,
    //     0,     1 - p, 0,     g * p, 0,
    //     0,     0,     1 - p, b * p, 0,
    //     0,     0,     0,     1,     0,
    // ];

    // This is ugly, but it avoids allocs
    var m = filter[0].matrix;
    m[0] = 1 - p;
    m[3] = r * p;
    m[6] = 1 - p;
    m[8] = g * p;
    m[12] = (1 - p) * starFactor;
    m[13] = b * p * starFactor;
}
