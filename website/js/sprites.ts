import { Rectangle } from './coords';

const spriteSets = [null, 'mansion', 'forest', 'city', 'laboratory', 'tutorial', 'nexus'];
const propGroups = [
    'books', 'buildingblocks', 'chains', 'decoration', 'facade', 'foliage', 'furniture', 'gazebo',
    'lighting', null, 'statues', 'storage', 'study', 'fencing', null, null,
    null, null, 'backleaves', 'leaves', 'trunks', 'boulders', 'backdrops', 'temple',
    'npc', 'symbol', 'cars', 'sidewalk', 'machinery'
];

export class TextureContainer {
    public static IDLE = 0;
    public static LOADING = 1;
    public static LOADED = 2;
    public static ERROR = 3;

    public state: number;
    public texture: PIXI.Texture;
    public image: HTMLImageElement;

    constructor(public url: string, public priority: number) {
        this.state = TextureContainer.IDLE;
        this.image = document.createElement('img');
        this.texture = new PIXI.Texture(new PIXI.BaseTexture(this.image));
    }

    public load() {
        this.state = TextureContainer.LOADING;
        this.image.src = this.url;
        this.texture.baseTexture.on('loaded', () => { this.imageLoaded(); });
        this.texture.baseTexture.on('error', () => { this.imageLoaded(); });
    }

    private imageLoaded() {
        this.state = TextureContainer.LOADED;
    }
}

class TextureManager {
    private allTextures: { [url: string]: TextureContainer } = {};

    constructor() { }

    public getTexture(url: string, priority: number) {
        var tex = this.allTextures[url];
        if (tex)
            return tex;
        tex = new TextureContainer(url, priority);
        this.allTextures[url] = tex;
        this.fillLoadQueue();
        return tex;
    }

    private fillLoadQueue() {
        var numLoading = _.filter(this.allTextures, t => t.state === TextureContainer.LOADING).length;
        var unloaded = _.filter(this.allTextures, t => t.state === TextureContainer.IDLE);
        unloaded = _.sortBy(unloaded, t => t.priority);
        while (numLoading < 4 && unloaded.length) {
            var tex = unloaded.pop();
            tex.load();
            tex.texture.baseTexture.on('loaded', () => { this.fillLoadQueue(); });
            tex.texture.baseTexture.on('error', () => { this.fillLoadQueue(); });
            ++numLoading;
        }
    }
}

var textureManager = new TextureManager();

export function getTexture(url: string, priority: number) {
    return textureManager.getTexture(url, priority);
}

export function spriteTextureURL(name: string) {
    return '/static/sprites/' + name + '.png';
}

var loadedSprites: { [name: string]: Sprite } = {};

export function loadSprite(name: string, priority: number) {
    if (name in loadedSprites)
        return loadedSprites[name];

    loadedSprites[name] = null;  // so we don't send multiple requests for the same url

    var texture = getTexture(spriteTextureURL(name), priority);

    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
        if (xhr.status !== 200)
            return;  // TODO: better indication of error
        var metadata: SpriteMetadata = JSON.parse(xhr.response);
        var hitbox = Rectangle.ltrb(metadata.hitbox[1], metadata.hitbox[0], metadata.hitbox[3], metadata.hitbox[2]);
        loadedSprites[name] = new Sprite(texture, hitbox);
    };
    xhr.open('get', '/static/sprites/' + name + '.json');
    xhr.send();
}

export class Sprite {
    constructor(public texture: TextureContainer, public hitbox: Rectangle) { }
}

interface SpriteMetadata {
    hitbox: [number, number, number, number];
}

export class SpriteAnim {
	constructor(public urlPrefix: string, public frameCount: number, public frameDuration60: number) { }

    public pathForFrame(frame: number) {
        var spriteFrame = Math.floor(frame / this.frameDuration60) % this.frameCount + 1;
        return this.urlPrefix + spriteFrame + '_0001';
    }
}

var props: { [key: string]: SpriteAnim } = _.object([
    new SpriteAnim('area/city/props/facade_5_', 6, 6),
    new SpriteAnim('area/city/props/lighting_1_', 6, 6),
    new SpriteAnim('area/city/props/lighting_2_', 6, 6),
    new SpriteAnim('area/forest/props/decoration_1_', 7, 6),
    new SpriteAnim('area/forest/props/lighting_1_', 6, 6),
    new SpriteAnim('area/forest/props/lighting_2_', 6, 6),
    new SpriteAnim('area/laboratory/props/machinery_18_', 10, 6),
    new SpriteAnim('area/laboratory/props/machinery_19_', 10, 6),
    new SpriteAnim('area/mansion/props/furniture_9_', 6, 6),
    new SpriteAnim('area/mansion/props/lighting_1_', 5, 6),
    new SpriteAnim('area/mansion/props/lighting_2_', 6, 6),
    new SpriteAnim('area/mansion/props/lighting_3_', 6, 6),
    new SpriteAnim('area/mansion/props/lighting_4_', 6, 6),
    new SpriteAnim('area/mansion/props/lighting_5_', 6, 6),
    new SpriteAnim('area/mansion/props/lighting_6_', 6, 6),
    new SpriteAnim('area/mansion/props/lighting_7_', 6, 6),
    new SpriteAnim('area/mansion/props/lighting_8_', 6, 6),
    new SpriteAnim('area/mansion/props/lighting_9_', 18, 6),
    new SpriteAnim('area/mansion/props/lighting_10_', 2, 6),
    new SpriteAnim('area/mansion/props/lighting_11_', 2, 6),
    new SpriteAnim('area/nexus/props/npc_1_', 15, 6),  // actually, this one is 3 animated sprites in 45 frames. what to do..?
    new SpriteAnim('area/nexus/props/npc_2_', 21, 6),
    new SpriteAnim('area/nexus/props/npc_3_', 15, 6),
    new SpriteAnim('area/nexus/props/npc_4_', 10, 6),
    new SpriteAnim('area/nexus/props/npc_5_', 12, 6),
    new SpriteAnim('area/tutorial/props/npc_1_', 17, 6),
].map(a => [a.urlPrefix, a]));

export function propAnim(set: number, group: number, index: number, palette: number) {
    var isBackdrop = propGroups[group] === 'backdrops' && spriteSets[set] !== 'mansion';
    var dir = isBackdrop ? 'backdrops' : 'props';
    var groupName = isBackdrop && spriteSets[set] === 'mansion' ? 'backdrop' : propGroups[group];
    var prefix = 'area/' + spriteSets[set] + '/' + dir + '/' + groupName + '_' + index + '_';
    if (props[prefix])
        return props[prefix];
    return new SpriteAnim(prefix, 1, 1);  // TODO: have SpriteAnim use `palette` instead of 1 for its url
}

var entities: { [key: string]: SpriteAnim } = {
    'enemy_bear': new SpriteAnim('entities/forest/bear/idle_', 8, 6),
    'enemy_book': new SpriteAnim('entities/mansion/book/airidle_', 6, 6),
    'enemy_butler': new SpriteAnim('entities/mansion/butler/walk_', 10, 6),
    'enemy_chest_scrolls': new SpriteAnim('entities/mansion/chest/idle_', 7, 6),
    'enemy_critter': new SpriteAnim('entities/forest/critter/airidle_', 7, 6),
    'enemy_flag': new SpriteAnim('entities/mansion/flag/idle_', 8, 6),
    'enemy_gargoyle_big': new SpriteAnim('entities/mansion/bgargoyle/idle_', 10, 6),
    'enemy_gargoyle_small': new SpriteAnim('entities/mansion/gargoyle/airidle_', 6, 6),
    'enemy_key': new SpriteAnim('entities/mansion/key/idle_', 8, 6),
    'enemy_knight': new SpriteAnim('entities/mansion/knight/idle_', 10, 6),
    'enemy_maid': new SpriteAnim('entities/mansion/maid/walk_', 9, 6),
    'enemy_porcupine': new SpriteAnim('entities/forest/porcupine/idle_', 6, 6),
    'enemy_scrolls': new SpriteAnim('entities/mansion/scroll/idle_', 3, 6),
    'enemy_slime_ball': new SpriteAnim('entities/laboratory/slimeball/airidle_', 7, 6),
    'enemy_slime_barrel': new SpriteAnim('entities/laboratory/barrel/airidle_', 15, 6),
    'enemy_slime_beast': new SpriteAnim('entities/laboratory/slimebeast/idle_', 8, 6),
    'enemy_spring_ball': new SpriteAnim('entities/laboratory/springball/idle_', 8, 6),
    'enemy_stonebro': new SpriteAnim('entities/forest/stonebro/idle_', 1, 1),
    'enemy_stoneboss': new SpriteAnim('entities/forest/stoneboss/idle_', 1, 1),
    'enemy_trash_bag': new SpriteAnim('entities/city/trashbag/spin_', 4, 6),
    'enemy_trash_ball': new SpriteAnim('entities/city/trashball/airidle_', 7, 6),
    'enemy_trash_beast': new SpriteAnim('entities/city/trashbeast/idle_', 8, 6),
    'enemy_trash_can': new SpriteAnim('entities/city/trashcan/idle_', 7, 6),
    'enemy_trash_tire': new SpriteAnim('entities/city/trashtire/idle_', 7, 6),
    'enemy_treasure': new SpriteAnim('entities/mansion/treasure/idle1_', 3, 6),
    'enemy_tutorial_hexagon': new SpriteAnim('entities/tutorial/hexagon/airidle_', 17, 6),
    'enemy_tutorial_square': new SpriteAnim('entities/tutorial/square/airidle_', 18, 6),
    'enemy_wolf': new SpriteAnim('entities/forest/wolf/idle_', 7, 6),
};

export function entityAnim(name: string) {
    return entities[name];
}
