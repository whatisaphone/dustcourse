import * as zlib from 'zlib';
import * as _ from 'lodash';
import Bitstream from './bitstream';

export function parseReplay(data: Buffer) {
    var s = new Bitstream(data);
    if (s.readString(6) !== 'DF_RPL')
        throw new Error();
    s.readByte();
    var user = s.readString(s.readI16());
    if (s.readString(6) !== 'DF_RPL')
        throw new Error();
    s.readByte();
    s.readI16();
    var len = s.readI32();
    var frames = s.readI32();
    var character = s.readByte();
    var level = s.readString(s.readByte());

    s = new Bitstream(zlib.inflateSync(s.remaining()));

    var inputsLen = s.readI32();
    var inputs = _.map(_.range(0, 7), () => {
        var inp = s.readString(s.readI32());
        return new Buffer(inp, 'binary').toString('base64');
    });
    var sync = _.map(_.range(0, s.readI32()), () => {
        var entityUid = s.readI32();
        s.readI32();  // this looks like a 1-based index of the entity sync info in a scrambled order?
        var corrections = _.map(_.range(0, s.readI32()), () => _.map(_.range(0, 5), () => s.readI32()));
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
