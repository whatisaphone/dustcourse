using System;
using System.Collections.Generic;

namespace level_machine {
    internal sealed class Level {
        public List<Tuple<string, object>> Tags;
        public List<Block> Blocks = new List<Block>();
    }

    internal sealed class Block {
        public short X, Y;
        public List<Slice> Slices = new List<Slice>();
    }

    internal sealed class Slice {
        public SliceHeader Header;
        public List<Tile> Tiles = new List<Tile>();
        public List<Filth> Filth = new List<Filth>();
        public List<Prop> Props = new List<Prop>();
        public List<Entity> Entities = new List<Entity>();
    }

    internal sealed class SliceHeader {
        public int TotalSize, HeaderSize;
        public ushort Field8;
        public byte X, Y, FieldC;
        public int Field14;
        public ushort EnemyCount, FilthCount, TileEdgeCount, FilthBlocks;
        public int Kinds;
    }

    internal sealed class Tile {
        public byte X, Y, Layer;
        public byte Flags;
        public byte Edges;
        public byte EndCaps;
        public byte SpriteSet;
        public byte SpritePalette;
        public byte SpriteTile;
        public byte[] RawData;

        public bool IsSolid { get { return (Flags & 0x80) != 0; } }
    }

    internal sealed class Filth {
        public byte p;
        public byte q;
        public byte[] RawData;
    }

    internal sealed class Prop {
        public int Field4;
        public float X, Y;
        public float Rotation;
        public bool FlipHorz, FlipVert;
        public byte PropSet;
        public ushort PropGroup, PropIndex;
        public byte Palette;
        public byte LayerGroup, LayerSub;
    }

    internal sealed class Entity {
        public string Name;
        public float Field1C, Field20;
        public ushort Field24;
        public byte Field28;
        public bool Field2C, Field30, Field34;
        public List<Tuple<string, object>> Tags;
    }
}
