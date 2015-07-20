using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;

namespace level_machine {
    internal sealed class LevelRenderer {
        private const int sliceOverdraw = 96;

        private readonly Level level;
        private readonly string name;
        private readonly SpriteLoader sprites;
        private readonly LevelRenderResult result;
        private int minBlockX, maxBlockX, minBlockY, maxBlockY;

        private LevelRenderer(Level level, string name) {
            this.level = level;
            this.name = name;
            sprites = new SpriteLoader();
            result = new LevelRenderResult();
            result.Tags = level.Tags;
        }

        public static LevelRenderResult Render(Level level, string name) {
            var renderer = new LevelRenderer(level, name);
            renderer.Render();
            return renderer.result;
        }

        private void Render() {
            Directory.CreateDirectory(Path.Combine(App.IntermediatePath, name));

            foreach (var block in level.Blocks) {
                if (block.X > minBlockX) minBlockX = block.X;
                if (block.X < maxBlockX) maxBlockX = block.X;
                if (block.Y > minBlockY) minBlockY = block.Y;
                if (block.Y < maxBlockY) maxBlockY = block.Y;
                DrawBlock(block);
            }
        }

        private void DrawBlock(Block block) {
            foreach (var slicesByPos in block.Slices.GroupBy(s => Tuple.Create(s.Header.X, + s.Header.Y))) {
                var sliceX = slicesByPos.Key.Item1;
                var sliceY = slicesByPos.Key.Item2;

                for (byte layer = 1; layer <= App.NumLayers; ++layer) {
                    using (var image = new Bitmap(App.PixelsPerSlice + sliceOverdraw * 2, App.PixelsPerSlice + sliceOverdraw * 2))
                    using (var canvas = Graphics.FromImage(image)) {
                        bool drewAnything = false;
                        foreach (var slice in slicesByPos) {
                            drewAnything |= DrawTiles(canvas, slice, layer);
                            drewAnything |= DrawProps(canvas, block, slice, layer);
                        }

                        if (!drewAnything)
                            continue;

                        var x = ((block.X * App.SlicesPerBlock) + sliceX) * App.PixelsPerSlice;
                        var y = ((block.Y * App.SlicesPerBlock) + sliceY) * App.PixelsPerSlice;
                        var path = Path.Combine(App.IntermediatePath, name,
                            string.Format("{0}_{1}_{2}.png", layer, x, y));
                        using (var file = File.Open(path, FileMode.Create, FileAccess.Write)) {
                            image.Save(file, ImageFormat.Png);
                        }

                        var area = new Rectangle(x - sliceOverdraw, y - sliceOverdraw, App.PixelsPerSlice, App.PixelsPerSlice);
                        result.Tiles.Add(new RenderedTiles(path, area, layer));
                    }
                }
            }
        }

        private bool DrawTiles(Graphics canvas, Slice slice, byte layer) {
            var tiles = slice.Tiles.Where(t => t.Layer == layer).ToArray();
            if (tiles.Length == 0)
                return false;

            var attrs = new ImageAttributes();
            attrs.SetColorMatrix(MakeFogMatrix(layer));

            foreach (var tile in tiles)
                DrawTileCenter(canvas, tile, tileShapes[tile.Flags], attrs);
            foreach (var tile in tiles)
                DrawTileBottomEdge(canvas, tile, tileShapes[tile.Flags], attrs);
            foreach (var tile in tiles)
                DrawTileLeftEdge(canvas, tile, tileShapes[tile.Flags], attrs);
            foreach (var tile in tiles)
                DrawTileRightEdge(canvas, tile, tileShapes[tile.Flags], attrs);
            foreach (var tile in tiles)
                DrawTileTopEdge(canvas, tile, tileShapes[tile.Flags], attrs);

            return true;
        }

        private void DrawTileCenter(Graphics canvas, Tile tile, TileShape shape, ImageAttributes attrs) {
            var transform = new Matrix();
            transform.Translate(tile.X * App.PixelsPerTile + sliceOverdraw, tile.Y * App.PixelsPerTile + sliceOverdraw);
            canvas.Transform = transform;

            canvas.SetClip(new GraphicsPath(shape.Clip, shape.Clip.Select(p => (byte) 1).ToArray()));

            var chunk = (tile.X / 2) % 5 + ((tile.Y / 2) % 3) * 5 + 1;
            var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, chunk);
            var sx = (tile.X & 1) * 48;
            var sy = (tile.Y & 1) * 48;
            canvas.DrawImage(sprite.Image,
                new Rectangle(0, 0, 48, 48),
                sx - sprite.Rect1.Left, sy - sprite.Rect1.Top, 48, 48, GraphicsUnit.Pixel, attrs);

            canvas.ResetClip();
            canvas.ResetTransform();
        }

        private void DrawTileTopEdge(Graphics canvas, Tile tile, TileShape shape, ImageAttributes attrs) {
            var drawEdge = (tile.Edges & 1) != 0;
            var drawLeftCap = (tile.EndCaps & 1) != 0;
            var drawRightCap = (tile.EndCaps & 2) != 0;

            if (shape.Top == null) {
                Debug.Assert(!drawEdge && !drawLeftCap && !drawRightCap);
                return;
            }

            var transform = new Matrix();
            transform.Translate(tile.X * App.PixelsPerTile + shape.Top.X1 + sliceOverdraw, tile.Y * App.PixelsPerTile + shape.Top.Y1 + sliceOverdraw);
            transform.Rotate(shape.Top.Angle);
            canvas.Transform = transform;
            var length = shape.Top.Length;

            if (drawEdge) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 17 + (tile.X / 2) % 3);
                var sx = (tile.X & 1) * 48;
                canvas.DrawImage(sprite.Image,
                    new Rectangle(0, sprite.Rect1.Top, length, sprite.Rect1.Height),
                    sx - sprite.Rect1.Left, 0, 48, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            if (drawLeftCap) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 16);
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left, sprite.Rect1.Top, sprite.Rect1.Width, sprite.Rect1.Height),
                    0, 0, sprite.Rect1.Width, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            if (drawRightCap) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 20);
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left + length, sprite.Rect1.Top, sprite.Rect1.Width, sprite.Rect1.Height),
                    0, 0, sprite.Rect1.Width, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            canvas.ResetTransform();
        }

        private void DrawTileBottomEdge(Graphics canvas, Tile tile, TileShape shape, ImageAttributes attrs) {
            var drawEdge = (tile.Edges & 2) != 0;
            var drawLeftCap = (tile.EndCaps & 4) != 0;
            var drawRightCap = (tile.EndCaps & 8) != 0;

            if (shape.Bottom == null) {
                Debug.Assert(!drawEdge && !drawLeftCap && !drawRightCap);
                return;
            }

            var transform = new Matrix();
            transform.Translate(tile.X * App.PixelsPerTile + shape.Bottom.X2 + sliceOverdraw, tile.Y * App.PixelsPerTile + shape.Bottom.Y2 + sliceOverdraw);
            transform.Rotate(shape.Bottom.Angle - 180);
            canvas.Transform = transform;
            var length = shape.Bottom.Length;

            if (drawEdge) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 22 + (tile.Y / 2) % 3);
                var sx = (tile.X & 1) * 48;
                canvas.DrawImage(sprite.Image,
                    new Rectangle(0, sprite.Rect1.Top, length, sprite.Rect1.Height),
                    sx - sprite.Rect1.Left, 0, 48, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            if (drawLeftCap) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 21);
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left, sprite.Rect1.Top, sprite.Rect1.Width, sprite.Rect1.Height),
                    0, 0, sprite.Rect1.Width, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            if (drawRightCap) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 25);
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left + length, sprite.Rect1.Top, sprite.Rect1.Width, sprite.Rect1.Height),
                    0, 0, sprite.Rect1.Width, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            canvas.ResetTransform();
        }

        private void DrawTileLeftEdge(Graphics canvas, Tile tile, TileShape shape, ImageAttributes attrs) {
            var drawEdge = (tile.Edges & 4) != 0;
            var drawTopCap = (tile.EndCaps & 16) != 0;
            var drawBottomCap = (tile.EndCaps & 32) != 0;

            if (shape.Left == null) {
                Debug.Assert(!drawEdge && !drawTopCap && !drawBottomCap);
                return;
            }

            var transform = new Matrix();
            transform.Translate(tile.X * App.PixelsPerTile + shape.Left.X2 + sliceOverdraw, tile.Y * App.PixelsPerTile + shape.Left.Y2 + sliceOverdraw);
            transform.Rotate(shape.Left.Angle + 90);
            canvas.Transform = transform;
            var length = shape.Left.Length;

            if (drawEdge) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 27 + (tile.Y / 2) % 3);
                var sy = (tile.Y & 1) * 48;
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left, 0, sprite.Rect1.Width, length),
                    0, sy - sprite.Rect1.Top, sprite.Rect1.Width, 48, GraphicsUnit.Pixel, attrs);
            }

            if (drawTopCap) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 26);
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left, sprite.Rect1.Top, sprite.Rect1.Width, sprite.Rect1.Height),
                    0, 0, sprite.Rect1.Width, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            if (drawBottomCap) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 30);
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left, sprite.Rect1.Top + length, sprite.Rect1.Width, sprite.Rect1.Height),
                    0, 0, sprite.Rect1.Width, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            canvas.ResetTransform();
        }

        private void DrawTileRightEdge(Graphics canvas, Tile tile, TileShape shape, ImageAttributes attrs) {
            var drawEdge = (tile.Edges & 8) != 0;
            var drawTopCap = (tile.EndCaps & 64) != 0;
            var drawBottomCap = (tile.EndCaps & 128) != 0;

            if (shape.Right == null) {
                Debug.Assert(!drawEdge && !drawTopCap && !drawBottomCap);
                return;
            }

            var transform = new Matrix();
            transform.Translate(tile.X * App.PixelsPerTile + shape.Right.X1 + sliceOverdraw, tile.Y * App.PixelsPerTile + shape.Right.Y1 + sliceOverdraw);
            transform.Rotate(shape.Right.Angle - 90);
            canvas.Transform = transform;
            var length = shape.Right.Length;

            if (drawEdge) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 27 + (tile.Y / 2) % 3);
                var sy = (tile.Y & 1) * 48;
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left, 0, sprite.Rect1.Width, length),
                    0, sy - sprite.Rect1.Top, sprite.Rect1.Width, 48, GraphicsUnit.Pixel, attrs);
            }

            if (drawTopCap) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 26);
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left, sprite.Rect1.Top, sprite.Rect1.Width, sprite.Rect1.Height),
                    0, 0, sprite.Rect1.Width, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            if (drawBottomCap) {
                var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpriteTile, tile.SpritePalette, 30);
                canvas.DrawImage(sprite.Image,
                    new Rectangle(sprite.Rect1.Left, sprite.Rect1.Top + length, sprite.Rect1.Width, sprite.Rect1.Height),
                    0, 0, sprite.Rect1.Width, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
            }

            canvas.ResetTransform();
        }

        private bool DrawProps(Graphics canvas, Block block, Slice slice, int layer) {
            var drewAnything = false;

//            foreach (var prop in slice.Props) {
//                if (prop.LayerGroup == layer) {
//                    DrawProp(canvas, block, slice, prop);
//                    drewAnything = true;
//                }
//            }

            // TODO: this is garbage; optimize this
            foreach (var b in level.Blocks)
                foreach (var s in b.Slices)
                    foreach (var p in s.Props)
                        if (p.LayerGroup == layer) {
                            DrawProp(canvas, block, slice, p);
                            drewAnything = true;
                        }

            return drewAnything;
        }

        private void DrawProp(Graphics canvas, Block block, Slice slice, Prop prop) {
            //Console.WriteLine("{0} {1} {2}", prop.PropGroup, prop.Y, y);
            var sprite = sprites.LoadProp(prop.PropSet, prop.PropGroup, prop.PropIndex, prop.Palette);
            if (sprite == null)
                return;

            var dstRect = new Rectangle((int) prop.X, (int) prop.Y, sprite.Rect1.Width, sprite.Rect1.Height);

            // no idea what the deal with this is. it isn't perfect, but it's at least closer than just using the raw numbers, usually…
            // no idea what significance the constants have.
            dstRect.Y += (dstRect.Y / 232) * 32;
            dstRect.X -= (dstRect.X / 286) * 32;

            if (prop.LayerGroup <= 5) {
                dstRect.X = (int) (dstRect.X * (0.05 * prop.LayerGroup));  // multiply the position by the layer's parallax
                dstRect.Y = (int) (dstRect.Y * (0.05 * prop.LayerGroup));
                dstRect.Width *= 2;
                dstRect.Height *= 2;
            }

            if (prop.FlipHorz)
//                dstRect = new Rectangle(dstRect.Left                 - sprite.Rect1.Left, dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left - dstRect.Width - sprite.Rect1.Left, dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left                 - sprite.Rect1.Left - sprite.Rect1.Right, dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left - dstRect.Width - sprite.Rect1.Left - sprite.Rect1.Right, dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left                , dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left + dstRect.Width, dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left                 - sprite.Rect1.Left, dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left + dstRect.Width - sprite.Rect1.Left, dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left                 - sprite.Rect1.Right, dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left + dstRect.Width - sprite.Rect1.Right, dstRect.Top, -dstRect.Width, dstRect.Height);
//                dstRect = new Rectangle(dstRect.Left                 - sprite.Rect1.Left - sprite.Rect1.Right, dstRect.Top, -dstRect.Width, dstRect.Height);
                dstRect = new Rectangle(dstRect.Right - sprite.Rect1.Left - sprite.Rect1.Right, dstRect.Top, -dstRect.Width, dstRect.Height);
            if (prop.FlipVert)
                dstRect = new Rectangle(dstRect.Left, dstRect.Bottom - sprite.Rect1.Top - sprite.Rect1.Bottom, dstRect.Width, -dstRect.Height);

            var attrs = new ImageAttributes();
            attrs.SetColorMatrix(MakeFogMatrix(prop.LayerGroup));

            dstRect.X += sprite.Rect1.Left;
            dstRect.Y += sprite.Rect1.Top;
            dstRect.X -= (block.X * App.SlicesPerBlock + slice.Header.X) * App.PixelsPerSlice;
            dstRect.Y -= (block.Y * App.SlicesPerBlock + slice.Header.Y) * App.PixelsPerSlice;
            dstRect.X += sliceOverdraw;
            dstRect.Y += sliceOverdraw;
            canvas.DrawImage(sprite.Image, dstRect, 0, 0, sprite.Rect1.Width, sprite.Rect1.Height, GraphicsUnit.Pixel, attrs);
        }

        private ColorMatrix MakeFogMatrix(byte layer) {
            var fogColour = (int) Util.GetProp<List<object>>(level.Tags, "cp_fog_colour")[layer];
            var fogPer = (float) Util.GetProp<List<object>>(level.Tags, "cp_fog_per")[layer];
            var matrix = MakeColorMatrix(fogColour, fogPer);
            return matrix;
        }

        private static ColorMatrix MakeColorMatrix(int color, float percent) {
            var r = ((color & 0xff0000) >> 16) / 255f;
            var g = ((color & 0xff00) >> 8) / 255f;
            var b = (color & 0xff) / 255f;
            return new ColorMatrix(new[] {
                new[] {1f - percent, 0f, 0f, 0f, 0f},
                new[] {0f, 1f - percent, 0f, 0f, 0f},
                new[] {0f, 0f, 1f - percent, 0f, 0f},
                new[] {0f, 0f, 0f, 1f, 0f},
                new[] {r * percent, g * percent, b * percent, 0f, 1f},
            });
        }

        private static ColorMatrix MakeColorMatrix(int black, int red, int green, int blue) {
            var z = Color.FromArgb(black);
            var r = Color.FromArgb(red);
            var g = Color.FromArgb(green);
            var b = Color.FromArgb(blue);
            var ret = new[] {
                new[] {(r.R - z.R) / 255f, (g.R - z.R) / 255f, (b.R - z.R) / 255f, 0f, 0f},
                new[] {(r.G - z.G) / 255f, (g.G - z.G) / 255f, (b.G - z.G) / 255f, 0f, 0f},
                new[] {(r.B - z.B) / 255f, (g.B - z.B) / 255f, (b.B - z.B) / 255f, 0f, 0f},
                new[] {0f, 0f, 0f, 1f, 0f},
                new[] {z.R / 255f, z.G / 255f, z.B / 255f, 0f, 1f},
            };
            ret = ret.Select(row => row.Select(e => Math.Max(0, Math.Min(1, e))).ToArray()).ToArray();
            return new ColorMatrix(ret);
        }

        private static ColorMatrix MakeColorMatrixSimple(int black, int white) {
            return MakeColorMatrix(black, white & 0xff0000, white & 0xff00, white & 0xff);
        }

        private readonly Dictionary<byte, TileShape> tileShapes = new List<TileShape>(new[] {
            new TileShape(0x80, e(0, 0, 48, 0),   e(48, 0, 48, 48),  e(48, 48, 0, 48),  e(0, 48, 0, 0)),
            new TileShape(0x81, e(0, 0, 48, 24),  e(48, 24, 48, 48), e(48, 48, 0, 48),  e(0, 48, 0, 0)),
            new TileShape(0x82, e(0, 24, 48, 48), null,              e(48, 48, 0, 48),  e(0, 48, 0, 24)),
            new TileShape(0x91, e(0, 0, 48, 48),  null,              e(48, 48, 0, 48),  e(0, 48, 0, 0)),
            new TileShape(0x90, null,             e(0, 0, 24, 48),   e(24, 48, 0, 48),  e(0, 48, 0, 0)),
            new TileShape(0x8f, e(0, 0, 24, 0),   e(24, 0, 48, 48),  e(48, 48, 0, 48),  e(0, 48, 0, 0)),
            new TileShape(0x83, e(0, 0, 48, 0),   e(48, 0, 24, 48),  e(24, 48, 0, 48),  e(0, 48, 0, 0)),
            new TileShape(0x84, e(0, 0, 24, 0),   e(24, 0, 0, 48),   null,              e(0, 48, 0, 0)),
            new TileShape(0x92, e(0, 0, 48, 0),   null,              e(48, 0, 0, 48),   e(0, 48, 0, 0)),
            new TileShape(0x8e, e(0, 0, 48, 0),   null,              e(48, 0, 0, 24),   e(0, 24, 0, 0)),
            new TileShape(0x8d, e(0, 0, 48, 0),   e(48, 0, 48, 24),  e(48, 24, 0, 48),  e(0, 48, 0, 0)),
            new TileShape(0x89, e(0, 24, 48, 0),  e(48, 0, 48, 48),  e(48, 48, 0, 48),  e(0, 48, 0, 24)),
            new TileShape(0x8a, e(0, 48, 48, 24), e(48, 24, 48, 48), e(48, 48, 0, 48),  null),
            new TileShape(0x94, e(0, 48, 48, 0),  e(48, 0, 48, 48),  e(48, 48, 0, 48),  null),
            new TileShape(0x88, null,             e(48, 0, 48, 48),  e(48, 48, 24, 48), e(24, 48, 48, 0)),
            new TileShape(0x87, e(24, 0, 48, 0),  e(48, 0, 48, 48),  e(48, 48, 0, 48),  e(0, 48, 24, 0)),
            new TileShape(0x8b, e(0, 0, 48, 0),   e(48, 0, 48, 48),  e(48, 48, 24, 48), e(24, 48, 0, 0)),
            new TileShape(0x8c, e(24, 0, 48, 0),  e(48, 0, 48, 48),  null,              e(48, 48, 24, 0)),
            new TileShape(0x93, e(0, 0, 48, 0),   e(48, 0, 48, 48),  e(48, 48, 0, 0),   null),
            new TileShape(0x86, e(0, 0, 48, 0),   e(48, 0, 48, 24),  e(48, 24, 0, 0),   null),
            new TileShape(0x85, e(0, 0, 48, 0),   e(48, 0, 48, 48),  e(48, 48, 0, 24),  e(0, 24, 0, 0)),
        }).ToDictionary(s => s.Flags);

        private static TileEdge e(int x1, int y1, int x2, int y2) {
            return new TileEdge(x1, y1, x2, y2);
        }

        private static readonly ColorMatrix[] propLayerColors = {
            MakeColorMatrixSimple(0x000000, 0xdddddd),
            MakeColorMatrixSimple(0x23294d, 0xaeb4d8),
            MakeColorMatrixSimple(0x1b203b, 0xc0c6e1),
            MakeColorMatrixSimple(0x203048, 0x6c7c94),
            MakeColorMatrixSimple(0x1a273b, 0x8794a8),
            MakeColorMatrixSimple(0x010102, 0xf5f5f6),
            MakeColorMatrixSimple(0x010102, 0xf8f8f9),
            MakeColorMatrixSimple(0x000001, 0xfcfcfd),
            MakeColorMatrixSimple(0x0d1025, 0x3a3d52),
            MakeColorMatrixSimple(0x121628, 0x5a5e70),
            MakeColorMatrixSimple(0x0e111f, 0x808291),
            MakeColorMatrixSimple(0x000000, 0xffffff),
            MakeColorMatrixSimple(0x121629, 0x55596c),
            MakeColorMatrixSimple(0x0f1222, 0x727585),
            MakeColorMatrixSimple(0x0e101e, 0x828593),
            MakeColorMatrixSimple(0x080a12, 0xb6b7c0),
            MakeColorMatrixSimple(0x000000, 0xffffff),
            MakeColorMatrixSimple(0x000000, 0xffffff),
            MakeColorMatrixSimple(0x04040a, 0xe5e5eb),
            MakeColorMatrixSimple(0x000000, 0xffffff),
        };
    }

    internal sealed class TileShape {
        public byte Flags;
        public Point[] Clip;
        public TileEdge Top, Right, Bottom, Left;

        public TileShape(byte flags, TileEdge top, TileEdge right, TileEdge bottom, TileEdge left) {
            Flags = flags;
            Clip = ExpandClip(top, right, bottom, left);
            Top = top;
            Right = right;
            Bottom = bottom;
            Left = left;
        }

        private static Point[] ExpandClip(TileEdge top, TileEdge right, TileEdge bottom, TileEdge left) {
            var ret = new List<Point>();
            if (top != null) {
                ret.Add(new Point(top.X1, top.Y1));
                ret.Add(new Point(top.X2, top.Y2));
            }
            if (right != null) {
                if (ret.Count == 0)
                    ret.Add(new Point(right.X1, right.Y1));
                else
                    Debug.Assert(ret[ret.Count - 1] == new Point(right.X1, right.Y1));
                ret.Add(new Point(right.X2, right.Y2));
            }
            if (bottom != null) {
                Debug.Assert(ret[ret.Count - 1] == new Point(bottom.X1, bottom.Y1));
                ret.Add(new Point(bottom.X2, bottom.Y2));
            }
            if (left != null) {
                Debug.Assert(ret[ret.Count - 1] == new Point(left.X1, left.Y1));
                ret.Add(new Point(left.X2, left.Y2));
            }
            Debug.Assert(ret[0] == ret[ret.Count - 1]);
            return ret.Take(ret.Count - 1).ToArray();
        }
    }

    internal class TileEdge {
        public int X1, Y1, X2, Y2;

        public TileEdge(int x1, int y1, int x2, int y2) {
            X1 = x1;
            Y1 = y1;
            X2 = x2;
            Y2 = y2;
        }

        public float Angle {
            get { return (float) (180 / Math.PI * Math.Atan2(Y2 - Y1, X2 - X1)); }
        }

        public int Length {
            get { return (int) Math.Ceiling(Math.Sqrt(Math.Pow(X2 - X1, 2) + Math.Pow(Y2 - Y1, 2))); }
        }
    }

    internal sealed class LevelRenderResult {
        public List<Tuple<string, object>> Tags;
        public List<RenderedTiles> Tiles = new List<RenderedTiles>();
    }

    internal sealed class RenderedTiles : MipMappable {
        public RenderedTiles(string path, Rectangle area, int layer) {
            Path = path;
            Area = area;
            Layer = layer;
        }

        public string Path { get; private set; }

        public int Layer { get; private set; }

        public Rectangle Area { get; private set; }

        public string Bucket {
            get { return Layer.ToString(CultureInfo.InvariantCulture); }
        }
    }
}
