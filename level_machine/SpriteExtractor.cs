using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace level_machine {
    internal static class SpriteExtractor {
        public static void ExtractSprites(string name, byte[] data) {
            Directory.CreateDirectory(Path.Combine(App.IntermediatePath, name));

            var info = ExtractSpriteInfo(name, data);
            if (info != null)
                CompositeSprites(info.Item1, info.Item2);
        }

        private static void Trace(string format, params object[] args) {
            //Console.WriteLine(format, args);
        }

        private static Tuple<List<SpriteGroup>, List<SpriteTexture>> ExtractSpriteInfo(string name, byte[] data) {
            var groups = new List<SpriteGroup>();
            var textures = new List<SpriteTexture>();

            var stream = new BitStream(data);
            var buffer = new byte[32];

            stream.Read(buffer, 48);
            if (buffer[0] != 'D' || buffer[1] != 'F' || buffer[2] != '_' || buffer[3] != 'S' || buffer[4] != 'P' || buffer[5] != 'R') {
                Console.WriteLine("ignoring malformed sprite file: " + name);
                return null;
            }

            stream.Read(buffer, 16);
            var version = Util.MakeU16(buffer);
            if (version != 0x2c)
                throw new InvalidDataException();
            stream.Read(buffer, 16);
            var groupCount = Util.MakeU16(buffer);
            stream.Read(buffer, 16);
            var textureCount = Util.MakeU16(buffer);
            stream.Read(buffer, 16);
            var unk3 = Util.MakeU16(buffer);
            stream.Read(buffer, 16);
            var unk4 = Util.MakeU16(buffer);
            stream.Read(buffer, 16);
            var unk5 = Util.MakeU16(buffer);
            stream.Read(buffer, 32);
            var pixelDataOffset = Util.MakeI32(buffer);
            stream.Read(buffer, 32);
            //var pixelDataLength = Util.MakeI32(buffer);

            for (var i = 0; i < groupCount; ++i) {
                var group = new SpriteGroup();

                stream.Read(buffer, 8);
                var count = buffer[0];
                stream.Read(buffer, count * 8);
                group.Name = Encoding.ASCII.GetString(buffer, 0, count);
                stream.Read(buffer, 8);
                count = buffer[0];
                stream.Read(buffer, count * 8);
                group.Prefix = Encoding.ASCII.GetString(buffer, 0, count);

                stream.Read(buffer, 32);
                var extraLen = Util.MakeI32(buffer);
                if (extraLen != 0) {
                    var buf = new byte[extraLen];
                    stream.Read(buf, extraLen * 8);
                    Console.WriteLine("(ignoring {0} bytes of extra data in '{1}')", extraLen, name);
                }

                stream.Read(buffer, 16);
                var count1 = Util.MakeI16(buffer);
                stream.Read(buffer, 16);
                var count2 = Util.MakeI16(buffer);
                stream.Read(buffer, 16);
                var unk11 = Util.MakeI16(buffer);
                stream.Read(buffer, 16);
                var unk12 = Util.MakeI16(buffer);
                stream.Read(buffer, 16);
                var unk13 = Util.MakeI16(buffer);
                stream.Read(buffer, 8);
                var unk14 = buffer[0];

                Trace("group {0}{1} {2} {3} {4} {5}", group.Prefix, group.Name, unk11, unk12, unk13, unk14);

                for (var j = 0; j < count1; ++j) {
                    var frame = new SpriteFrame();
                    stream.Read(buffer, 16);
                    frame.Field4 = Util.MakeI16(buffer);
                    stream.Read(buffer, 16);
                    frame.Field0 = Util.MakeI16(buffer);
                    stream.Read(buffer, 64);
                    frame.Rect1 = Rectangle.FromLTRB(Util.MakeI16(buffer, 2), Util.MakeI16(buffer, 0), Util.MakeI16(buffer, 6), Util.MakeI16(buffer, 4));
                    stream.Read(buffer, 64);
                    frame.Rect2 = Rectangle.FromLTRB(Util.MakeI16(buffer, 2), Util.MakeI16(buffer, 0), Util.MakeI16(buffer, 6), Util.MakeI16(buffer, 4));
                    stream.Read(buffer, 32);
                    frame.ChunksOffset = Util.MakeI32(buffer);
                    stream.Read(buffer, 16);
                    frame.ChunkCount = Util.MakeI16(buffer);
                    stream.Read(buffer, 8);
                    frame.Field28 = buffer[0];
                    group.Frames.Add(frame);
                    Trace("  frame {0:X4} {1:X4} {2} {3} {4:X8} {5:X4} {6:X2}", frame.Field4, frame.Field0,
                        frame.Rect1, frame.Rect2, frame.ChunksOffset, frame.ChunkCount, frame.Field28);
                }

                for (var j = 0; j < count2; ++j) {
                    var chunk = new SpriteChunk();
                    stream.Read(buffer, 16);
                    chunk.TextureIndex = Util.MakeI16(buffer);
                    stream.Read(buffer, 32);
                    chunk.SourceRect = Rectangle.FromLTRB(buffer[1], buffer[0], buffer[3], buffer[2]);
                    stream.Read(buffer, 16);
                    chunk.X = Util.MakeI16(buffer);
                    stream.Read(buffer, 16);
                    chunk.Y = Util.MakeI16(buffer);
                    group.Chunks.Add(chunk);
                    Trace("  chunk {0:X4} {1} {2:X4} {3:X4}", chunk.TextureIndex, chunk.SourceRect, chunk.X, chunk.Y);
                }

                groups.Add(group);
            }

            stream.BitPosition = (pixelDataOffset + 0x1a) * 8;

            for (var i = 0; i < textureCount; ++i) {
                var texture = new SpriteTexture();

                stream.Read(buffer, 8);
                texture.Unk1 = buffer[0];
                stream.Read(buffer, 8);
                texture.Unk2 = buffer[0];
                stream.Read(buffer, 32);
                var zlen = Util.MakeI32(buffer);
                var zbuf = new byte[zlen];
                stream.Read(zbuf, zlen * 8);

                // skip the 2-byte zlib header of 78 9C
                if (zbuf[0] != 0x78 || zbuf[1] != 0x9c)
                    throw new InvalidDataException();
                var deflate = new DeflateStream(new MemoryStream(zbuf, 2, zbuf.Length - 2), CompressionMode.Decompress);

                texture.Path = Path.Combine(App.IntermediatePath, name, string.Format("{0:X2}_{1:X2}.png", texture.Unk1, texture.Unk2));
                using (var image = GetImageFromPixelData(deflate, 102, 102))
                    image.Save(texture.Path);
                Trace("texture {0:X2} {1:X2} byte[{2}]", texture.Unk1, texture.Unk2, "...");

                textures.Add(texture);
            }

            return Tuple.Create(groups, textures);
        }

        private static Image GetImageFromPixelData(Stream data, int width, int height) {
            var bits = new MemoryStream();
            data.CopyTo(bits);
            Debug.Assert(width * height * 4 == bits.Length);

            var image = new Bitmap(width, height);
            var ilock = image.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            Debug.Assert(ilock.Stride == width * 4);
            Marshal.Copy(bits.GetBuffer(), 0, ilock.Scan0, (int) bits.Length);
            image.UnlockBits(ilock);
            return image;

//            using (var s = new MemoryStream())
//            using (var w = new BinaryWriter(s)) {
//                // write out the BMP header
//                w.Write((short)0x4d42);
//                w.Write(0);
//                w.Write((short)0);
//                w.Write((short)0);
//                w.Write(54);
//
//                //w.Write((int)12);
//                //w.Write((short)102);
//                //w.Write((short)102);
//                //w.Write((short)1);
//                //w.Write((short)32);
//
//                w.Write(108);
//                w.Write(102);
//                w.Write(102);
//                w.Write((short)1);
//                w.Write((short)32);
//                w.Write(3);
//                w.Write(102 * 4 * 102);
//                w.Write(96);
//                w.Write(96);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0xff);
//                w.Write(0xff << 8);
//                w.Write(0xff << 16);
//                w.Write(0xff << 24);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//                w.Write(0);
//
//                var offset = (int) w.Seek(0, SeekOrigin.Current);
//
//                // write out the pixel data
//                data.CopyTo(s);
//
//                var size = (int) w.Seek(0, SeekOrigin.Current);
//
//                w.Seek(2, SeekOrigin.Begin);
//                w.Write(size);
//                w.Seek(10, SeekOrigin.Begin);
//                w.Write(offset);
//
//                s.Seek(0, SeekOrigin.Begin);
//                using (var f = File.Open(path + ".bmp", FileMode.Create, FileAccess.Write))
//                    f.Write(s.GetBuffer(), 0, (int) s.Length);
//
//                s.Seek(0, SeekOrigin.Begin);
//                var i = new Bitmap(s);
//                i.RotateFlip(RotateFlipType.RotateNoneFlipY);
//                return i;
//            }
        }

        private static void CompositeSprites(List<SpriteGroup> groups, List<SpriteTexture> textures) {
            foreach (var group in groups) {
                for (var fi = 0; fi < group.Frames.Count; ++fi) {
                    var frame = group.Frames[fi];
                    if (group.Name == "sidewalk_1")
                        Console.WriteLine();

                    using (var image = new Bitmap(frame.Rect1.Width, frame.Rect1.Height))
                    using (var canvas = Graphics.FromImage(image)) {
                        for (var ci = 0; ci < frame.ChunkCount; ++ci) {
                            var chunk = group.Chunks[frame.ChunksOffset + ci];
                            using (var texImage = new Bitmap(textures[chunk.TextureIndex].Path)) {
                                canvas.DrawImage(texImage,
                                    chunk.X + chunk.SourceRect.Left - frame.Rect1.X, chunk.Y + chunk.SourceRect.Top - frame.Rect1.Y,
                                    chunk.SourceRect, GraphicsUnit.Pixel);
                            }
                        }

                        var filename = Path.Combine(App.SpritesPath, string.Format("{0}{1}_{2}_0001", group.Prefix, group.Name, fi + 1));
                        Directory.CreateDirectory(Path.GetDirectoryName(filename));
                        image.Save(filename + ".png");

                        var manifest = new JObject {
                            {"field0", frame.Field0},
                            {"field4", frame.Field4},
                            {"rect1", new JObject {{"t", frame.Rect1.Top}, {"l", frame.Rect1.Left}, {"b", frame.Rect1.Bottom}, {"r", frame.Rect1.Right}}},
                            {"rect2", new JObject {{"t", frame.Rect2.Top}, {"l", frame.Rect2.Left}, {"b", frame.Rect2.Bottom}, {"r", frame.Rect2.Right}}},
                            {"field28", frame.Field28},
                        };

                        using (var file = File.Open(filename + ".json", FileMode.Create, FileAccess.Write))
                        using (var writer = new StreamWriter(file)) {
                            writer.Write(manifest.ToString(Formatting.None));
                        }
                    }
                }
            }
        }
    }

    internal sealed class SpriteGroup {
        public string Prefix, Name;
        public List<SpriteFrame> Frames = new List<SpriteFrame>();
        public List<SpriteChunk> Chunks = new List<SpriteChunk>();
    }

    internal sealed class SpriteFrame {
        public short Field0, Field4;
        public Rectangle Rect1, Rect2;
        public short ChunkCount;
        public int ChunksOffset;
        public byte Field28;
    }

    internal sealed class SpriteChunk {
        public short TextureIndex;
        public Rectangle SourceRect;
        public short X;
        public short Y;
    }

    internal sealed class SpriteTexture {
        public byte Unk1, Unk2;
        public string Path;
    }
}