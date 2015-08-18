import { Rectangle } from './coords';

export class SpriteLoader {
    private sprites: { [url: string]: Sprite } = {};

    public get(url: string, loaded: () => void) {
        if (url in this.sprites)
            return this.sprites[url];

        this.sprites[url] = null;  // so we don't send multiple requests for the same url

        var image = document.createElement('img');
        image.src = url + '.png';
        image.onload = () => {
            checkBothLoaded();
        };

        var metadata: SpriteMetadata;
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.onload = function () {
            if (xhr.status !== 200)
                return;
            metadata = JSON.parse(xhr.response);
            checkBothLoaded();
        };
        xhr.open('get', url + '.json');
        xhr.send();

        var checkBothLoaded = () => {
            if (!image.complete || !metadata)
                return;

            var hitbox = Rectangle.ltrb(metadata.rect1.l, metadata.rect1.t, metadata.rect1.r, metadata.rect1.b);
            this.sprites[url] = new Sprite(image, hitbox);
            loaded();
        };
    }
}

class Sprite {
    constructor(public image: HTMLImageElement, public hitbox: Rectangle) { }
}

interface SpriteMetadata {
    rect1: { t: number, l: number, b: number, r: number };
}

export class SpriteAnim {
	constructor(public urlPrefix: string, public frameCount: number, public frameDuration60: number) { }
}
