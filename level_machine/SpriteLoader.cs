using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace level_machine {
    internal sealed class SpriteLoader {
        private readonly string[] setNames = { null, "mansion", "forest", "city", "laboratory", "tutorial", "nexus" };

        private readonly string[] propGroups = {
            "books", "buildingblocks", "chains", "decoration", "facade", "foliage", "furniture", "gazebo",
            "lighting", null, "statues", "storage", "study", "fencing", null, null,
            null, null, "backleaves", "leaves", "trunks", "boulders", "backdrops", "temple",
            "npc", "symbol", "cars", "sidewalk", "machinery"
        };
        private readonly Dictionary<string, Sprite> cache = new Dictionary<string, Sprite>();

        public Sprite LoadTile(int spriteSet, int spriteTile, int spritePalette, int chunk) {
            var filename = string.Format("tile{0}_{1}_0001", spriteTile, spritePalette * 30 + chunk);
            var path = Path.Combine(App.SpritesPath, "area", setNames[spriteSet], "tiles", filename);
            try {
                return Cached(path, () => Load(path));
            } catch (Exception) {
                filename = string.Format("tile{0}_{1}_0001", spriteTile, 0 * 30 + chunk);
                path = Path.Combine(App.SpritesPath, "area", setNames[spriteSet], "tiles", filename);
                return Cached(path, () => Load(path));
            }
        }

        public Sprite LoadProp(int propSet, int propGroup, int propIndex, int palette) {
            var isBackdrop = propGroups[propGroup] == "backdrops" && setNames[propSet] != "mansion";
            var filename = isBackdrop && setNames[propSet] == "mansion"
                ? string.Format("backdrop{0}_{1}_0001", propIndex, palette + 1)
                : string.Format("{0}_{1}_{2}_0001", propGroups[propGroup], propIndex, palette + 1);
            var dir = isBackdrop ? "backdrops" : "props";
            var path = Path.Combine(App.SpritesPath, "area", setNames[propSet], dir, filename);
            return Cached(path, () => Load(path));
        }

        public Sprite LoadFilth(int set, bool spikes, int chunk) {
            var filename = string.Format("{0}_{1}_0001", spikes ? "spikes" : "filth", chunk);
            var path = Path.Combine(App.SpritesPath, "area", setNames[set], "filth", filename);
            return Cached(path, () => Load(path));
        }

        private Sprite Cached(string path, Func<Sprite> action) {
            Sprite ret;
            if (cache.TryGetValue(path, out ret))
                return ret;

            ret = action();
            cache[path] = ret;
            return ret;
        }

        private Sprite Load(string path) {
            var bitmap = new Bitmap(path + ".png");
            // changing the pixel format to pre-multiplied speeds compositing up a bit (by ~20% maybe?)
            bitmap = bitmap.Clone(new Rectangle(0, 0, bitmap.Width, bitmap.Height), PixelFormat.Format32bppPArgb);

            JObject manifest;
            using (var file = File.Open(path + ".json", FileMode.Open, FileAccess.Read))
            using (var sr = new StreamReader(file))
            using (var jtr = new JsonTextReader(sr))
                manifest = JObject.Load(jtr);

            return new Sprite {
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
        }
    }

    internal sealed class Sprite {
        public Image Image;
        public Rectangle Rect1, Rect2;
    }
}
