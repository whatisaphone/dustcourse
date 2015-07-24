using System;
using System.IO;
using System.Linq;

namespace level_machine {
    internal static class App {
        public const int NumLayers = 20;
        public const int PixelsPerTile = 48;
        public const int SlicesPerBlock = 16;
        public const int PixelsPerSlice = PixelsPerTile * SlicesPerBlock;
        public const string SpritesPath = "T:\\Dev\\Projects\\Dustworld\\build\\sprites";
        public const string IntermediatePath = "T:\\Dev\\Projects\\Dustworld\\build\\intermediate";
        public const string LevelAssetsOutputPath = "T:\\Dev\\Projects\\Dustworld\\build\\website\\static\\level-assets";

        private static void Main(string[] args) {
            var command = args.Length > 0 ? args[0] : "<not-given>";
            if (command == "render") {
                foreach (var filename in args.Skip(1))
                    Render(filename);
            } else if (command == "dump") {
                foreach (var filename in args.Skip(1))
                    Dump(filename);
            } else if (command == "extract-sprites") {
                foreach (var path in args.Skip(1))
                    ExtractSprites(path);
            } else {
                Console.WriteLine("Invalid arguments");
                //ExtractSprites("T:\\Steam Library\\steamapps\\common\\Dustforce\\content\\sprites\\props3");
                Render("T:\\Dev\\Projects\\DustWorld\\reversing\\level testcases\\filth");
                //Render("T:\\Steam Library\\steamapps\\common\\Dustforce\\content\\levels2\\vacantlot");
            }
        }

        private static void ExtractSprites(string path) {
            var name = Path.GetFileName(path);
            SpriteExtractor.ExtractSprites(name, ReadFile(path));
        }

        private static void Render(string path) {
            var name = Path.GetFileName(path);
            var level = LevelParser.LoadLevel(ReadFile(path), false);
            var result = LevelRenderer.Render(level, name);
            MipMapper.Run(name, result);
        }

        private static void Dump(string path) {
            var name = Path.GetFileName(path);
            var level = LevelParser.LoadLevel(ReadFile(path), false);

            Console.WriteLine(path);
            Console.WriteLine(Util.DumpKeyValueList(level.Tags));
            foreach (var block in level.Blocks) {
                Console.WriteLine("block x={0:X4} y={1:X4}", block.X, block.Y);
                foreach (var slice in block.Slices) {
                    Console.WriteLine("  slice ?={0:X4} x={1:X2} y={2:X2} ?={3:X2} ?={4:X8} kinds={5:X8} ...",
                        slice.Header.Field8, slice.Header.X, slice.Header.Y, slice.Header.FieldC, slice.Header.Field14, slice.Header.Kinds);
                    foreach (var tile in slice.Tiles) {
                        Console.WriteLine("    tile x={0:X1} y={1:X1} layer={2} | f={3:X2} e={4:X2} c={5:X2} | {6}",
                            tile.X, tile.Y, tile.Layer, tile.Shape, tile.Edges, tile.EndCaps, Util.Hexify(tile.RawData));
                    }
                    foreach (var filth in slice.Filth) {
                        Console.WriteLine("    filth x={0:X2} y={1:X2} e={2:X4} c={3:X2} | {4}", filth.X, filth.Y, filth.Edges, filth.EndCaps, Util.Hexify(filth.RawData));
                    }
                    foreach (var prop in slice.Props) {
                        Console.WriteLine("    prop x={0:N} y={1:N} rot={2:0.#} fh={3} fv={4} ps={5:X2} pg={6:X4} pi={7:X4} pal={8:X2} lg={9:X2} ls={10:X2}",
                            prop.X, prop.Y, prop.Rotation, prop.FlipHorz ? 'Y' : 'N', prop.FlipVert ? 'Y' : 'N', prop.PropSet,
                            prop.PropGroup, prop.PropIndex, prop.Palette, prop.LayerGroup, prop.LayerSub);
                    }
                    foreach (var entity in slice.Entities) {
                        Console.WriteLine("entity {0} {1:N} {2:N} {3:X4} {4:X2} {5} {6} {7} {8}",
                            entity.Name, entity.Field1C, entity.Field20, entity.Field24, entity.Field28,
                            entity.Field2C ? 'Y' : 'N', entity.Field30 ? 'Y' : 'N', entity.Field34 ? 'Y' : 'N', Util.DumpKeyValueList(entity.Tags));
                    }
                }
            }
        }

        private static byte[] ReadFile(string path) {
            byte[] data;
            using (var file = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                data = new byte[file.Length];
                file.Read(data, 0, data.Length);
            }
            return data;
        }
    }
}
