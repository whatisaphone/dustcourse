using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace level_machine {
    internal static class Util {
        public static short MakeI16(byte[] buffer) {
            return (short)(buffer[0] | (buffer[1] << 8));
        }

        public static short MakeI16(byte[] buffer, int offset) {
            return (short)(buffer[offset + 0] | (buffer[offset + 1] << 8));
        }

        public static ushort MakeU16(byte[] buffer) {
            return (ushort)(buffer[0] | (buffer[1] << 8));
        }

        public static int MakeI32(byte[] buffer) {
            return (buffer[0] | (buffer[1] << 8) | (buffer[2] << 16) | (buffer[3] << 24));
        }

        public static int MakeI32(byte[] buffer, int offset) {
            return (buffer[offset + 0] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24));
        }

        public static string Hexify(IEnumerable<byte> bytes) {
            var ret = new StringBuilder();
            var n = 0;
            foreach (var b in bytes) {
                ret.AppendFormat("{0:X2} ", b);
                ++n;
                if (n % 16 == 0)
                    ret.Append("| ");
                else if (n % 4 == 0)
                    ret.Append(" ");
            }
            return ret.ToString().Trim();
        }

        public static T GetProp<T>(List<Tuple<string, object>> props, string name) {
            return (T) props.First(p => p.Item1 == name).Item2;
        }

        public static string DumpKeyValueList(List<Tuple<string, object>> pairs) {
            //            return string.Format("[{0}]",
            //                string.Join(", ",
            //                    list.Select(p => string.Format("{0} = {1}", p.Item1, p.Item2))));
            return new JObject(pairs.Select(t => new JProperty(t.Item1, t.Item2))).ToString(Formatting.None);
        }
    }
}
