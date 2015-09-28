using Newtonsoft.Json.Linq;
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;

namespace level_machine {
    internal class ReplayReader {
        public static JObject Read(byte[] data) {
            var s1 = new BinaryReader(new MemoryStream(data));
            if (!s1.ReadBytes(6).SequenceEqual(new[]{'D', 'F', '_', 'R', 'P', 'L'}.Select(c => (byte) c)))
                throw new InvalidDataException();
            var unk1 = s1.ReadByte();
            var user = Encoding.ASCII.GetString(s1.ReadBytes(s1.ReadInt16()));
            if (!s1.ReadBytes(6).SequenceEqual(new[]{'D', 'F', '_', 'R', 'P', 'L'}.Select(c => (byte) c)))
                throw new InvalidDataException();
            var unk2 = s1.ReadByte();
            var unk3 = s1.ReadInt16();
            var uncompressedDataLen = s1.ReadInt32();
            var frames = s1.ReadInt32();
            var character = s1.ReadByte();
            var level = Encoding.ASCII.GetString(s1.ReadBytes(s1.ReadByte()));

            s1.ReadInt16();  // skip two-byte zlib header
            var deflate = new DeflateStream(s1.BaseStream, CompressionMode.Decompress);
            var innerData = new byte[uncompressedDataLen];
            deflate.Read(innerData, 0, uncompressedDataLen);

            var s2 = new BinaryReader(new MemoryStream(innerData));
            var inputsTotalLen = s2.ReadInt32();
            var inputs = JArray.FromObject(Enumerable.Range(0, 7).Select(i => {
                var raw = new BitStream(s2.ReadBytes(s2.ReadInt32()));
                var ret = new StringBuilder();
                var buf = new byte[1];
                var oldVal = 0;
                while (true) {
                    raw.Read(buf, 8);
                    var fs = buf[0];
                    Console.WriteLine(fs);
                    if (fs == 0xff)
                        break;
                    raw.Read(buf, i >= 5 ? 4 : 2);
                    var val = buf[0];
                    Console.WriteLine(val);

                    for (var z = 0; z <= fs; ++z)
                        ret.Append((char) (oldVal + (oldVal < 10 ? '0' : 'a' - 10)));
                    oldVal = val;
                }
                ret.Remove(0, 1);
                return ret.ToString();
            }));
            Debug.Assert(s2.BaseStream.Position == inputsTotalLen + 4);
            var sync = JArray.FromObject(Enumerable.Range(0, s2.ReadInt32()).Select(i => {
                var entityUid = s2.ReadInt32();
                var unkA = s2.ReadInt32();  // this looks like a 1-based index of the entity sync info in a scrambled order?
                var corrections = JArray.FromObject(Enumerable.Range(0, s2.ReadInt32()).Select(j => {
                    return Enumerable.Range(0, 5).Select(k => s2.ReadInt32());
                }));
                return new JObject {
                    {"entity_uid", entityUid},
//                    {"unkA", unkA},
                    {"corrections", corrections},
                };
            }));
            return new JObject {
                {"user", user},
                {"level", level},
//                {"unk1", unk1},
//                {"unk2", unk2},
//                {"unk3", unk3},
                {"frames", frames},
                {"character", character},
                {"inputs", inputs},
                {"sync", sync},
            };
        }
    }
}
