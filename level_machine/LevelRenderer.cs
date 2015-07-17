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
            foreach (var slice in block.Slices) {
                for (var layer = 1; layer <= App.NumLayers; ++layer) {
                    using (var image = new Bitmap(App.PixelsPerSlice, App.PixelsPerSlice))
                    using (var canvas = Graphics.FromImage(image)) {
                        bool drewAnything = DrawTiles(canvas, slice, layer);
                        drewAnything |= DrawProps(canvas, block, slice, layer);

                        if (!drewAnything)
                            continue;

                        var x = ((block.X * App.SlicesPerBlock) + slice.Header.X) * App.PixelsPerSlice;
                        var y = ((block.Y * App.SlicesPerBlock) + slice.Header.Y) * App.PixelsPerSlice;
                        var path = Path.Combine(App.IntermediatePath, name,
                            string.Format("{0}_{1}_{2}.png", layer, x, y));
                        using (var file = File.Open(path, FileMode.Create, FileAccess.Write)) {
                            image.Save(file, ImageFormat.Png);
                        }

                        var area = new Rectangle(x, y, App.PixelsPerSlice, App.PixelsPerSlice);
                        result.Tiles.Add(new RenderedTiles(path, area, layer));
                    }
                }
            }
        }

        private bool DrawTiles(Graphics canvas, Slice slice, int layer) {
            var drewAnything = false;

            foreach (var tile in slice.Tiles) {
                if (tile.Layer == layer) {
                    DrawTile(canvas, tile);
                    drewAnything = true;
                }
            }

            return drewAnything;
        }

        private void DrawTile(Graphics canvas, Tile tile) {
            var x = tile.X * App.PixelsPerTile;
            var y = tile.Y * App.PixelsPerTile;
            var sprite = sprites.LoadTile(tile.SpriteSet, tile.SpritePalette, tile.SpriteTile);
            if (sprite == null)
                return;

            TileShape shape;
            try {
                shape = tileShapes[tile.Flags];
            } catch (Exception) {
                Debug.WriteLine("unknown tile shape");
                shape = tileShapes[0x80];
            }

            var attrs = new ImageAttributes();
            attrs = null;
//            var matrix = new ColorMatrix {Matrix33 = tile.Layer / 20f};
//            attrs.SetColorMatrix(matrix);

            if (shape.Clip != null) {
                canvas.SetClip(new GraphicsPath(shape.Clip, shape.Clip.Select(p => (byte) 1).ToArray()));
                canvas.TranslateClip(x, y);
            }
            var srcX = 96 + (tile.X % 10) * 48;
            var srcY = 96 + (tile.Y % 6) * 48;
            canvas.DrawImage(sprite.Image, new Rectangle(x, y, App.PixelsPerTile, App.PixelsPerTile), srcX, srcY, 48, 48, GraphicsUnit.Pixel, attrs);
            canvas.ResetClip();

            DrawTileBottomEdge(canvas, tile, shape, sprite, attrs);
            DrawTileLeftEdge(canvas, tile, shape, sprite, attrs);
            DrawTileRightEdge(canvas, tile, shape, sprite, attrs);
            DrawTileTopEdge(canvas, tile, shape, sprite, attrs);
        }

        private void DrawTileTopEdge(Graphics canvas, Tile tile, TileShape shape, TileGfx sprite, ImageAttributes attrs) {
            var drawEdge = (tile.Edges & 1) != 0;
            var drawLeftCap = (tile.EndCaps & 1) != 0;
            var drawRightCap = (tile.EndCaps & 2) != 0;

            if (shape.Top == null) {
                Debug.Assert(!drawEdge && !drawLeftCap && !drawRightCap);
                return;
            }

            var transform = new Matrix();
            transform.Translate(tile.X * App.PixelsPerTile + shape.Top.X1, tile.Y * App.PixelsPerTile + shape.Top.Y1);
            transform.Rotate(shape.Top.Angle);
            canvas.Transform = transform;

            var length = shape.Top.Length;

            if (drawEdge) {
                int srcX = 192 + (tile.X % 6) * 48;
                canvas.DrawImage(sprite.Image, new Rectangle(0, -48, length, 96), srcX, 0, 48, 96, GraphicsUnit.Pixel, attrs);
            }

            if (drawLeftCap) {
                canvas.DrawImage(sprite.Image, new Rectangle(-96, -48, 96, 96), 96, 0, 96, 96, GraphicsUnit.Pixel, attrs);
            }

            if (drawRightCap) {
                canvas.DrawImage(sprite.Image, new Rectangle(length, -48, 96, 96), 480, 0, 96, 96, GraphicsUnit.Pixel, attrs);
            }

            canvas.ResetTransform();
        }

        private static void DrawTileBottomEdge(Graphics canvas, Tile tile, TileShape shape, TileGfx sprite, ImageAttributes attrs) {
            var drawEdge = (tile.Edges & 2) != 0;
            var drawLeftCap = (tile.EndCaps & 4) != 0;
            var drawRightCap = (tile.EndCaps & 8) != 0;

            if (shape.Bottom == null) {
                Debug.Assert(!drawEdge && !drawLeftCap && !drawRightCap);
                return;
            }

            var transform = new Matrix();
            transform.Translate(tile.X * App.PixelsPerTile + shape.Bottom.X2, tile.Y * App.PixelsPerTile + shape.Bottom.Y2);
            transform.Rotate(shape.Bottom.Angle - 180);
            canvas.Transform = transform;

            var length = shape.Bottom.Length;

            if (drawEdge) {
                int srcX = 192 + (tile.X % 6) * 48;
                canvas.DrawImage(sprite.Image, new Rectangle(0, -48, length, 96), srcX, 384, 48, 96, GraphicsUnit.Pixel, attrs);
            }

            if (drawLeftCap) {
                canvas.DrawImage(sprite.Image, new Rectangle(-96, -48, 96, 96), 96, 384, 96, 96, GraphicsUnit.Pixel, attrs);
            }

            if (drawRightCap) {
                canvas.DrawImage(sprite.Image, new Rectangle(length, -48, 96, 96), 480, 384, 96, 96, GraphicsUnit.Pixel, attrs);
            }

            canvas.ResetTransform();
        }

        private static void DrawTileLeftEdge(Graphics canvas, Tile tile, TileShape shape, TileGfx sprite, ImageAttributes attrs) {
            var drawEdge = (tile.Edges & 4) != 0;
            var drawTopCap = (tile.EndCaps & 16) != 0;
            var drawBottomCap = (tile.EndCaps & 32) != 0;

            if (shape.Left == null) {
                Debug.Assert(!drawEdge && !drawTopCap && !drawBottomCap);
                return;
            }

            var transform = new Matrix();
            transform.Translate(tile.X * App.PixelsPerTile + shape.Left.X2, tile.Y * App.PixelsPerTile + shape.Left.Y2);
            transform.Rotate(shape.Left.Angle + 90);
            canvas.Transform = transform;

            var length = shape.Left.Length;

            if (drawEdge) {
                int srcY = 96 + (tile.Y % 6) * 48;
                canvas.DrawImage(sprite.Image, new Rectangle(-48, 0, 96, length), 96, srcY, -96, 48, GraphicsUnit.Pixel, attrs);
            }

            if (drawTopCap) {
                canvas.DrawImage(sprite.Image, new Rectangle(-48, -96, 96, 96), 96, 0, -96, 96, GraphicsUnit.Pixel, attrs);
            }

            if (drawBottomCap) {
                canvas.DrawImage(sprite.Image, new Rectangle(-48, length, 96, 96), 96, 384, -96, 96, GraphicsUnit.Pixel, attrs);
            }

            canvas.ResetTransform();
        }

        private static void DrawTileRightEdge(Graphics canvas, Tile tile, TileShape shape, TileGfx sprite, ImageAttributes attrs) {
            var drawEdge = (tile.Edges & 8) != 0;
            var drawTopCap = (tile.EndCaps & 64) != 0;
            var drawBottomCap = (tile.EndCaps & 128) != 0;

            if (shape.Right == null) {
                Debug.Assert(!drawEdge && !drawTopCap && !drawBottomCap);
                return;
            }

            var transform = new Matrix();
            transform.Translate(tile.X * App.PixelsPerTile + shape.Right.X1, tile.Y * App.PixelsPerTile + shape.Right.Y1);
            transform.Rotate(shape.Right.Angle - 90);
            canvas.Transform = transform;

            var length = shape.Right.Length;

            if (drawEdge) {
                int srcY = 96 + (tile.Y % 6) * 48;
                canvas.DrawImage(sprite.Image, new Rectangle(-48, 0, 96, length), 0, srcY, 96, 48, GraphicsUnit.Pixel, attrs);
            }

            if (drawTopCap) {
                canvas.DrawImage(sprite.Image, new Rectangle(-48, -96, 96, 96), 0, 0, 96, 96, GraphicsUnit.Pixel, attrs);
            }

            if (drawBottomCap) {
                canvas.DrawImage(sprite.Image, new Rectangle(-48, length, 96, 96), 0, 384, 96, 96, GraphicsUnit.Pixel, attrs);
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
            var x = prop.X - (block.X * App.SlicesPerBlock + slice.Header.X) * App.PixelsPerSlice;
            var y = prop.Y - (block.Y * App.SlicesPerBlock + slice.Header.Y) * App.PixelsPerSlice;
//            Console.WriteLine("{0} {1} {2}", prop.PropGroup, prop.Y, y);
            var sprite = sprites.LoadProp(prop.PropSet, prop.PropGroup, prop.PropIndex, prop.Palette);
            if (sprite == null)
                return;
            var srcRect = new Rectangle(0, 0, sprite.Rect1.Width, sprite.Rect1.Height);
            var dstRect = new Rectangle((int) x + sprite.Rect1.Left, (int) y + sprite.Rect1.Top, srcRect.Width, srcRect.Height);
            if (prop.FlipHorz)
                dstRect = new Rectangle(dstRect.Right - sprite.Rect1.Left - sprite.Rect1.Right, dstRect.Top, -dstRect.Width, dstRect.Height);
            if (prop.FlipVert)
                dstRect = new Rectangle(dstRect.Left, dstRect.Bottom - sprite.Rect1.Top - sprite.Rect1.Bottom, dstRect.Width, -dstRect.Height);
            canvas.DrawImage(sprite.Image, dstRect, srcRect, GraphicsUnit.Pixel);
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
