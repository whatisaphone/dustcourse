export interface Level {
    path: string;
    properties: { [key: string]: any };
    layers: { [key: string]: Layer };
    blocks: Block[];
    allEntities: Entity[];
}

export function levelPopulate(level: Level) {
    var allSlices = <Slice[]>_.flatten<Slice>(_.map(level.blocks, b => b.slices), false);
    level.allEntities = <Entity[]>_.flatten<Entity>(_.map(allSlices, s => s.entities), false);
}

interface Layer {
    scales: TileScale[];
}

interface TileScale {
    scale: number;
    tile_size: [number, number];
    tiles: [number, number][];
}

interface Block {
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
    tiles: Tile[][];
    filth: Filth[];
    props: Prop[];
    entities: Entity[];
}

type Tile = [number, number, number, string];

type Filth = [number, number, string];

type Prop = [number, number, number, number, number, number, number, number, number, number, number, number];

export type Entity = [string, number, number, number, number, boolean, boolean, boolean, { [name: string]: any }];
export function entityName(e: any[]) { return e[0]; }
export function entityX(e: any[]) { return e[1]; }
export function entityY(e: any[]) { return e[2]; }
export function entityProperties(e: any[]) { return e[8]; }
