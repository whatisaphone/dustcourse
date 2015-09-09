using Newtonsoft.Json.Linq;
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
            var unk4 = s1.ReadInt32();
            var unk5 = s1.ReadByte();
            var level = Encoding.ASCII.GetString(s1.ReadBytes(s1.ReadByte()));

            s1.ReadInt16();  // skip two-byte zlib header
            var deflate = new DeflateStream(s1.BaseStream, CompressionMode.Decompress);
            var innerData = new byte[uncompressedDataLen];
            deflate.Read(innerData, 0, uncompressedDataLen);

            var s2 = new BinaryReader(new MemoryStream(innerData));
            var inputsTotalLen = s2.ReadInt32();
            var inputs = JArray.FromObject(Enumerable.Range(0, 7).Select(i => {
                return s2.ReadBytes(s2.ReadInt32());
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
                    //{"unkA", unkA},
                    {"corrections", corrections},
                };
            }));
            return new JObject {
                {"user", user},
                {"level", level},
                //{"unk1", unk1},
                //{"unk2", unk2},
                //{"unk3", unk3},
                //{"unk4", unk4},
                //{"unk5", unk5},
                {"inputs", inputs},
                {"sync", sync},
            };
        }
    }
}
