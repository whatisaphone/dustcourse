using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace level_machine {
    internal sealed class SpriteLoader {
        private readonly string[] areaNames = { null, "mansion", "forest", "city", "laboratory", "tutorial", "nexus" };

        private readonly string[] propGroups = {
            "books", "buildingblocks", "chains", "decoration", "facade", "foliage", "furniture", "gazebo",
            "lighting", null, "sidewalk", "storage", "study", "fencing", null, null,
            null, null, "backleaves", "leaves", "trunks", "boulders", "backdrops", "storage",
            "npc", "symbol", "cars", "statues", "machinery"
        };
        private readonly Dictionary<string, object> tileCache = new Dictionary<string, object>();

        public TileGfx LoadTile(byte spriteSet, byte spritePalette, byte spriteTile) {
            var filename = string.Format("tile{0}_{1}_0001.png", spriteTile, /* TODO: spritePalette + */ 1);
            var path = Path.Combine(App.TilesPath, "area", areaNames[spriteSet], "tiles", filename);

            object ret;
            if (tileCache.TryGetValue(path, out ret))
                return (TileGfx) ret;

            try {
                var bitmap = new Bitmap(path);
                // changing the pixel format to pre-multiplied speeds compositing up a bit (by ~20% maybe?)
                bitmap = bitmap.Clone(new Rectangle(0, 0, bitmap.Width, bitmap.Height), PixelFormat.Format32bppPArgb);
                ret = new TileGfx {Image = bitmap};
            } catch (Exception) {
                Console.WriteLine("warning, sprite not found: " + path);
                ret = null;
            }

            tileCache[path] = ret;
            return (TileGfx) ret;
        }

        public Sprite LoadProp(byte propSet, ushort propGroup, ushort propIndex, byte palette) {
            var filename = string.Format("{0}_{1}_{2}", propGroups[propGroup], propIndex, palette + 1);
            var path = Path.Combine(App.SpritesPath, "area", areaNames[propSet], "props", filename);

            object ret;
            if (tileCache.TryGetValue(path, out ret))
                return (Sprite) ret;

            try {
                var bitmap = new Bitmap(path + ".png");
                // changing the pixel format to pre-multiplied speeds compositing up a bit (by ~20% maybe?)
                bitmap = bitmap.Clone(new Rectangle(0, 0, bitmap.Width, bitmap.Height), PixelFormat.Format32bppPArgb);

                JObject manifest;
                using (var file = File.Open(path + ".json", FileMode.Open, FileAccess.Read))
                using (var sr = new StreamReader(file))
                using (var jtr = new JsonTextReader(sr))
                    manifest = JObject.Load(jtr);

                ret = new Sprite {
                    Image = bitmap,
                    Rect1 = Rectangle.FromLTRB(
                        manifest.Value<JObject>("rect1").Value<int>("l"),
                        manifest.Value<JObject>("rect1").Value<int>("t"),
                        manifest.Value<JObject>("rect1").Value<int>("r"),
                        manifest.Value<JObject>("rect1").Value<int>("b")),
                    Rect2 = Rectangle.FromLTRB(
                        manifest.Value<JObject>("rect2").Value<int>("l"),
                        manifest.Value<JObject>("rect2").Value<int>("t"),
                        manifest.Value<JObject>("rect2").Value<int>("r"),
                        manifest.Value<JObject>("rect2").Value<int>("b")),
                };
            } catch (Exception) {
                Console.WriteLine("warning, sprite not found: " + path);
                ret = null;
            }

            tileCache[path] = ret;
            return (Sprite) ret;
        }
    }

    internal sealed class TileGfx {
        public Image Image;
    }

    internal sealed class Sprite {
        public Image Image;
        public Rectangle Rect1, Rect2;
    }
}
