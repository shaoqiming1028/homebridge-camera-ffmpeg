"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FfmpegProcess = void 0;
const child_process_1 = require("child_process");
const readline_1 = __importDefault(require("readline"));
class FfmpegProcess {
    constructor(cameraName, sessionId, videoProcessor, ffmpegArgs, log, debug = false, delegate, callback) {
        log.debug('Stream command: ' + videoProcessor + ' ' + ffmpegArgs, cameraName, debug);
        let started = false;
        const startTime = Date.now();
        this.process = child_process_1.spawn(videoProcessor, ffmpegArgs.split(/\s+/), { env: process.env });
        this.process.stdout.on('data', (data) => {
            const progress = this.parseProgress(data);
            if (progress) {
                if (!started && progress.frame > 0) {
                    started = true;
                    const runtime = (Date.now() - startTime) / 1000;
                    const message = 'Getting the first frames took ' + runtime + ' seconds.';
                    if (runtime < 5) {
                        log.debug(message, cameraName, debug);
                    }
                    else if (runtime < 22) {
                        log.warn(message, cameraName);
                    }
                    else {
                        log.error(message, cameraName);
                    }
                }
            }
        });
        const stderr = readline_1.default.createInterface({
            input: this.process.stderr,
            terminal: false
        });
        stderr.on('line', (line) => {
            if (callback) {
                callback();
                callback = undefined;
            }
            if (line.match(/\[(panic|fatal|error)\]/)) {
                log.error(line, cameraName);
            }
            else if (debug) {
                log.debug(line, cameraName, true);
            }
        });
        this.process.on('error', (error) => {
            log.error('FFmpeg process creation failed: ' + error.message, cameraName);
            if (callback) {
                callback(new Error('FFmpeg process creation failed'));
            }
            delegate.stopStream(sessionId);
        });
        this.process.on('exit', (code, signal) => {
            const message = 'FFmpeg exited with code: ' + code + ' and signal: ' + signal;
            if (code == null || code === 255) {
                if (this.process.killed) {
                    log.debug(message + ' (Expected)', cameraName, debug);
                }
                else {
                    log.error(message + ' (Unexpected)', cameraName);
                }
            }
            else {
                log.error(message + ' (Error)', cameraName);
                delegate.stopStream(sessionId);
                if (!started && callback) {
                    callback(new Error(message));
                }
                else {
                    delegate.controller.forceStopStreamingSession(sessionId);
                }
            }
        });
    }
    parseProgress(data) {
        const input = data.toString();
        if (input.indexOf('frame=') == 0) {
            try {
                const progress = new Map();
                input.split(/\r?\n/).forEach((line) => {
                    const split = line.split('=', 2);
                    progress.set(split[0], split[1]);
                });
                return {
                    frame: parseInt(progress.get('frame')),
                    fps: parseFloat(progress.get('fps')),
                    stream_q: parseFloat(progress.get('stream_0_0_q')),
                    bitrate: parseFloat(progress.get('bitrate')),
                    total_size: parseInt(progress.get('total_size')),
                    out_time_us: parseInt(progress.get('out_time_us')),
                    out_time: progress.get('out_time').trim(),
                    dup_frames: parseInt(progress.get('dup_frames')),
                    drop_frames: parseInt(progress.get('drop_frames')),
                    speed: parseFloat(progress.get('speed')),
                    progress: progress.get('progress').trim()
                };
            }
            catch (_a) {
                return undefined;
            }
        }
        else {
            return undefined;
        }
    }
    stop() {
        this.process.kill('SIGKILL');
    }
    getStdin() {
        return this.process.stdin;
    }
}
exports.FfmpegProcess = FfmpegProcess;
//# sourceMappingURL=ffmpeg.js.map