namespace level_machine {
    internal sealed class BitStream {
        private readonly byte[] data;
        private int bitPosition;

        public BitStream(byte[] data) {
            this.data = data;
        }

        public int BitPosition {
            get { return bitPosition; }
            set { bitPosition = value; }
        }

        public void Read(byte[] buffer, int bits) {
            if (bits <= 0) {
                bitPosition += bits;
                return;
            }

            var firstBitOffsetInByte = bitPosition & 7;
            var bytePos = bitPosition >> 3;
            var outputPos = 0;
            var bitsRemaining = bits;
            var overflowBits = 8 - bits;
            do {
                var part1 = data[bytePos] >> firstBitOffsetInByte;
                var part2 = bytePos + 1 < data.Length ? data[bytePos + 1] << (8 - firstBitOffsetInByte) : 0;
                var mask = bitsRemaining < 8 ? 0xff >> overflowBits : 0xff;
                buffer[outputPos] = (byte)((part2 | part1) & mask);
                bitsRemaining -= 8;
                overflowBits += 8;
                ++bytePos;
                ++outputPos;
            } while (bitsRemaining > 0);

            bitPosition += bits;
        }

        public void ReadPackedText(char[] buffer, int chars) {
            var va = new byte[1];
            int i = 0;
            if (chars != 0) {
                do {
                    Read(va, 6);
                    var v = va[0];
                    int ch = ((((v & 0x3F) > 0x24 ? 1 : 0) + (v & 0x3F)) > 0x23 ? 4 : 0)
                             + ((v & 0x3F) > 0x24 ? 1 : 0)
                             + (v & 0x3F);
                    ch += (ch > 9u ? 0x37 : 0x30);
                    buffer[i] = (char)ch;
                    ++i;
                } while (i < chars);
            }
        }

        public float ReadFloat(int bitsA, int bitsB) {
            var buf = new byte[4];

            Read(buf, 1);
            bool sign = buf[0] != 0;
            Read(buf, bitsA - 1);
            var part1 = Util.MakeI32(buf);
            Read(buf, bitsB);
            var part2 = Util.MakeI32(buf);

            var v5 = part1 * (sign ? -1 : 1);
            double xmm1 = part2;
            xmm1 += (part2 >> 31 != 0 ? 4294967296 : 0);
            int eax = 1 << (bitsB - 1);
            xmm1 /= eax + (eax >> 31 != 0 ? (double)4294967296 : 0);
            xmm1 += v5;
            return (float)xmm1;
        }
    }
}
