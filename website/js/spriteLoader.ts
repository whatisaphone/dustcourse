import { Rectangle } from './coords';

const spriteSets = [null, 'mansion', 'forest', 'city', 'laboratory', 'tutorial', 'nexus'];
const propGroups = [
    'books', 'buildingblocks', 'chains', 'decoration', 'facade', 'foliage', 'furniture', 'gazebo',
    'lighting', null, 'statues', 'storage', 'study', 'fencing', null, null,
    null, null, 'backleaves', 'leaves', 'trunks', 'boulders', 'backdrops', 'temple',
    'npc', 'symbol', 'cars', 'sidewalk', 'machinery'
];

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

    public pathForFrame(frame: number) {
        var spriteFrame = Math.floor(frame / this.frameDuration60) % this.frameCount + 1;
        return this.urlPrefix + spriteFrame + '_0001';
    }
}

var props: { [key: string]: SpriteAnim } = _.object([
    new SpriteAnim('/static/sprites/area/city/props/facade_5_', 6, 6),
].map(a => [a.urlPrefix, a]));

export function propAnim(set: number, group: number, index: number, palette: number) {
    var isBackdrop = propGroups[group] === 'backdrops' && spriteSets[set] !== 'mansion';
    var dir = isBackdrop ? 'backdrops' : 'props';
    var groupName = isBackdrop && spriteSets[set] === 'mansion' ? 'backdrop' : propGroups[group];
    var prefix = '/static/sprites/area/' + spriteSets[set] + '/' + dir + '/' + groupName + '_' + index + '_';
    if (props[prefix])
        return props[prefix];
    return new SpriteAnim(prefix, 1, 1);  // TODO: have SpriteAnim use `palette` instead of 1 for its url
}
