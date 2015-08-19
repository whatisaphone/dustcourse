using System.Diagnostics;
using System.Drawing;
using System.IO;
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

        public static double Distance(double x1, double y1, double x2, double y2) {
            return Math.Sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
        }

        public static List<Tuple<string, object>> ReadKeyValueList(BitStream stream) {
            var ret = new List<Tuple<string, object>>();
            for (; ; ) {
                var pair = ReadKeyValuePair(stream);
                if (pair == null)
                    return ret;
                ret.Add(pair);
            }
        }

        public static Tuple<string, object> ReadKeyValuePair(BitStream stream) {
            var buf = new byte[4];
            stream.Read(buf, 4);
            var valueType = buf[0];
            if (valueType == 0)
                return null;

            stream.Read(buf, 6);
            var charCount = MakeI32(buf);
            var keyChars = new char[64];
            stream.ReadPackedText(keyChars, charCount);
            var key = new string(keyChars, 0, keyChars.ToList().IndexOf('\0'));

            ushort valueCount = 1;
            List<object> array = null;
            if (valueType == 15) {
                stream.Read(buf, 4);
                valueType = buf[0];
                stream.Read(buf, 16);
                valueCount = MakeU16(buf);
                array = new List<object>();
            }

            if (valueCount == 0) {
                Debug.Assert(array != null);
                return Tuple.Create(key, (object)array);
            }

            var curValue = 0;
            for (; ; ) {
                object value;
                switch (valueType - 1) {
                    case 0:
                        stream.Read(buf, 1);
                        value = buf[0] != 0;
                        break;
                    case 1:
                    case 2:
                        stream.Read(buf, 32);
                        value = MakeI32(buf);
                        break;
                    case 3:
                        value = stream.ReadFloat(32, 32);
                        break;
                    case 4:
                        stream.Read(buf, 16);
                        var strBytes = MakeU16(buf);
                        var strBuf = new byte[strBytes];
                        stream.Read(strBuf, strBytes * 8);
                        value = Encoding.ASCII.GetString(strBuf);
                        break;
                    case 9:
                        var first = stream.ReadFloat(32, 32);
                        var second = stream.ReadFloat(32, 32);
                        value = String.Format("{0}, {1}", first, second);
                        break;
                    case 13:
                        value = ReadKeyValueList(stream);
                        break;
                    default:
                        throw new FormatException("unknown value type");
                        value = null;
                        break;
                }

                if (array != null)
                    array.Add(value);

                ++curValue;
                if (curValue >= valueCount)
                    return Tuple.Create(key, array ?? value);
            }
        }
    }
}
