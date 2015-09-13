var child_process = require('child_process');
var watchr = require('watchr');

watchr.watch({
    paths: ['C:/Users/John/AppData/Roaming/Dustforce/user/level_src'],
    interval: 250,
    catchupDelay: 250,
    listeners: {
        change: function (changeType, filePath, fileCurrentStat, filePreviousStat) {
            console.log('got change');
            var dump = child_process.spawnSync('../level_machine/bin/Debug/level_machine', ['dump', filePath]).stdout.toString();
            dump.split(/\r?\n/).forEach(function (line) {
                if (/^\s*(?:block|slice|prop)/.test(line))
                    console.log(line);
            });
        }
    }
});
