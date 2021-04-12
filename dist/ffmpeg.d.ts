/// <reference types="node" />
import { StreamRequestCallback } from 'homebridge';
import { Writable } from 'stream';
import { Logger } from './logger';
import { StreamingDelegate } from './streamingDelegate';
declare type FfmpegProgress = {
    frame: number;
    fps: number;
    stream_q: number;
    bitrate: number;
    total_size: number;
    out_time_us: number;
    out_time: string;
    dup_frames: number;
    drop_frames: number;
    speed: number;
    progress: string;
};
export declare class FfmpegProcess {
    private readonly process;
    constructor(cameraName: string, sessionId: string, videoProcessor: string, ffmpegArgs: string, log: Logger, debug: boolean | undefined, delegate: StreamingDelegate, callback?: StreamRequestCallback);
    parseProgress(data: Uint8Array): FfmpegProgress | undefined;
    stop(): void;
    getStdin(): Writable;
}
export {};
//# sourceMappingURL=ffmpeg.d.ts.map