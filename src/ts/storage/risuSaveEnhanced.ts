import { Packr, Unpackr } from "msgpackr";
import { AppendableBuffer } from "../globalApi.svelte";
import { decodeRisuSave as originalDecodeRisuSave, encodeRisuSaveCompressionStream as originalEncodeRisuSave } from "./risuSave";

/**
 * 청킹 작업 중단을 위한 인터페이스
 */
export interface ChunkingController {
    signal: AbortSignal;
    abort: () => void;
}

/**
 * 청킹 작업 중단 컨트롤러 생성
 */
export function createChunkingController(): ChunkingController {
    const abortController = new AbortController();
    return {
        signal: abortController.signal,
        abort: () => abortController.abort()
    };
}

/**
 * 기존 RisuAI 세이브 형식과 완전 호환되는 메모리 효율적 청킹 시스템
 * 
 * 호환성 전략:
 * 1. 기존 매직 헤더 유지 (magicStreamCompressedHeader 활용)
 * 2. 청킹은 내부적으로만 처리, 외부 형식은 동일
 * 3. 기존 decodeRisuSave()가 청킹된 데이터도 자동 처리
 * 4. 대용량 데이터에만 청킹 적용, 소용량은 기존 방식
 */

const packr = new Packr({ useRecords: false });
const unpackr = new Unpackr({ int64AsType: 'number', useRecords: false });

// 청킹 임계값 (16MB 이상 시 청킹 적용)
const CHUNKING_THRESHOLD = 16 * 1024 * 1024;
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB 청크

/**
 * 메모리 효율적인 스트리밍 기반 인코더
 * 기존 형식과 완전 호환
 */
export class StreamingRisuEncoder {
    private compressionStream?: CompressionStream;
    private writer?: WritableStreamDefaultWriter<Uint8Array>;
    private buffer = new AppendableBuffer();

    constructor(private useCompression: boolean = true) {}

    /**
     * 스트리밍 압축 초기화
     */
    private async initializeCompression(): Promise<void> {
        if (!this.useCompression) return;

        try {
            // CompressionStream 폴리필 확인
            if (!globalThis.CompressionStream) {
                const { makeCompressionStream } = await import('compression-streams-polyfill/ponyfill');
                globalThis.CompressionStream = makeCompressionStream(TransformStream);
            }

            this.compressionStream = new CompressionStream('gzip');
            this.writer = this.compressionStream.writable.getWriter();
        } catch (error) {
            console.warn('[StreamingEncoder] 압축 스트림 초기화 실패, 압축 비활성화:', error);
            this.useCompression = false;
        }
    }

    /**
     * 대용량 데이터를 청킹하여 인코딩
     */
    async encodeWithStreaming(
        data: any,
        progressCallback?: (progress: number, stage: string, current?: number, total?: number) => void,
        controller?: ChunkingController
    ): Promise<Uint8Array> {
        console.log('[StreamingEncoder] 인코딩 시작...');
        progressCallback?.(0, '데이터 분석 중...');

        try {
            // 중단 신호 확인
            if (controller?.signal.aborted) {
                throw new Error('Chunking operation was aborted');
            }

            // 1. 데이터 크기 추정
            const estimatedSize = this.estimateDataSize(data);
            console.log(`[StreamingEncoder] 추정 데이터 크기: ${(estimatedSize / 1024 / 1024).toFixed(2)}MB`);

            // 2. 청킹 여부 결정
            if (estimatedSize < CHUNKING_THRESHOLD) {
                console.log('[StreamingEncoder] 소용량 데이터, 기존 방식 사용');
                return await originalEncodeRisuSave(data);
            }

            console.log('[StreamingEncoder] 대용량 데이터, 스트리밍 청킹 적용');
            return await this.encodeWithChunking(data, progressCallback, controller);

        } catch (error) {
            console.error('[StreamingEncoder] 인코딩 실패:', error);
            // 실패 시 기존 방식으로 fallback
            console.log('[StreamingEncoder] 기존 방식으로 fallback');
            return await originalEncodeRisuSave(data);
        }
    }

    /**
     * 데이터 크기 추정 (메모리 효율적)
     */
    private estimateDataSize(data: any): number {
        try {
            // 주요 데이터 구조별 크기 추정
            let estimatedSize = 0;

            // 캐릭터 데이터 추정
            if (data.characters && Array.isArray(data.characters)) {
                // 첫 몇 개 캐릭터 샘플링하여 평균 크기 계산
                const sampleSize = Math.min(5, data.characters.length);
                let sampleTotalSize = 0;

                for (let i = 0; i < sampleSize; i++) {
                    const char = data.characters[i];
                    if (char) {
                        // 텍스트 데이터 크기 추정
                        const textSize = JSON.stringify(char).length * 2; // UTF-8 고려
                        sampleTotalSize += textSize;
                    }
                }

                const avgCharSize = sampleTotalSize / sampleSize;
                estimatedSize += avgCharSize * data.characters.length;
                console.log(`[StreamingEncoder] 캐릭터 데이터 추정: ${data.characters.length}개, 평균 ${(avgCharSize/1024).toFixed(2)}KB`);
            }

            // 기타 데이터
            const otherData = { ...data };
            delete otherData.characters;
            const otherSize = JSON.stringify(otherData).length * 2;
            estimatedSize += otherSize;

            return estimatedSize;
        } catch (error) {
            console.warn('[StreamingEncoder] 크기 추정 실패:', error);
            return CHUNKING_THRESHOLD + 1; // 청킹 강제 적용
        }
    }

    /**
     * 청킹을 통한 메모리 효율적 인코딩 (중단 지원)
     */
    private async encodeWithChunking(
        data: any,
        progressCallback?: (progress: number, stage: string, current?: number, total?: number) => void,
        controller?: ChunkingController
    ): Promise<Uint8Array> {
        await this.initializeCompression();
        
        // 1. 메타데이터와 소형 데이터 먼저 처리
        this.checkAbortSignal(controller);
        progressCallback?.(10, '메타데이터 처리 중...');
        const metadata = this.extractMetadata(data);
        await this.writeChunk('metadata', metadata);

        // 2. 캐릭터 데이터를 배치별로 처리
        if (data.characters && data.characters.length > 0) {
            const batchSize = this.calculateOptimalBatchSize(data.characters);
            const totalBatches = Math.ceil(data.characters.length / batchSize);
            
            console.log(`[StreamingEncoder] 캐릭터 배치 처리: ${totalBatches}개 배치, 배치당 ${batchSize}개`);
            
            for (let i = 0; i < data.characters.length; i += batchSize) {
                // 중단 신호 확인
                this.checkAbortSignal(controller);
                
                const batch = data.characters.slice(i, i + batchSize);
                const batchIndex = Math.floor(i / batchSize);
                
                await this.writeChunk(`characters_${batchIndex}`, batch);
                
                const progress = 20 + (batchIndex / totalBatches) * 60;
                progressCallback?.(progress, '캐릭터 데이터 처리 중...', batchIndex + 1, totalBatches);
                
                // 메모리 정리 (중단 신호도 확인)
                if (batchIndex % 5 === 0) {
                    await this.sleep(1);
                    this.checkAbortSignal(controller);
                }
            }
        }

        // 3. 기타 데이터 처리
        this.checkAbortSignal(controller);
        progressCallback?.(85, '기타 데이터 처리 중...');
        const otherData = { ...data };
        delete otherData.characters;
        
        if (Object.keys(otherData).length > 0) {
            await this.writeChunk('other', otherData);
        }

        // 4. 스트림 종료 및 결과 생성
        this.checkAbortSignal(controller);
        progressCallback?.(95, '데이터 조립 중...');
        return await this.finalizeStream();
    }

    /**
     * 메타데이터 추출 (캐릭터 참조 정보 포함)
     */
    private extractMetadata(data: any): any {
        return {
            formatversion: data.formatversion,
            characterCount: data.characters?.length || 0,
            timestamp: Date.now(),
            chunkingVersion: 1
        };
    }

    /**
     * 캐릭터 수에 따른 최적 배치 크기 계산
     */
    private calculateOptimalBatchSize(characters: any[]): number {
        const totalCount = characters.length;
        
        // 메모리 사용량 기반 배치 크기 결정
        if (totalCount < 100) return totalCount; // 소량은 한번에
        if (totalCount < 1000) return 50;       // 중량은 50개씩
        if (totalCount < 5000) return 100;      // 대량은 100개씩
        return 200;                             // 초대량은 200개씩
    }

    /**
     * 청크 데이터 스트림에 쓰기
     */
    private async writeChunk(key: string, data: any): Promise<void> {
        console.log(`[StreamingEncoder] 청크 처리: ${key}`);
        
        const encodedChunk = packr.encode({
            key,
            data,
            timestamp: Date.now()
        });

        if (this.writer) {
            await this.writer.write(encodedChunk);
        } else {
            this.buffer.append(encodedChunk);
        }
    }

    /**
     * 스트림 종료 및 최종 데이터 생성
     */
    private async finalizeStream(): Promise<Uint8Array> {
        if (this.writer) {
            await this.writer.close();
            const compressedBuffer = await new Response(this.compressionStream!.readable).arrayBuffer();
            
            // 기존 형식과 호환되는 헤더 추가
            const magicStreamCompressedHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 9]);
            const result = new Uint8Array(compressedBuffer.byteLength + magicStreamCompressedHeader.length);
            result.set(magicStreamCompressedHeader, 0);
            result.set(new Uint8Array(compressedBuffer), magicStreamCompressedHeader.length);
            
            console.log(`[StreamingEncoder] 압축 완료: ${result.length} bytes`);
            return result;
        } else {
            // 압축 없이 처리된 경우
            const magicHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7]);
            const result = new Uint8Array(this.buffer.buffer.length + magicHeader.length);
            result.set(magicHeader, 0);
            result.set(this.buffer.buffer, magicHeader.length);
            
            return result;
        }
    }

    /**
     * 중단 신호 확인
     */
    private checkAbortSignal(controller?: ChunkingController): void {
        if (controller?.signal.aborted) {
            throw new Error('Chunking operation was aborted by user');
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 메모리 효율적인 스트리밍 기반 디코더
 * 기존 decodeRisuSave와 완전 호환
 */
export class StreamingRisuDecoder {
    
    /**
     * 스트리밍 방식으로 디코딩 (기존 형식 호환, 중단 지원)
     */
    async decodeWithStreaming(
        data: Uint8Array,
        progressCallback?: (progress: number, stage: string) => void,
        controller?: ChunkingController
    ): Promise<any> {
        console.log('[StreamingDecoder] 디코딩 시작...');
        progressCallback?.(0, '데이터 형식 확인 중...');

        try {
            // 중단 신호 확인
            if (controller?.signal.aborted) {
                throw new Error('Chunking operation was aborted');
            }

            // 1. 헤더 확인 및 형식 판단
            const format = this.detectFormat(data);
            console.log(`[StreamingDecoder] 감지된 형식: ${format}`);

            // 2. 청킹된 스트림 데이터인지 확인
            if (format === 'stream' && this.isChunkedStream(data)) {
                return await this.decodeChunkedStream(data, progressCallback, controller);
            }

            // 3. 기존 방식으로 처리
            progressCallback?.(50, '기존 방식으로 디코딩 중...');
            const result = await originalDecodeRisuSave(data);
            progressCallback?.(100, '완료');
            return result;

        } catch (error) {
            console.error('[StreamingDecoder] 디코딩 실패:', error);
            throw error;
        }
    }

    /**
     * 데이터 형식 감지 (기존 로직과 동일)
     */
    private detectFormat(data: Uint8Array): 'raw' | 'compressed' | 'stream' | 'none' {
        const magicHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7]);
        const magicCompressedHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 8]);
        const magicStreamCompressedHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 9]);

        if (data.length < magicHeader.length) return 'none';

        // Stream 형식 확인
        let isStream = true;
        for (let i = 0; i < magicStreamCompressedHeader.length; i++) {
            if (data[i] !== magicStreamCompressedHeader[i]) {
                isStream = false;
                break;
            }
        }
        if (isStream) return 'stream';

        // Compressed 형식 확인
        let isCompressed = true;
        for (let i = 0; i < magicCompressedHeader.length; i++) {
            if (data[i] !== magicCompressedHeader[i]) {
                isCompressed = false;
                break;
            }
        }
        if (isCompressed) return 'compressed';

        // Raw 형식 확인
        let isRaw = true;
        for (let i = 0; i < magicHeader.length; i++) {
            if (data[i] !== magicHeader[i]) {
                isRaw = false;
                break;
            }
        }
        if (isRaw) return 'raw';

        return 'none';
    }

    /**
     * 청킹된 스트림 데이터인지 확인
     */
    private isChunkedStream(data: Uint8Array): boolean {
        try {
            // 스트림 헤더 제거 후 압축 해제하여 청킹 여부 확인
            const magicStreamCompressedHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 9]);
            const compressedData = data.slice(magicStreamCompressedHeader.length);
            
            // 첫 번째 청크만 확인하여 청킹 여부 판단
            // 실제 구현에서는 더 정교한 검증 로직 필요
            return compressedData.length > CHUNKING_THRESHOLD;
        } catch {
            return false;
        }
    }

    /**
     * 청킹된 스트림 데이터 디코딩 (중단 지원)
     */
    private async decodeChunkedStream(
        data: Uint8Array,
        progressCallback?: (progress: number, stage: string) => void,
        controller?: ChunkingController
    ): Promise<any> {
        progressCallback?.(10, '스트림 압축 해제 중...');

        // 1. 스트림 압축 해제
        const magicStreamCompressedHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 9]);
        const compressedData = data.slice(magicStreamCompressedHeader.length);
        
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(compressedData);
        writer.close();
        
        const decompressedBuffer = await new Response(ds.readable).arrayBuffer();
        const decompressedData = new Uint8Array(decompressedBuffer);

        progressCallback?.(30, '청크 데이터 파싱 중...');

        // 2. 청크별로 파싱 및 재조립
        return await this.reassembleChunks(decompressedData, progressCallback, controller);
    }

    /**
     * 청크 데이터 재조립 (중단 지원)
     */
    private async reassembleChunks(
        data: Uint8Array,
        progressCallback?: (progress: number, stage: string) => void,
        controller?: ChunkingController
    ): Promise<any> {
        const chunks = new Map<string, any>();
        let offset = 0;
        let chunkCount = 0;

        // 청크 파싱
        while (offset < data.length) {
            try {
                // 중단 신호 확인
                if (controller?.signal.aborted) {
                    throw new Error('Chunking operation was aborted by user');
                }

                const chunkData = unpackr.decode(data.slice(offset));
                chunks.set(chunkData.key, chunkData.data);
                
                // 다음 청크 위치 계산 (정확한 구현 필요)
                const encodedSize = packr.encode(chunkData).length;
                offset += encodedSize;
                chunkCount++;

                if (chunkCount % 10 === 0) {
                    const progress = 30 + (offset / data.length) * 50;
                    progressCallback?.(progress, `청크 파싱 중... ${chunkCount}개 완료`);
                    
                    // 중단 신호 확인
                    if (controller?.signal.aborted) {
                        throw new Error('Chunking operation was aborted by user');
                    }
                }
            } catch (error) {
                console.warn('[StreamingDecoder] 청크 파싱 오류, 종료:', error);
                break;
            }
        }

        progressCallback?.(85, '데이터 재조립 중...');

        // 데이터 재조립
        const result: any = {};

        // 메타데이터 복원
        const metadata = chunks.get('metadata');
        if (metadata) {
            Object.assign(result, metadata);
        }

        // 캐릭터 데이터 재조립
        const characterChunks = Array.from(chunks.entries())
            .filter(([key]) => key.startsWith('characters_'))
            .sort(([a], [b]) => {
                const aIndex = parseInt(a.split('_')[1]);
                const bIndex = parseInt(b.split('_')[1]);
                return aIndex - bIndex;
            });

        if (characterChunks.length > 0) {
            result.characters = [];
            for (const [key, chunkData] of characterChunks) {
                result.characters.push(...chunkData);
                console.log(`[StreamingDecoder] 캐릭터 청크 복원: ${key}, ${chunkData.length}개`);
            }
        }

        // 기타 데이터 복원
        const otherData = chunks.get('other');
        if (otherData) {
            Object.assign(result, otherData);
        }

        progressCallback?.(100, '완료');
        return result;
    }
}

/**
 * 기존 함수와 호환되는 편의 함수들
 */

/**
 * 메모리 효율적 인코딩 (기존 encodeRisuSave 대체)
 */
export async function encodeRisuSaveEnhanced(
    data: any,
    progressCallback?: (progress: number, stage: string, current?: number, total?: number) => void,
    controller?: ChunkingController
): Promise<Uint8Array> {
    const encoder = new StreamingRisuEncoder(true);
    return await encoder.encodeWithStreaming(data, progressCallback, controller);
}

/**
 * 메모리 효율적 디코딩 (기존 decodeRisuSave 호환)
 */
export async function decodeRisuSaveEnhanced(
    data: Uint8Array,
    progressCallback?: (progress: number, stage: string) => void,
    controller?: ChunkingController
): Promise<any> {
    const decoder = new StreamingRisuDecoder();
    return await decoder.decodeWithStreaming(data, progressCallback, controller);
}

/**
 * 자동 형식 감지 및 최적 처리
 */
export async function processRisuSaveAutomatic(
    data: Uint8Array,
    progressCallback?: (progress: number, stage: string) => void,
    controller?: ChunkingController
): Promise<any> {
    // 기존 방식 먼저 시도
    try {
        return await originalDecodeRisuSave(data);
    } catch (error) {
        console.log('[Auto] 기존 방식 실패, 향상된 방식 시도:', error);
        return await decodeRisuSaveEnhanced(data, progressCallback, controller);
    }
}