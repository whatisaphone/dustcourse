using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;

namespace level_machine {
    internal static class LevelParser {
        public static Level LoadLevel(byte[] data, bool loadAsDiff) {
            var level = new Level();
            var stream = new BitStream(data);

            var buffer = new byte[6];
            stream.Read(buffer, 48);
            if (loadAsDiff)
                throw new NotImplementedException();
            if (buffer[0] != 'D' || buffer[1] != 'F' || buffer[2] != '_' || buffer[3] != 'L' || buffer[4] != 'V' || buffer[5] != 'L')
                throw new InvalidDataException();
            stream.Read(buffer, 16);
            ushort levelFormatVersion = Util.MakeU16(buffer);
            int thingCount = 0;
            if (levelFormatVersion >= 0x2b) {
                stream.Read(buffer, 32);  // ignored
                stream.Read(buffer, 32);
                thingCount = Util.MakeI32(buffer);

                LoadLevelMetadata(stream);
            }
            if (levelFormatVersion >= 0x2c) {
                stream.Read(buffer, 32);
                int thumbnailSize = Util.MakeI32(buffer);
                if (!loadAsDiff) {
                    var thumbnailBuffer = new byte[thumbnailSize];
                    stream.Read(thumbnailBuffer, thumbnailSize * 8);
                }
            }
            level.Tags = ReadKeyValueList(stream);

            var itemsOffset = ((stream.BitPosition - 1) / 8 + 1) + (4 * thingCount);

            for (var t = 0; t < thingCount; ++t) {
                stream.Read(buffer, 32);
                var ptr = itemsOffset + Util.MakeI32(buffer);
                var itemBytes = Util.MakeI32(data, ptr);
                var item = new byte[itemBytes];
                Array.Copy(data, ptr, item, 0, itemBytes);
                level.Blocks.Add(LoadBlock(item));
            }

            return level;
        }

        private static void LoadLevelMetadata(BitStream stream) {
            var buffer = new byte[6];
            stream.Read(buffer, 48);
            if (buffer[0] != 'D' || buffer[1] != 'F' || buffer[2] != '_' || buffer[3] != 'M' || buffer[4] != 'T' || buffer[5] != 'D')
                throw new InvalidDataException("Level metadata invalid!");
            stream.Read(buffer, 16);
            ushort formatVersion = Util.MakeU16(buffer);
            if (formatVersion < 2)
                throw new InvalidDataException("Level metadata out of date!.");
            stream.Read(buffer, 32);  // byte count; not important
            stream.Read(buffer, 32);
            int field_24 = Util.MakeI32(buffer);
            stream.Read(buffer, 32);
            int field_28 = Util.MakeI32(buffer);
            stream.Read(buffer, 32);  // ignored
            stream.Read(buffer, 32);
            int nested_field_3c = Util.MakeI32(buffer);
        }

        private static List<Tuple<string, object>> ReadKeyValueList(BitStream stream) {
            var ret = new List<Tuple<string, object>>();
            for (; ; ) {
                var pair = ReadKeyValuePair(stream);
                if (pair == null)
                    return ret;
                ret.Add(pair);
            }
        }

        private static Tuple<string, object> ReadKeyValuePair(BitStream stream) {
            var buf = new byte[4];
            stream.Read(buf, 4);
            var valueType = buf[0];
            if (valueType == 0)
                return null;

            stream.Read(buf, 6);
            var charCount = Util.MakeI32(buf);
            var keyChars = new char[64];
            stream.ReadPackedText(keyChars, charCount);
            var key = new string(keyChars, 0, keyChars.ToList().IndexOf('\0'));
            //            Trace(key);

            ushort valueCount = 1;
            List<object> array = null;
            if (valueType == 15) {
                stream.Read(buf, 4);
                valueType = buf[0];
                stream.Read(buf, 16);
                valueCount = Util.MakeU16(buf);
                array = new List<object>();
            }

            if (valueCount == 0) {
                Debug.Assert(array != null);
                return Tuple.Create(key, (object)array);
            }

            var curValue = 0;
            for (; ; ) {
                object value;
                switch (valueType - 1) {
                    case 0:
                        stream.Read(buf, 1);
                        value = buf[0] != 0;
                        break;
                    case 1:
                    case 2:
                        stream.Read(buf, 32);
                        value = Util.MakeI32(buf);
                        break;
                    case 3:
                        value = stream.ReadFloat(32, 32);
                        break;
                    case 4:
                        stream.Read(buf, 16);
                        var strBytes = Util.MakeU16(buf);
                        var strBuf = new byte[strBytes];
                        stream.Read(strBuf, strBytes * 8);
                        value = Encoding.ASCII.GetString(strBuf);
                        break;
                    case 9:
                        var first = stream.ReadFloat(32, 32);
                        var second = stream.ReadFloat(32, 32);
                        value = String.Format("{0}, {1}", first, second);
                        break;
                    default:
                        throw new InvalidDataException("unknown value type");
                        value = null;
                        break;
                }

                if (valueType == 14) {
                    throw new NotImplementedException("must test this and also figure out what it does");
                    ReadKeyValueList(stream);
                }

                if (array != null)
                    array.Add(value);

                ++curValue;
                if (curValue >= valueCount)
                    return Tuple.Create(key, array ?? value);
            }
        }

        private static Block LoadBlock(byte[] data) {
            var block = new Block();
            var outerStream = new BitStream(data);
            var buf = new byte[4];
            outerStream.Read(buf, 32);  // total wrapper data size
            outerStream.Read(buf, 32);
            var inflatedSize = Util.MakeI32(buf);
            outerStream.Read(buf, 16);
            block.X = Util.MakeI16(buf);
            outerStream.Read(buf, 16);
            block.Y = Util.MakeI16(buf);
            outerStream.Read(buf, 16);  // ignored
            outerStream.Read(buf, 16);
            var sliceCount = Util.MakeU16(buf);
            outerStream.Read(buf, 8);
            var extraEagerSlice = buf[0] != 0;

            Trace("block {0:X4} {1:X4} {2}", block.X, block.Y, extraEagerSlice);

            // in the original source it's 17, which is the total of the sizes of the fields read above.
            // however, here we pass 19 instead of 17 so as to skip the 2-byte zlib header of 78 9C
            if (data[17] != 0x78 || data[18] != 0x9c)
                throw new InvalidDataException();
            var deflate = new DeflateStream(new MemoryStream(data, 19, data.Length - 19), CompressionMode.Decompress);
            var innerData = new byte[inflatedSize];
            deflate.Read(innerData, 0, inflatedSize);

            //            var innerStream = new BitStream(innerData);
            //            innerStream.Read(buf, 32);
            //            var innerDataSize = Util.MakeI32(buf);
            //            innerStream.Read(buf, 16);
            //            var more = Util.MakeU16(buf) > 4;
            //            innerStream.Read(buf, 8);
            //            var something3 = buf[0];
            //            innerStream.Read(buf, 8);
            //            var something4 = buf[0];
            //            innerStream.Read(buf, 8);  // ignored
            //            if (more) {
            //                innerStream.Read(buf, 32);
            //                innerStream.Read(buf, 16);
            //                innerStream.Read(buf, 16);
            //            }

            //            Trace("{0:X4} {1:X4} {2:X4} | {3}", something1, something2, somethingCount, Hexify(innerData));

            var innerStream = new BitStream(innerData);
            var innerDataPos = 0;

            for (var i = 0; i <= sliceCount; ++i) {
                if (i == sliceCount && !extraEagerSlice)
                    break;
                var innerDataSize = Util.MakeI32(innerData, innerDataPos);
                innerStream.BitPosition = innerDataPos * 8;
                // the game streams in all but the optional last slice. uncomment
                // this conditional to match the actual game's loading order
                //if (i >= sliceCount)
                block.Slices.Add(LoadSlice(innerStream));
                innerDataPos += innerDataSize;
            }

            return block;
        }

        private static Slice LoadSlice(BitStream stream) {
            var slice = new Slice();
            slice.Header = ReadSliceHeader(stream);

            Trace("slice {0:X4} {1:X2} {2:X2} {3:X2} {4:X8} {5} {6} {7} {8}",
                slice.Header.Field8, slice.Header.X, slice.Header.Y, slice.Header.FieldC, slice.Header.Field14,
                slice.Header.FilthCount, slice.Header.EnemyCount, slice.Header.TileEdgeCount, slice.Header.FilthBlocks);

            //            Trace(header.Kinds);
            if ((slice.Header.Kinds & 1) != 0)
                slice.Tiles = LoadTiles(stream);
            if ((slice.Header.Kinds & 2) != 0)
                slice.Filth = LoadFilth(stream);
            if ((slice.Header.Kinds & 8) != 0)
                slice.Props = LoadProps(stream);
            if ((slice.Header.Kinds & 4) != 0)
                slice.Entities = LoadEntities(stream);

            return slice;
        }

        private static SliceHeader ReadSliceHeader(BitStream stream) {
            var header = new SliceHeader();
            var buf = new byte[4];

            header.HeaderSize = 25;
            stream.Read(buf, 32);
            header.TotalSize = Util.MakeI32(buf);
            stream.Read(buf, 16);
            header.Field8 = Util.MakeU16(buf);
            stream.Read(buf, 8);
            header.X = buf[0];
            stream.Read(buf, 8);
            header.Y = buf[0];
            stream.Read(buf, 8);
            header.FieldC = buf[0];

            if (header.Field8 > 4) {
                stream.Read(buf, 32); ;
                header.Field14 = Util.MakeI32(buf);
                stream.Read(buf, 16);
                header.FilthCount = Util.MakeU16(buf);
                stream.Read(buf, 16);
                header.EnemyCount = Util.MakeU16(buf);
            }

            if (header.Field8 > 5) {
                stream.Read(buf, 16);
                header.TileEdgeCount = Util.MakeU16(buf);
                stream.Read(buf, 16);
                header.FilthBlocks = Util.MakeU16(buf);
            }

            if (header.Field8 < 6)
                header.HeaderSize -= 4;
            if (header.Field8 < 5)
                header.HeaderSize -= 8;

            stream.Read(buf, 32);
            header.Kinds = Util.MakeI32(buf);

            return header;
        }

        private static List<Tile> LoadTiles(BitStream stream) {
            var ret = new List<Tile>();
            var buf = new byte[14];
            stream.Read(buf, 8);
            var count = buf[0];
            for (var i = 0; i < count; ++i) {
                stream.Read(buf, 8);
                var layer = buf[0];
                stream.Read(buf, 10);
                var c2 = Util.MakeU16(buf);
                var count2 = c2 != 0 ? c2 : 1024;
                Debug.Assert(count2 != 1024);
                for (var j = 0; j < count2; ++j) {
                    stream.Read(buf, 5);
                    var somethingP = buf[0];
                    stream.Read(buf, 5);
                    var somethingQ = buf[0];
                    stream.Read(buf, 104);
                    ret.Add(LoadSingleTile(somethingP, somethingQ, layer, buf));
                }
            }
            return ret;
        }

        private static Tile LoadSingleTile(byte x, byte y, byte layer, byte[] data) {
            var tile = new Tile {
                X = x,
                Y = y,
                Layer = layer,
                Shape = data[0],
                Edges = data[1],
                EndCaps = data[2],
                SpriteSet = (byte)(data[11] & 0xf),
                SpritePalette = (byte)(data[11] >> 4),
                SpriteTile = data[12],
                RawData = data.ToArray(),
            };
            Trace("tile {0:X2} {1:X2} {2:X2} | {3:X2} {4:X2} {5} {6} {7} | {8}",
                x, y, layer, tile.Shape, tile.Edges, tile.SpriteSet, tile.SpritePalette, tile.SpriteTile, Util.Hexify(data));
            return tile;
        }

        private static List<Filth> LoadFilth(BitStream stream) {
            var ret = new List<Filth>();
            var buf = new byte[12];
            stream.Read(buf, 10);
            var c = Util.MakeU16(buf);
            var count = c != 0 ? c : 1024;
            for (var i = 0; i < count; ++i) {
                stream.Read(buf, 5);
                var x = buf[0];
                stream.Read(buf, 5);
                var y = buf[0];
                stream.Read(buf, 96);
                ret.Add(LoadSingleFilth(x, y, buf.ToArray()));
            }
            return ret;
        }

        private static Filth LoadSingleFilth(byte x, byte y, byte[] data) {
            Trace("filth {0:X2} {1:X2} | {2}", x, y, Util.Hexify(data));
            return new Filth {
                X = x,
                Y = y,
                Edges = Util.MakeU16(data),
                EndCaps = data[10],
                RawData = data,
            };
        }

        private static List<Prop> LoadProps(BitStream stream) {
            var ret = new List<Prop>();
            var buf = new byte[4];
            stream.Read(buf, 16);
            var count = Util.MakeU16(buf);
            for (var i = 0; i < count; ++i) {
                stream.Read(buf, 32);
                var something = Util.MakeI32(buf);
                if (something >= 0) {
                    var prop = new Prop();
                    prop.Field4 = something;
                    stream.Read(buf, 8);
                    prop.LayerGroup = buf[0];
                    stream.Read(buf, 8);
                    prop.LayerSub = buf[0];
                    prop.X = stream.ReadFloat(28, 4);
                    prop.Y = stream.ReadFloat(28, 4);
                    stream.Read(buf, 16);
                    prop.Rotation = (float) (Util.MakeU16(buf) * (65536 / 360.0));
                    stream.Read(buf, 1);
                    prop.FlipHorz = buf[0] == 0;  // buf[0] != 0 ? 1 : -1;
                    stream.Read(buf, 1);
                    prop.FlipVert = buf[0] == 0;  // buf[0] != 0 ? 1 : -1;
                    stream.Read(buf, 8);
                    prop.PropSet = buf[0];
                    stream.Read(buf, 12);
                    prop.PropGroup = Util.MakeU16(buf);
                    stream.Read(buf, 12);
                    prop.PropIndex = Util.MakeU16(buf);
                    stream.Read(buf, 8);
                    prop.Palette = buf[0];
                    Trace("prop {0:N} {1:N} {2:N} {3:X8} {4:X8} {5:X2} {6:X4} {7:X4} {8:X2} {9:X2} {10:X2}",
                        prop.X, prop.Y, prop.Rotation, prop.FlipHorz, prop.FlipVert, prop.PropSet, prop.PropGroup, prop.PropIndex, prop.Palette, prop.LayerGroup, prop.LayerSub);
                    ret.Add(prop);
                } else
                    throw new NotImplementedException();
            }
            return ret;
        }

        private static List<Entity> LoadEntities(BitStream stream) {
            var ret = new List<Entity>();
            var buf = new byte[4];
            stream.Read(buf, 16);
            var count = Util.MakeU16(buf);
            for (var i = 0; i < count; ++i) {
                var oldBitPos = stream.BitPosition;
                stream.Read(buf, 32);
                var x = Util.MakeI32(buf);
                if ((x & 0x80000000) == 0) {
                    stream.BitPosition = oldBitPos;
                    ret.Add(ReadSingleEntity(stream));
                }
            }
            return ret;
        }

        private static Entity ReadSingleEntity(BitStream stream) {
            var buf = new byte[4];

            stream.Read(buf, 32);
            var something = Util.MakeI32(buf);

            Debug.Assert((something & 0x80000000) == 0);
            //if ((something & 0x80000000) == 0) {
            stream.Read(buf, 6);
            var count = buf[0];
            var chars = new char[64];
            stream.ReadPackedText(chars, count);
            var name = new string(chars, 0, count);
            //}

            var entity = new Entity { Kind = name };
            entity.X = stream.ReadFloat(32, 8);
            entity.Y = stream.ReadFloat(32, 8);
            stream.Read(buf, 16);
            entity.Field24 = Util.MakeU16(buf);
            stream.Read(buf, 8);
            entity.Field28 = buf[0];
            stream.Read(buf, 1);
            entity.Field2C = buf[0] != 0;  // buf[0] != 0 ? 1 : -1
            stream.Read(buf, 1);
            entity.Field30 = buf[0] != 0;  // buf[0] != 0 ? 1 : -1;
            stream.Read(buf, 1);
            entity.Field34 = buf[2] != 0;
            entity.Tags = ReadKeyValueList(stream);
            Trace("entity {0} {1:N} {2:N} {3:X4} {4:X2} {5} {6} {7} {8}",
                name, entity.X, entity.Y, entity.Field24, entity.Field28,
                entity.Field2C, entity.Field30, entity.Field34, Util.DumpKeyValueList(entity.Tags));
            return entity;
        }

        private static void Trace(string format, params object[] args) {
            //Debug.WriteLine(format, args);
        }
    }
}
