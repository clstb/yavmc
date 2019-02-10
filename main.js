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

// getResolution extracts width and height of a provided video file
let getResolution = (file) => {
    return new Promise(resolve => {
        ffmpeg(file).ffprobe(function (err, metadata) {
            resolve({width: metadata.streams[0].width, height: metadata.streams[0].height});
        })
    })
};

// upscale reformats the video file to the desired resolution, this may take a lot of disk space
let upscale = (file, width, height, out, verbose) => {
    return new Promise(resolve => {
        let resOptions = `-s ${width}x${height}`; // parse resolution
        let command = ffmpeg(); // create raw command
        // define command and run
        command.on('start', function (commandLine) {
            console.debug('Spawned FFmpeg with command:\n' + chalk.default.blue(commandLine));
        })
        .on('progress', function (progress) {
            if (verbose === true)  {
                console.log('Upscaling: %d % done'.replace('%d', progress.percent));
            }
        })
        .on('error', function (err) {
            console.log('An error occures: ' + err.message);
            resolve();
        })
        .on('end', function () {
            console.log('Upscaling done!');
            resolve();
        })
        .input(file)
        .addOption('-y')
        .addOption('-pix_fmt')
        .addOption('yuv420p') // video format
        .addOption('-vsync 0') // vsync
        .addOption(resOptions) // resolution option
        .addOption('-sws_flags')
        .addOption('lanczos')
        .output(out)
        .run(); // run command
    });
};

// vmaf runs the ffmpeg vmaf filter command
let vmaf = (base, encoded, logPath, verbose) => {
    // build filter string
    let filter = 'libvmaf=model_path=/usr/share/model/vmaf_v0.6.1.pkl:log_fmt=json:log_path=%s'.replace('%s', logPath);
    return new Promise(resolve => {
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
            resolve();
        })
        .on('end', function () { // executes when the command ends
            let metrics = processVMAFLog(logPath);
            console.log('VMAF: %d'.replace('%d', metrics.vmaf));
            resolve();
        })
        .input(base) // base video file
        .input(encoded) // encoded video file
        .addOption('-lavfi')
        .addOption(filter) // add filter option
        .addOption('-f', 'null') // pipe console output to a void
        .output('-')
        .run(); // run command
    });
};

// psnr runs the ffmpeg psnr filter command
let psnr = (base, encoded, logPath, verbose) => {
    // build filter string
    let filter = 'psnr=%s'.replace('%s', logPath);
    return new Promise(resolve => {
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
            resolve();
        })
        .on('end', function (err, stdout, stderr) { // executes when the command ends
            let regex = /y:([^\s]+)/;
            let psnr = stdout.match(regex);
            console.log('PSNR: %d'.replace('%d', psnr[1]));
            resolve();
        })
        .input(base) // base video file
        .input(encoded) // encoded video file
        .addOption('-lavfi')
        .addOption(filter) // add filter option
        .addOption('-f', 'null') // pipe console output to a void
        .output('-')
        .run() // run command
    });
};

// processVMAFLog extracts the vmaf score from the vmaf log file
function processVMAFLog(path) {
    let data = fs.readFileSync(path);
    let log = JSON.parse(data);

    let vmaf = 0;
    for (let frame of log.frames) {
        vmaf += frame.metrics.vmaf;
    }

    return {
        vmaf: vmaf / log.frames.length,
    };
}

(
    async () => {
        let resolution = await getResolution(yargs.argv.base);
        await upscale(yargs.argv.encoded, resolution.width, resolution.height, 'upscaled.y4m', yargs.argv.verbose);
        if (yargs.argv.psnr_log != '') {
            await psnr(yargs.argv.base, 'upscaled.y4m', yargs.argv.psnr_log, yargs.argv.verbose);
        }
        if (yargs.argv.vmaf_log != '') {
            await vmaf(yargs.argv.base, 'upscaled.y4m', yargs.argv.psnr_log, yargs.argv.verbose);
        }
    }
)();

