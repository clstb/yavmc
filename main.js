let fs = require('fs');
let ffmpeg = require('fluent-ffmpeg');
let yargs = require('yargs');
let chalk = require('chalk');

yargs.options({
    'b': {
        alias: 'base',
        describe: 'base video file',
        type: 'string',
        nargs: 1,
        demand: true,
    },
    'e': {
        alias: 'encoded',
        describe: 'encoded video file',
        type: 'string',
        nargs: 1,
        demand: true,
    },
    'l': {
        alias: 'logPath',
        describe: 'path to store logs',
        type: 'string',
        nargs: 1,
        demand: true,
    }
});

run(yargs.argv.base, yargs.argv.encoded, yargs.argv.logPath);

function run(base, encoded, logPath) {
    let filter = 'libvmaf=model_path=/usr/share/model/vmaf_v0.6.1.pkl:psnr=1:log_fmt=json:log_path=%s'.replace('%s', logPath);
    let command = ffmpeg();
    command.on('start', function(commandLine) {
            console.debug('Spawned Ffmpeg with command: ' + chalk.default.blue(commandLine));
        })
        .on('progress', function(progress) {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write('Processing: %d % done'.replace('%d', progress.percent));
        })
        .on('error', function(err) {
            console.log('An error occurred: ' + err.message);
        })
        .on('end', function() {
            console.log('Processing finished.');
            let metrics = processLog(logPath);
            console.log(metrics);
        })
        .input(base)
        .input(encoded)
        .addOption('-lavfi')
        .addOption(filter)
        .addOption('-f', 'null')
        .output('-')
        .run();
}

function processLog(path) {
    var data = fs.readFileSync(path);
    var log = JSON.parse(data);

    var vmaf = 0;
    var psnr = 0;
    for(var frame of log.frames) {
        vmaf += frame.metrics.vmaf;
        psnr += frame.metrics.psnr;
    }

    return {
        vmaf: vmaf / log.frames.length,
        psnr: psnr / log.frames.length,
    };
}
