import * as model from './model';
import { Sprite } from './spriteLoader';

export function distance(x1: number, y1: number, x2: number, y2: number) {
    return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
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

export function createDustforceSprite(sprite: Sprite, options?: DustforceSpriteOptions) {
    var s = new DustforceSprite(sprite);
    s.position.x = options ? (options.posX || 0) : 0;
    s.position.y = options ? (options.posY || 0) : 0;
    s.scale.x = options ? (options.scaleX || options.scale || 1) : 1;
    s.scale.y = options ? (options.scaleY || options.scale || 1) : 1;
    s.rotation = options ? (options.rotation || 0) : 0;
    s.alpha = options ? (options.alpha || 1) : 1;
    return s;
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

class DustforceSprite extends PIXI.Sprite {
    constructor(private sprite: Sprite) {
        super(PIXI.Texture.fromImage(sprite.imageURL));
    }

    // bit of a HACK here, this method isn't documented. but we need to stack transforms
    // in a different order than pixi does, so this seems to be the logical solution
    public updateTransform() {
        this.worldTransform.identity()
            .translate(this.sprite.hitbox.left, this.sprite.hitbox.top)
            .rotate(this.rotation)
            .scale(this.scale.x, this.scale.y)
            .translate(this.position.x, this.position.y)
            .prepend(this.parent.worldTransform);

        // do some other stuff that super.updateTransform does
        this.worldAlpha = this.alpha * this.parent.worldAlpha;
        this._currentBounds = null;
    }
}

export function applyFog(obj: PIXI.DisplayObject, fog: model.Entity, layerNum: number) {
    var fogProps = model.entityProperties(fog);
    var [r, g, b] = convertIntToRGB(fogProps['fog_colour'][layerNum]);
    var p = fogProps['fog_per'][layerNum];
    var f = new PIXI.filters.ColorMatrixFilter();
    f.matrix = [
        1 - p, 0,     0,     r * p, 0,
        0,     1 - p, 0,     g * p, 0,
        0,     0,     1 - p, b * p, 0,
        0,     0,     0,     1,     0,
    ];
    obj.filters = [f];
}
