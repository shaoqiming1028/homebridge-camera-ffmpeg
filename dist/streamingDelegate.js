"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamingDelegate = void 0;
const child_process_1 = require("child_process");
const dgram_1 = require("dgram");
const ffmpeg_for_homebridge_1 = __importDefault(require("ffmpeg-for-homebridge"));
const get_port_1 = __importDefault(require("get-port"));
const ffmpeg_1 = require("./ffmpeg");
class StreamingDelegate {
    constructor(log, cameraConfig, api, hap, videoProcessor) {
        var _a;
        this.pendingSessions = new Map();
        this.ongoingSessions = new Map();
        this.timeouts = new Map();
        this.log = log;
        this.hap = hap;
        this.cameraName = cameraConfig.name;
        this.unbridge = (_a = cameraConfig.unbridge) !== null && _a !== void 0 ? _a : false;
        this.videoConfig = cameraConfig.videoConfig;
        this.videoProcessor = videoProcessor || ffmpeg_for_homebridge_1.default || 'ffmpeg';
        api.on("shutdown", () => {
            for (const session in this.ongoingSessions) {
                this.stopStream(session);
            }
        });
        const options = {
            cameraStreamCount: this.videoConfig.maxStreams || 2,
            delegate: this,
            streamingOptions: {
                supportedCryptoSuites: [0],
                video: {
                    resolutions: [
                        [320, 180, 30],
                        [320, 240, 15],
                        [320, 240, 30],
                        [480, 270, 30],
                        [480, 360, 30],
                        [640, 360, 30],
                        [640, 480, 30],
                        [1280, 720, 30],
                        [1280, 960, 30],
                        [1920, 1080, 30],
                        [1600, 1200, 30]
                    ],
                    codec: {
                        profiles: [0, 1, 2],
                        levels: [0, 1, 2]
                    }
                },
                audio: {
                    twoWayAudio: !!this.videoConfig.returnAudioTarget,
                    codecs: [
                        {
                            type: "AAC-eld",
                            samplerate: 16
                        }
                    ]
                }
            }
        };
        this.controller = new hap.CameraController(options);
    }
    determineResolution(request, isSnapshot) {
        var _a;
        const resInfo = {
            width: request.width,
            height: request.height
        };
        if (!isSnapshot) {
            if (this.videoConfig.maxWidth !== undefined &&
                (this.videoConfig.forceMax || request.width > this.videoConfig.maxWidth)) {
                resInfo.width = this.videoConfig.maxWidth;
            }
            if (this.videoConfig.maxHeight !== undefined &&
                (this.videoConfig.forceMax || request.height > this.videoConfig.maxHeight)) {
                resInfo.height = this.videoConfig.maxHeight;
            }
        }
        const filters = ((_a = this.videoConfig.videoFilter) === null || _a === void 0 ? void 0 : _a.split(',')) || [];
        const noneFilter = filters.indexOf('none');
        if (noneFilter >= 0) {
            filters.splice(noneFilter, 1);
        }
        resInfo.snapFilter = filters.join(',');
        if ((noneFilter < 0) && (resInfo.width > 0 || resInfo.height > 0)) {
            resInfo.resizeFilter = 'scale=' + (resInfo.width > 0 ? '\'min(' + resInfo.width + ',iw)\'' : 'iw') + ':' +
                (resInfo.height > 0 ? '\'min(' + resInfo.height + ',ih)\'' : 'ih') +
                ':force_original_aspect_ratio=decrease';
            filters.push(resInfo.resizeFilter);
            filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
        }
        if (filters.length > 0) {
            resInfo.videoFilter = filters.join(',');
        }
        return resInfo;
    }
    fetchSnapshot(snapFilter) {
        this.snapshotPromise = new Promise((resolve, reject) => {
            const startTime = Date.now();
            const ffmpegArgs = (this.videoConfig.stillImageSource || this.videoConfig.source) +
                ' -frames:v 1' +
                (snapFilter ? ' -filter:v ' + snapFilter : '') +
                ' -f image2 -' +
                ' -hide_banner' +
                ' -loglevel error';
            this.log.debug('Snapshot command: ' + this.videoProcessor + ' ' + ffmpegArgs, this.cameraName, this.videoConfig.debug);
            const ffmpeg = child_process_1.spawn(this.videoProcessor, ffmpegArgs.split(/\s+/), { env: process.env });
            let snapshotBuffer = Buffer.alloc(0);
            ffmpeg.stdout.on('data', (data) => {
                snapshotBuffer = Buffer.concat([snapshotBuffer, data]);
            });
            ffmpeg.on('error', (error) => {
                reject('FFmpeg process creation failed: ' + error.message);
            });
            ffmpeg.stderr.on('data', (data) => {
                data.toString().split('\n').forEach((line) => {
                    if (line.length > 0) {
                        this.log.error(line, this.cameraName + '] [Snapshot');
                    }
                });
            });
            ffmpeg.on('close', () => {
                if (snapshotBuffer.length > 0) {
                    resolve(snapshotBuffer);
                }
                else {
                    reject('Failed to fetch snapshot.');
                }
                setTimeout(() => {
                    this.snapshotPromise = undefined;
                }, 3 * 1000);
                const runtime = (Date.now() - startTime) / 1000;
                let message = 'Fetching snapshot took ' + runtime + ' seconds.';
                if (runtime < 5) {
                    this.log.debug(message, this.cameraName, this.videoConfig.debug);
                }
                else {
                    if (!this.unbridge) {
                        message += ' It is highly recommended you switch to unbridge mode.';
                    }
                    if (runtime < 22) {
                        this.log.warn(message, this.cameraName);
                    }
                    else {
                        message += ' The request has timed out and the snapshot has not been refreshed in HomeKit.';
                        this.log.error(message, this.cameraName);
                    }
                }
            });
        });
        return this.snapshotPromise;
    }
    resizeSnapshot(snapshot, resizeFilter) {
        return new Promise((resolve, reject) => {
            const ffmpegArgs = '-i pipe:' +
                ' -frames:v 1' +
                (resizeFilter ? ' -filter:v ' + resizeFilter : '') +
                ' -f image2 -';
            this.log.debug('Resize command: ' + this.videoProcessor + ' ' + ffmpegArgs, this.cameraName, this.videoConfig.debug);
            const ffmpeg = child_process_1.spawn(this.videoProcessor, ffmpegArgs.split(/\s+/), { env: process.env });
            let resizeBuffer = Buffer.alloc(0);
            ffmpeg.stdout.on('data', (data) => {
                resizeBuffer = Buffer.concat([resizeBuffer, data]);
            });
            ffmpeg.on('error', (error) => {
                reject('FFmpeg process creation failed: ' + error.message);
            });
            ffmpeg.on('close', () => {
                resolve(resizeBuffer);
            });
            ffmpeg.stdin.end(snapshot);
        });
    }
    async handleSnapshotRequest(request, callback) {
        const resolution = this.determineResolution(request, true);
        try {
            const cachedSnapshot = !!this.snapshotPromise;
            this.log.debug('Snapshot requested: ' + request.width + ' x ' + request.height, this.cameraName, this.videoConfig.debug);
            const snapshot = await (this.snapshotPromise || this.fetchSnapshot(resolution.snapFilter));
            this.log.debug('Sending snapshot: ' + (resolution.width > 0 ? resolution.width : 'native') + ' x ' +
                (resolution.height > 0 ? resolution.height : 'native') +
                (cachedSnapshot ? ' (cached)' : ''), this.cameraName, this.videoConfig.debug);
            const resized = await this.resizeSnapshot(snapshot, resolution.resizeFilter);
            callback(undefined, resized);
        }
        catch (err) {
            this.log.error(err, this.cameraName);
            callback(err);
        }
    }
    async prepareStream(request, callback) {
        const videoReturnPort = await get_port_1.default();
        const videoSSRC = this.hap.CameraController.generateSynchronisationSource();
        const audioReturnPort = await get_port_1.default();
        const audioSSRC = this.hap.CameraController.generateSynchronisationSource();
        const ipv6 = request.addressVersion === 'ipv6';
        const sessionInfo = {
            address: request.targetAddress,
            ipv6: ipv6,
            videoPort: request.video.port,
            videoReturnPort: videoReturnPort,
            videoCryptoSuite: request.video.srtpCryptoSuite,
            videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
            videoSSRC: videoSSRC,
            audioPort: request.audio.port,
            audioReturnPort: audioReturnPort,
            audioCryptoSuite: request.audio.srtpCryptoSuite,
            audioSRTP: Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]),
            audioSSRC: audioSSRC
        };
        const response = {
            video: {
                port: videoReturnPort,
                ssrc: videoSSRC,
                srtp_key: request.video.srtp_key,
                srtp_salt: request.video.srtp_salt
            },
            audio: {
                port: audioReturnPort,
                ssrc: audioSSRC,
                srtp_key: request.audio.srtp_key,
                srtp_salt: request.audio.srtp_salt
            }
        };
        this.pendingSessions.set(request.sessionID, sessionInfo);
        callback(undefined, response);
    }
    startStream(request, callback) {
        const sessionInfo = this.pendingSessions.get(request.sessionID);
        if (sessionInfo) {
            const vcodec = this.videoConfig.vcodec || 'libx264';
            const mtu = this.videoConfig.packetSize || 1316;
            let encoderOptions = this.videoConfig.encoderOptions;
            if (!encoderOptions && vcodec === 'libx264') {
                encoderOptions = '-preset ultrafast -tune zerolatency';
            }
            const resolution = this.determineResolution(request.video, false);
            let fps = (this.videoConfig.maxFPS !== undefined &&
                (this.videoConfig.forceMax || request.video.fps > this.videoConfig.maxFPS)) ?
                this.videoConfig.maxFPS : request.video.fps;
            let videoBitrate = (this.videoConfig.maxBitrate !== undefined &&
                (this.videoConfig.forceMax || request.video.max_bit_rate > this.videoConfig.maxBitrate)) ?
                this.videoConfig.maxBitrate : request.video.max_bit_rate;
            if (vcodec === 'copy') {
                resolution.width = 0;
                resolution.height = 0;
                resolution.videoFilter = undefined;
                fps = 0;
                videoBitrate = 0;
            }
            this.log.debug('Video stream requested: ' + request.video.width + ' x ' + request.video.height + ', ' +
                request.video.fps + ' fps, ' + request.video.max_bit_rate + ' kbps', this.cameraName, this.videoConfig.debug);
            this.log.info('Starting video stream: ' + (resolution.width > 0 ? resolution.width : 'native') + ' x ' +
                (resolution.height > 0 ? resolution.height : 'native') + ', ' + (fps > 0 ? fps : 'native') +
                ' fps, ' + (videoBitrate > 0 ? videoBitrate : '???') + ' kbps' +
                (this.videoConfig.audio ? (' (' + request.audio.codec + ')') : ''), this.cameraName);
            let ffmpegArgs = this.videoConfig.source;
            ffmpegArgs +=
                (this.videoConfig.mapvideo ? ' -map ' + this.videoConfig.mapvideo : ' -an -sn -dn') +
                    ' -codec:v ' + vcodec +
                    ' -pix_fmt yuv420p' +
                    ' -color_range mpeg' +
                    (fps > 0 ? ' -r ' + fps : '') +
                    ' -f rawvideo' +
                    (encoderOptions ? ' ' + encoderOptions : '') +
                    (resolution.videoFilter ? ' -filter:v ' + resolution.videoFilter : '') +
                    (videoBitrate > 0 ? ' -b:v ' + videoBitrate + 'k' : '') +
                    ' -payload_type ' + request.video.pt;
            ffmpegArgs +=
                ' -ssrc ' + sessionInfo.videoSSRC +
                    ' -f rtp' +
                    ' -srtp_out_suite AES_CM_128_HMAC_SHA1_80' +
                    ' -srtp_out_params ' + sessionInfo.videoSRTP.toString('base64') +
                    ' srtp://' + sessionInfo.address + ':' + sessionInfo.videoPort +
                    '?rtcpport=' + sessionInfo.videoPort + '&pkt_size=' + mtu;
            if (this.videoConfig.audio) {
                if (request.audio.codec === "OPUS" || request.audio.codec === "AAC-eld") {
                    ffmpegArgs +=
                        (this.videoConfig.mapaudio ? ' -map ' + this.videoConfig.mapaudio : ' -vn -sn -dn') +
                            (request.audio.codec === "OPUS" ?
                                ' -codec:a libopus' +
                                    ' -application lowdelay' :
                                ' -codec:a libfdk_aac' +
                                    ' -profile:a aac_eld') +
                            ' -flags +global_header' +
                            ' -f null' +
                            ' -ar ' + request.audio.sample_rate + 'k' +
                            ' -b:a ' + request.audio.max_bit_rate + 'k' +
                            ' -ac ' + request.audio.channel +
                            ' -payload_type ' + request.audio.pt;
                    ffmpegArgs +=
                        ' -ssrc ' + sessionInfo.audioSSRC +
                            ' -f rtp' +
                            ' -srtp_out_suite AES_CM_128_HMAC_SHA1_80' +
                            ' -srtp_out_params ' + sessionInfo.audioSRTP.toString('base64') +
                            ' srtp://' + sessionInfo.address + ':' + sessionInfo.audioPort +
                            '?rtcpport=' + sessionInfo.audioPort + '&pkt_size=188';
                }
                else {
                    this.log.error('Unsupported audio codec requested: ' + request.audio.codec, this.cameraName);
                }
            }
            ffmpegArgs += ' -loglevel level' + (this.videoConfig.debug ? '+verbose' : '') +
                ' -progress pipe:1';
            const activeSession = {};
            activeSession.socket = dgram_1.createSocket(sessionInfo.ipv6 ? 'udp6' : 'udp4');
            activeSession.socket.on('error', (err) => {
                this.log.error('Socket error: ' + err.name, this.cameraName);
                this.stopStream(request.sessionID);
            });
            activeSession.socket.on('message', () => {
                if (activeSession.timeout) {
                    clearTimeout(activeSession.timeout);
                }
                activeSession.timeout = setTimeout(() => {
                    this.log.info('Device appears to be inactive. Stopping stream.', this.cameraName);
                    this.controller.forceStopStreamingSession(request.sessionID);
                    this.stopStream(request.sessionID);
                }, request.video.rtcp_interval * 5 * 1000);
            });
            activeSession.socket.bind(sessionInfo.videoReturnPort);
            activeSession.mainProcess = new ffmpeg_1.FfmpegProcess(this.cameraName, request.sessionID, this.videoProcessor, ffmpegArgs, this.log, this.videoConfig.debug, this, callback);
            if (this.videoConfig.returnAudioTarget) {
                const ffmpegReturnArgs = '-hide_banner' +
                    ' -protocol_whitelist pipe,udp,rtp,file,crypto' +
                    ' -f sdp' +
                    ' -c:a libfdk_aac' +
                    ' -i pipe:' +
                    ' ' + this.videoConfig.returnAudioTarget +
                    ' -loglevel level' + (this.videoConfig.debugReturn ? '+verbose' : '');
                const ipVer = sessionInfo.ipv6 ? 'IP6' : 'IP4';
                const sdpReturnAudio = 'v=0\r\n' +
                    'o=- 0 0 IN ' + ipVer + ' ' + sessionInfo.address + '\r\n' +
                    's=Talk\r\n' +
                    'c=IN ' + ipVer + ' ' + sessionInfo.address + '\r\n' +
                    't=0 0\r\n' +
                    'm=audio ' + sessionInfo.audioReturnPort + ' RTP/AVP 110\r\n' +
                    'b=AS:24\r\n' +
                    'a=rtpmap:110 MPEG4-GENERIC/16000/1\r\n' +
                    'a=rtcp-mux\r\n' +
                    'a=fmtp:110 ' +
                    'profile-level-id=1;mode=AAC-hbr;sizelength=13;indexlength=3;indexdeltalength=3; ' +
                    'config=F8F0212C00BC00\r\n' +
                    'a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:' + sessionInfo.audioSRTP.toString('base64') + '\r\n';
                activeSession.returnProcess = new ffmpeg_1.FfmpegProcess(this.cameraName + '] [Two-way', request.sessionID, this.videoProcessor, ffmpegReturnArgs, this.log, this.videoConfig.debugReturn, this);
                activeSession.returnProcess.getStdin().end(sdpReturnAudio);
            }
            this.ongoingSessions.set(request.sessionID, activeSession);
            this.pendingSessions.delete(request.sessionID);
        }
        else {
            this.log.error('Error finding session information.', this.cameraName);
            callback(new Error('Error finding session information'));
        }
    }
    handleStreamRequest(request, callback) {
        switch (request.type) {
            case "start":
                this.startStream(request, callback);
                break;
            case "reconfigure":
                this.log.debug('Received request to reconfigure: ' + request.video.width + ' x ' + request.video.height + ', ' +
                    request.video.fps + ' fps, ' + request.video.max_bit_rate + ' kbps (Ignored)', this.cameraName, this.videoConfig.debug);
                callback();
                break;
            case "stop":
                this.stopStream(request.sessionID);
                callback();
                break;
        }
    }
    stopStream(sessionId) {
        var _a, _b, _c;
        const session = this.ongoingSessions.get(sessionId);
        if (session) {
            if (session.timeout) {
                clearTimeout(session.timeout);
            }
            try {
                (_a = session.socket) === null || _a === void 0 ? void 0 : _a.close();
            }
            catch (err) {
                this.log.error('Error occurred closing socket: ' + err, this.cameraName);
            }
            try {
                (_b = session.mainProcess) === null || _b === void 0 ? void 0 : _b.stop();
            }
            catch (err) {
                this.log.error('Error occurred terminating main FFmpeg process: ' + err, this.cameraName);
            }
            try {
                (_c = session.returnProcess) === null || _c === void 0 ? void 0 : _c.stop();
            }
            catch (err) {
                this.log.error('Error occurred terminating two-way FFmpeg process: ' + err, this.cameraName);
            }
        }
        this.ongoingSessions.delete(sessionId);
        this.log.info('Stopped video stream.', this.cameraName);
    }
}
exports.StreamingDelegate = StreamingDelegate;
//# sourceMappingURL=streamingDelegate.js.map