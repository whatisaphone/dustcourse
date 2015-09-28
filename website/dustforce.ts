import * as zlib from 'zlib';
import * as _ from 'lodash';
import Bitstream from './bitstream';

export function parseReplay(data: Buffer) {
    var s = new Bitstream(data);
    if (s.readString(6) !== 'DF_RPL')
        throw new Error();
    s.readByte();
    var user = s.readString(s.readU16());
    if (s.readString(6) !== 'DF_RPL')
        throw new Error();
    s.readByte();
    s.readU16();
    var len = s.readU32();
    var frames = s.readU32();
    var character = s.readByte();
    var level = s.readString(s.readByte());

    s = new Bitstream(zlib.inflateSync(s.remaining()));

    var inputsLen = s.readU32();
    var inputs = _.map(_.range(0, 7), i => expandReplayInputs(i, s.readBuffer(s.readU32())));
    var sync = _.map(_.range(0, s.readU32()), () => {
        var entityUid = s.readU32();
        s.readU32();  // this looks like a 1-based index of the entity sync info in a scrambled order?
        var corrections = _.map(_.range(0, s.readU32()), () => _.map(_.range(0, 5), () => s.readU32()));
        return {
            entity_uid: entityUid,
            corrections: corrections,
        };
    });

    return {
        user: user,
        level: level,
        frames: frames,
        character: character,
        inputs: inputs,
        sync: sync,
    };
}

function expandReplayInputs(index: number, data: Buffer) {
    var s = new Bitstream(data);
    var ret = '';
    var state = 0;

    for (;;) {
        var frames = s.readByte();
        if (frames === 0xff)
            break;
        var next = s.readUxx(index >= 5 ? 4 : 2);

        for (var f = 0; f <= frames; ++f)
            ret += String.fromCharCode(state + (state < 10 ? 48 /* '0' */ : 87 /* 'a' - 10 */));
        state = next;
    }

    return ret.slice(1);
}
