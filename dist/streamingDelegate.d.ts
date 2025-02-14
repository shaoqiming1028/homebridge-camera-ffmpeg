/// <reference types="node" />
import { API, CameraController, CameraStreamingDelegate, HAP, PrepareStreamCallback, PrepareStreamRequest, SnapshotRequest, SnapshotRequestCallback, SRTPCryptoSuites, StreamingRequest, StreamRequestCallback } from 'homebridge';
import { Socket } from 'dgram';
import { CameraConfig } from './configTypes';
import { FfmpegProcess } from './ffmpeg';
import { Logger } from './logger';
declare type SessionInfo = {
    address: string;
    ipv6: boolean;
    videoPort: number;
    videoReturnPort: number;
    videoCryptoSuite: SRTPCryptoSuites;
    videoSRTP: Buffer;
    videoSSRC: number;
    audioPort: number;
    audioReturnPort: number;
    audioCryptoSuite: SRTPCryptoSuites;
    audioSRTP: Buffer;
    audioSSRC: number;
};
declare type ActiveSession = {
    mainProcess?: FfmpegProcess;
    returnProcess?: FfmpegProcess;
    timeout?: NodeJS.Timeout;
    socket?: Socket;
};
export declare class StreamingDelegate implements CameraStreamingDelegate {
    private readonly hap;
    private readonly log;
    private readonly cameraName;
    private readonly unbridge;
    private readonly videoConfig;
    private readonly videoProcessor;
    readonly controller: CameraController;
    private snapshotPromise?;
    pendingSessions: Map<string, SessionInfo>;
    ongoingSessions: Map<string, ActiveSession>;
    timeouts: Map<string, NodeJS.Timeout>;
    constructor(log: Logger, cameraConfig: CameraConfig, api: API, hap: HAP, videoProcessor?: string);
    private determineResolution;
    fetchSnapshot(snapFilter?: string): Promise<Buffer>;
    resizeSnapshot(snapshot: Buffer, resizeFilter?: string): Promise<Buffer>;
    handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void>;
    prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void>;
    private startStream;
    handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void;
    stopStream(sessionId: string): void;
}
export {};
//# sourceMappingURL=streamingDelegate.d.ts.map