export default class Bitstream {
    public position = 0;
    private tempBuffer = [0, 0, 0, 0];

    constructor(private buffer: Buffer) { }

    public remaining() {
        if (this.position % 8)
            throw new Error();
        return this.buffer.slice(this.position / 8);
    }

    public readByte() {
        this.read(this.tempBuffer, 8);
        return this.tempBuffer[0];
    }

    public readU16() {
        this.read(this.tempBuffer, 16);
        return this.tempBuffer[0] | (this.tempBuffer[1] << 8);
    }

    public readU32() {
        this.read(this.tempBuffer, 32);
        return this.tempBuffer[0] | (this.tempBuffer[1] << 8) | (this.tempBuffer[2] << 16) | (this.tempBuffer[3] << 24);
    }

    public readUxx(bits: number) {
        if (bits > 8)
            throw new Error();  // not implemented
        this.read(this.tempBuffer, bits);
        return this.tempBuffer[0];
    }

    public readBuffer(bytes: number) {
        var buf = new Buffer(bytes);
        this.read(buf, bytes * 8);
        return buf;
    }

    public readString(chars: number) {
        return this.readBuffer(chars).toString('ascii');
    }

    public read(buffer: number[] | Buffer, bits: number) {
        if (bits <= 0) {
            this.position += bits;
            return;
        }

        var firstBitOffsetInByte = this.position & 7;
        var bytePos = this.position >> 3;
        var outputPos = 0;
        var bitsRemaining = bits;
        var overflowBits = 8 - bits;
        do {
            var part1 = this.buffer[bytePos] >> firstBitOffsetInByte;
            var part2 = bytePos + 1 < this.buffer.length ? this.buffer[bytePos + 1] << (8 - firstBitOffsetInByte) : 0;
            var mask = bitsRemaining < 8 ? 0xff >> overflowBits : 0xff;
            buffer[outputPos] = (part1 | part2) & mask;
            bitsRemaining -= 8;
            overflowBits += 8;
            ++bytePos;
            ++outputPos;
        } while (bitsRemaining > 0);

        this.position += bits;
    }
}
