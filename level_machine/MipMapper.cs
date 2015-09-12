using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;

namespace level_machine {
    internal sealed class MipMapper {
        private string name;
        private LevelRenderResult render;
        private JObject manifest;

        public static void Run(string name, LevelRenderResult render) {
            new MipMapper(name, render).Run();
        }

        private MipMapper(string name, LevelRenderResult render) {
            this.name = name;
            this.render = render;
        }

        private void Run() {
            manifest = new JObject {
                {"path", name},
                {"properties", new JObject(render.Level.Tags.Select(t => new JProperty(t.Item1, t.Item2)))},
                {"blocks", new JArray(render.Level.Blocks.Select(BlockToJson))},
                {"prerenders", new JObject()},
            };

            Directory.CreateDirectory(Path.Combine(App.LevelAssetsOutputPath, name));

            DoMipMap(768 / 2, 1.0f / 1);
            DoMipMap(768 / 2, 1.0f / 2);
            DoMipMap(768 / 2, 1.0f / 4);
            DoMipMap(768 / 2, 1.0f / 8);
            DoMipMap(768 / 2, 1.0f / 16);

            var path = Path.Combine(App.LevelAssetsOutputPath, name, "manifest.json");
            using (var file = File.Open(path, FileMode.Create, FileAccess.Write))
            using (var sw = new StreamWriter(file))
            using (var jtw = new JsonTextWriter(sw)) {
                manifest.WriteTo(jtw);
            }
        }

        private static JObject BlockToJson(Block block) {
            return new JObject {
                {"x", block.X},
                {"y", block.Y},
                {"slices", new JArray(block.Slices.Select(SliceToJson))},
            };
        }

        private static JObject SliceToJson(Slice slice) {
            return new JObject {
                {"x", slice.Header.X},
                {"y", slice.Header.Y},
                {"enemy_count", slice.Header.EnemyCount},
                {"filth_count", slice.Header.FilthCount},
                {"tile_edge_count", slice.Header.TileEdgeCount},
                {"filth_blocks", slice.Header.FilthBlocks},
                {"tiles", TilesToJson(slice.Tiles)},
                {"filth", new JArray(slice.Filth.Select(f => new JArray(f.X, f.Y, Convert.ToBase64String(f.RawData))))},
                {"props", new JArray(slice.Props.Select(PropToJson))},
                {"entities", new JArray(slice.Entities.Select(EntityToJson))},
            };
        }

        private static JObject TilesToJson(IEnumerable<Tile> tiles) {
            return JObject.FromObject(
                tiles.GroupBy(t => t.Layer).OrderBy(g => g.Key)
                    .ToDictionary(g => g.Key, g => g.Select(TileToJson)));
        }

        private static JArray TileToJson(Tile tile) {
            return new JArray {tile.X, tile.Y, Convert.ToBase64String(tile.RawData)};
        }

        private static JArray PropToJson(Prop prop) {
            return new JArray {
                prop.Field4, prop.X, prop.Y, prop.Rotation, prop.FlipHorz ? -1 : 1, prop.FlipVert ? -1 : 1,
                prop.PropSet, prop.PropGroup, prop.PropIndex, prop.Palette, prop.LayerGroup, prop.LayerSub,
            };
        }

        private static JArray EntityToJson(Entity entity) {
            return new JArray {
                entity.Uid, entity.Kind, entity.X, entity.Y, entity.Rotation,
                entity.Field28, entity.FlipHorz ? -1 : 1, entity.FlipVert ? -1 : 1, entity.Field34,
                JObject.FromObject(entity.Tags.ToDictionary(t => t.Item1, t => t.Item2)),
            };
        }

        private void DoMipMap(int dstSize, float zoom) {
            var srcSize = (int) (dstSize / zoom);

            var renderMinX = render.Tiles.Min(s => s.Area.X);
            var renderMaxX = render.Tiles.Max(s => s.Area.Right);
            var renderMinY = render.Tiles.Min(s => s.Area.Y);
            var renderMaxY = render.Tiles.Max(s => s.Area.Bottom);
            var minX = (renderMinX / srcSize) * srcSize;
            var maxX = (renderMaxX / srcSize + 1) * srcSize;
            var minY = (renderMinY / srcSize) * srcSize;
            var maxY = (renderMaxY / srcSize + 1) * srcSize;

            foreach (var bucket in render.Tiles.GroupBy(o => o.Bucket)) {
                for (var x = minX; x <= maxX; x += srcSize) {
                    for (var y = minY; y <= maxY; y += srcSize) {
                        var area = new Rectangle(x, y, srcSize, srcSize);
                        var objects = bucket.Where(s => s.Area.IntersectsWith(area));

                        using (var image = new Bitmap(dstSize, dstSize))
                        using (var canvas = Graphics.FromImage(image)) {
                            bool drewAnything = false;
                            foreach (var obj in objects) {
                                using (var i = new Bitmap(obj.Path)) {
                                    var ix = (obj.Area.X - x) * zoom;
                                    var iy = (obj.Area.Y - y) * zoom;
                                    canvas.DrawImage(i, new RectangleF(ix, iy, i.Width * zoom, i.Height * zoom));
                                    drewAnything = true;
                                }
                            }
                            if (!drewAnything)
                                continue;

                            var path = Path.Combine(App.LevelAssetsOutputPath, name,
                                string.Format("{0}_{1}_{2},{3}.png", bucket.Key, zoom, x, y));
                            using (var file = File.Open(path, FileMode.Create, FileAccess.Write)) {
                                image.Save(file, ImageFormat.Png);
                            }
                        }

                        var prerenders = manifest.Value<JObject>("prerenders");
                        var prerender = prerenders.Value<JObject>(bucket.Key);
                        if (prerender == null) {
                            prerenders.Add(bucket.Key, prerender = new JObject{{"scales", new JArray()}});
                        }
                        var scales = prerender.Value<JArray>("scales");
                        var scale = scales.Where(s => s.Value<float>("scale") == zoom).Select(p => p.Value<JObject>()).FirstOrDefault();
                        if (scale == null) {
                            scales.Add(scale = new JObject {
                                {"scale", zoom},
                                {"tile_size", new JArray {srcSize, srcSize}},
                                {"tiles", new JArray()},
                            });
                        }
                        scale.Value<JArray>("tiles").Add(new JArray(x, y));
                    }
                }
            }
        }
    }

    internal interface MipMappable {
        Rectangle Area { get; }

        string Bucket { get; }
    }
}
