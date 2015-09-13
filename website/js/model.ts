import { Rectangle } from './coords';

export const pixelsPerTile = 48;
export const pixelsPerFilth = 50;
export const tilesPerSlice = 16;
export const slicesPerBlock = 16;
export const pixelsPerSlice = pixelsPerTile * tilesPerSlice;
export const pixelsPerBlock = pixelsPerTile * tilesPerSlice * slicesPerBlock;
export const spriteSets = [null, 'mansion', 'forest', 'city', 'laboratory', 'tutorial', 'nexus'];  // TODO: remove; only needed in spriteLoader

export interface Level {
    path: string;
    properties: { [key: string]: any };
    blocks: Block[];
    prerenders: { [layer: string]: PrerenderLayer };
    allEntities: Entity[];
    currentFog: Entity;
}

export function levelPopulate(level: Level) {
    var allSlices = <Slice[]>_.flatten<Slice>(_.map(level.blocks, b => b.slices), false);
    level.allEntities = <Entity[]>_.flatten<Entity>(_.map(allSlices, s => s.entities), false);
    _.each(level.blocks, block => {
        _.each(block.slices, slice => {
            slice.tiles = _.object(_.map(slice.tiles, (l, n) => [n, l.map((t: any) => {
                var d = atob(t[2]);
                return new Tile(t[0], t[1], d.charCodeAt(0));
            })]));
            slice.filth = _.map(slice.filth, (f: any) => {
                var d = atob(f[2]);
                var tile = _.find(slice.tiles[19], t => t.x === f[0] && t.y === f[1]);
                return new Filth(f[0], f[1], d.charCodeAt(0) | (d.charCodeAt(1) << 8), d.charCodeAt(10), tile.shapeIndex);
            });
        });
    });
}

export function tileWorldRect(block: Block, slice: Slice, tileX: number, tileY: number) {
    return new Rectangle(((block.x * slicesPerBlock + slice.x) * tilesPerSlice + tileX) * pixelsPerTile,
                         ((block.y * slicesPerBlock + slice.y) * tilesPerSlice + tileY) * pixelsPerTile,
                         pixelsPerTile, pixelsPerTile);
}

export function eachIntersectingSlice(level: Level, area: Rectangle, callback: (b: Block, s: Slice) => void) {
    for (var bx = Math.floor(area.left / pixelsPerBlock); bx < Math.ceil(area.right() / pixelsPerBlock); ++bx) {
        for (var by = Math.floor(area.top / pixelsPerBlock); by < Math.ceil(area.bottom() / pixelsPerBlock); ++by) {
            _.each(_.filter(level.blocks, b => b.x === bx && b.y === by), block => {
                var blockX = bx * pixelsPerBlock;
                var blockY = by * pixelsPerBlock;
                // TODO: prune to only intersecting slices
                _.each(block.slices, s => { callback(block, s); });
            });
        }
    }
}

export interface PrerenderLayer {
    scales: PrerenderTileScale[];
}

interface PrerenderTileScale {
    scale: number;
    tile_size: [number, number];
    tiles: [number, number][];
}

export interface Block {
    x: number;
    y: number;
    slices: Slice[];
}

export interface Slice {
    x: number;
    y: number;
    enemy_count: number;
    filth_count: number;
    tile_edge_count: number;
    filth_blocks: number;
    tiles: { [layer: string]: Tile[] };
    filth: Filth[];
    props: Prop[];
    entities: Entity[];
}

class Tile {
    constructor(public x: number, public y: number, public shapeIndex: number) { }

    public shape() {
        return tileShapes[this.shapeIndex] || tileShapes[0x80];
    }
}

class Filth {
    constructor(public x: number, public y: number, public edges: number, public caps: number, public shapeIndex: number) { }

    public eachEdge(callback: (e: TileEdge, m: number, c: number) => void) {
        var shape = tileShapes[this.shapeIndex] || tileShapes[0x80];
        if ((this.edges >> 0) & 0xf)  callback(shape.top,    (this.edges >> 0) & 0xf,  (this.caps >> 0) & 0x3);
        if ((this.edges >> 4) & 0xf)  callback(shape.bottom, (this.edges >> 4) & 0xf,  (this.caps >> 2) & 0x3);
        if ((this.edges >> 8) & 0xf)  callback(shape.left,   (this.edges >> 8) & 0xf,  (this.caps >> 4) & 0x3);
        if ((this.edges >> 12) & 0xf) callback(shape.right,  (this.edges >> 12) & 0xf, (this.caps >> 6) & 0x3);
    }
}

export type Prop = [number, number, number, number, number, number, number, number, number, number, number, number];
export function propX(p: Prop) { return p[1]; }
export function propY(p: Prop) { return p[2]; }
export function propRotation(p: Prop) { return p[3]; }
export function propScaleX(p: Prop) { return p[4]; }
export function propScaleY(p: Prop) { return p[5]; }
export function propSet(p: Prop) { return p[6]; }
export function propGroup(p: Prop) { return p[7]; }
export function propIndex(p: Prop) { return p[8]; }
export function propPalette(p: Prop) { return p[9]; }
export function propLayerGroup(p: Prop) { return p[10]; }
export function propLayerSub(p: Prop) { return p[11]; }

export type Entity = [number, string, number, number, number, number, number, number, boolean, { [name: string]: any }];
export function entityUid(e: Entity) { return e[0]; }
export function entityName(e: Entity) { return e[1]; }
export function entityX(e: Entity) { return e[2]; }
export function entityY(e: Entity) { return e[3]; }
export function entityProperties(e: Entity) { return e[9]; }

class TileShape {
    constructor(public top: TileEdge, public right: TileEdge, public bottom: TileEdge, public left: TileEdge) { }
}

export class TileEdge {
    public length: number;
    public angle: number;

    constructor(public x1: number, public y1: number, public x2: number, public y2: number) {
        this.length = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        this.angle = Math.atan2(y2 - y1, x2 - x1);
    }
}

function e(x1: number, y1: number, x2: number, y2: number) {
    return new TileEdge(x1, y1, x2, y2);
}

var tileShapes: { [i: number]: TileShape } = {
    0x80: new TileShape(e(0, 0, 1, 0),   e(1, 0, 1, 1),   e(1, 1, 0, 1),   e(0, 1, 0, 0)),
    0x81: new TileShape(e(0, 0, 1, 0.5), e(1, 0.5, 1, 1), e(1, 1, 0, 1),   e(0, 1, 0, 0)),
    0x82: new TileShape(e(0, 0.5, 1, 1), null,            e(1, 1, 0, 1),   e(0, 1, 0, 0.5)),
    0x91: new TileShape(e(0, 0, 1, 1),   null,            e(1, 1, 0, 1),   e(0, 1, 0, 0)),
    0x90: new TileShape(null,            e(0, 0, 0.5, 1), e(0.5, 1, 0, 1), e(0, 1, 0, 0)),
    0x8f: new TileShape(e(0, 0, 0.5, 0), e(0.5, 0, 1, 1), e(1, 1, 0, 1),   e(0, 1, 0, 0)),
    0x83: new TileShape(e(0, 0, 1, 0),   e(1, 0, 0.5, 1), e(0.5, 1, 0, 1), e(0, 1, 0, 0)),
    0x84: new TileShape(e(0, 0, 0.5, 0), e(0.5, 0, 0, 1), null,            e(0, 1, 0, 0)),
    0x92: new TileShape(e(0, 0, 1, 0),   null,            e(1, 0, 0, 1),   e(0, 1, 0, 0)),
    0x8e: new TileShape(e(0, 0, 1, 0),   null,            e(1, 0, 0, 0.5), e(0, 0.5, 0, 0)),
    0x8d: new TileShape(e(0, 0, 1, 0),   e(1, 0, 1, 0.5), e(1, 0.5, 0, 1), e(0, 1, 0, 0)),
    0x89: new TileShape(e(0, 0.5, 1, 0), e(1, 0, 1, 1),   e(1, 1, 0, 1),   e(0, 1, 0, 0.5)),
    0x8a: new TileShape(e(0, 1, 1, 0.5), e(1, 0.5, 1, 1), e(1, 1, 0, 1),   null),
    0x94: new TileShape(e(0, 1, 1, 0),   e(1, 0, 1, 1),   e(1, 1, 0, 1),   null),
    0x88: new TileShape(null,            e(1, 0, 1, 1),   e(1, 1, 0.5, 1), e(0.5, 1, 1, 0)),
    0x87: new TileShape(e(0.5, 0, 1, 0), e(1, 0, 1, 1),   e(1, 1, 0, 1),   e(0, 1, 0.5, 0)),
    0x8b: new TileShape(e(0, 0, 1, 0),   e(1, 0, 1, 1),   e(1, 1, 0.5, 1), e(0.5, 1, 0, 0)),
    0x8c: new TileShape(e(0.5, 0, 1, 0), e(1, 0, 1, 1),   null,            e(1, 1, 0.5, 0)),
    0x93: new TileShape(e(0, 0, 1, 0),   e(1, 0, 1, 1),   e(1, 1, 0, 0),   null),
    0x86: new TileShape(e(0, 0, 1, 0),   e(1, 0, 1, 0.5), e(1, 0.5, 0, 0), null),
    0x85: new TileShape(e(0, 0, 1, 0),   e(1, 0, 1, 1),   e(1, 1, 0, 0.5), e(0, 0.5, 0, 0)),
};
