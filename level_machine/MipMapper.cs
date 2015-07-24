using System.Collections.Generic;
using System.Diagnostics;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
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
                {"properties", new JObject(render.Tags.Select(t => new JProperty(t.Item1, t.Item2)))},
                {"layers", new JObject()},
                {"entities", new JArray(render.Entities.Select(EntityToJson))},
            };

            Directory.CreateDirectory(Path.Combine(App.LevelAssetsOutputPath, name));

            DoMipMap(768 / 2, 1.0f / 1);
            DoMipMap(768 / 2, 1.0f / 2);
            DoMipMap(768 / 2, 1.0f / 4);
            DoMipMap(768 / 2, 1.0f / 8);
            DoMipMap(768 / 8, 1.0f / 16);

            var path = Path.Combine(App.LevelAssetsOutputPath, name, "manifest.json");
            using (var file = File.Open(path, FileMode.Create, FileAccess.Write))
            using (var sw = new StreamWriter(file))
            using (var jtw = new JsonTextWriter(sw)) {
                manifest.WriteTo(jtw);
            }
        }

        private static JObject EntityToJson(Entity entity) {
            return new JObject {
                {"kind", entity.Kind},
                {"x", entity.X},
                {"y", entity.Y},
                {"properties", JObject.FromObject(entity.Tags.ToDictionary(t => t.Item1, t => t.Item2))},
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

                        var manifestLayers = manifest.Value<JObject>("layers");
                        var layer = manifestLayers.Value<JObject>(bucket.Key);
                        if (layer == null) {
                            manifestLayers.Add(bucket.Key, layer = new JObject{{"scales", new JArray()}});
                        }
                        var scales = layer.Value<JArray>("scales");
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
