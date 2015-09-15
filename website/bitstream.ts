export default class Bitstream {
    private position = 0;

    constructor(private buffer: Buffer) { }

    public readByte() {
        return this.buffer[this.position++];
    }

    public readI16() {
        var n = this.buffer.readInt16LE(this.position);
        this.position += 2;
        return n;
    }

    public readI32() {
        var n = this.buffer.readInt32LE(this.position);
        this.position += 4;
        return n;
    }

    public readString(bytes: number) {
        var s = this.buffer.toString('ascii', this.position, this.position + bytes);
        this.position += bytes;
        return s;
    }

    public remaining() {
        return this.buffer.slice(this.position);
    }
}
