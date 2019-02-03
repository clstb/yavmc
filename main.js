let fs = require('fs'); // filesystem library
let ffmpeg = require('fluent-ffmpeg'); // ffmpeg wrapper library
let yargs = require('yargs'); // command line arguments library
let chalk = require('chalk'); // colored console output library

yargs.options({
    // base video file
    'b': {
        alias: 'base',
        describe: 'base video file',
        type: 'string',
        nargs: 1,
        demand: true,
    },
    // encoded video file
    'e': {
        alias: 'encoded',
        describe: 'encoded video file',
        type: 'string',
        nargs: 1,
        demand: true,
    },
    // verbosity level
    'v': {
        alias: 'verbose',
        describe: 'set verbosity of log output',
        type: 'boolean',
        nargs: 1,
        default: false,
    },
    // vmaf log path
    'lv': {
        alias: 'vmaf_log',
        describe: 'path to store vmaf logs',
        type: 'string',
        nargs: 1,
        demand: false,
        default: '',
    },
    // psnr log path
    'lp': {
        alias: 'psnr_log',
        describe: 'path to store psnr logs',
        type: 'string',
        nargs: 1,
        demand: false,
        default: '',
    }
});

// if psnr log path is set the psnr filter is executed
if (yargs.argv.psnr_log != '') {
    psnr(yargs.argv.base, yargs.argv.encoded, yargs.argv.psnr_log, yargs.argv.verbose);
}

// if vmaf log path is set the vmaf filter is executed
if (yargs.argv.vmaf_log != '') {
    vmaf(yargs.argv.base, yargs.argv.encoded, yargs.argv.vmaf_log, yargs.argv.verbose);
}

getResolution(yargs.argv.base);
getResolution(yargs.argv.encoded);

function getResolution(file) {
    ffmpeg.ffprobe(file, function(err , metadata){
        console.dir(metadata);
    });
}

// vmaf runs the ffmpeg vmaf filter command
function vmaf(base, encoded, logPath, verbose) {
    // build filter string
    let filter = 'libvmaf=model_path=/usr/share/model/vmaf_v0.6.1.pkl:log_fmt=json:log_path=%s'.replace('%s', logPath);
    // create raw command
    let command = ffmpeg();
    // define command and run
    command.on('start', function (commandLine) { // executes when the command starts
        console.debug('Spawned FFmpeg with command:\n' + chalk.default.blue(commandLine));
    })
        .on('progress', function (progress) { // executes when the command progresses
            if (verbose === true) {
                console.log('Processing VMAF: %d % done'.replace('%d', progress.percent));
            }
        })
        .on('error', function (err) { // executes when the command errors
            console.log('An error occurred: ' + err.message);
        })
        .on('end', function () { // executes when the command ends
            let metrics = processVMAFLog(logPath);
            console.log('VMAF: %d'.replace('%d', metrics.vmaf));
        })
        .input(base) // base video file
        .input(encoded) // encoded video file
        .addOption('-lavfi')
        .addOption(filter) // add filter option
        .addOption('-f', 'null') // pipe console output to a void
        .output('-')
        .run(); // run commmand
}

// psnr runs the ffmpeg psnr filter command
function psnr(base, encoded, logPath, verbose) {
    // build filter string
    let filter = 'psnr=%s'.replace('%s', logPath);
    // create raw command
    let command = ffmpeg();
    // define command and run
    command.on('start', function (commandLine) { // executes when the command starts
        console.debug('Spawned FFmpeg with command:\n' + chalk.default.blue(commandLine));
    })
        .on('progress', function (progress) { // executes when the command progresses
            if (verbose === true) {
                console.log('Processing PSNR: %d % done'.replace('%d', progress.percent));
            }
        })
        .on('error', function (err) { // executes when the command errors
            console.log('An error occured: ' + err.message);
        })
        .on('end', function (err, stdout, stderr) { // executes when the command ends
            let regex = /y:([^\s]+)/;
            let psnr = stdout.match(regex);
            console.log('PSNR: %d'.replace('%d', psnr[1]));
        })
        .input(base) // base video file
        .input(encoded) // encoded video file
        .addOption('-lavfi')
        .addOption(filter) // add filter option
        .addOption('-f', 'null') // pipe console output to a void
        .output('-')
        .run() // run command
}

// processVMAFLog extracts the vmaf score from the vmaf log file
function processVMAFLog(path) {
    let data = fs.readFileSync(path);
    let log = JSON.parse(data);

    let vmaf = 0;
    for (var frame of log.frames) {
        vmaf += frame.metrics.vmaf;
    }

    return {
        vmaf: vmaf / log.frames.length,
    };
}
