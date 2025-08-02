import { BaseDirectory, readFile, readDir, writeFile, open } from "@tauri-apps/plugin-fs";
import type { OpenOptions } from "@tauri-apps/plugin-fs";
import { alertError, alertNormal, alertStore, alertWait } from "../alert";
import { LocalWriter, forageStorage, isTauri } from "../globalApi.svelte";
import { decodeRisuSave, encodeRisuSaveLegacy } from "../storage/risuSave";
import { encodeRisuSaveEnhanced, decodeRisuSaveEnhanced, createChunkingController } from "../storage/risuSaveEnhanced";
import { getDatabase, setDatabaseLite } from "../storage/database.svelte";
import { relaunch } from "@tauri-apps/plugin-process";
import { sleep } from "../util";
import { hubURL } from "../characterCards";

function getBasename(data:string){
    const baseNameRegex = /\\/g
    const splited = data.replace(baseNameRegex, '/').split('/')
    const lasts = splited[splited.length-1]
    return lasts
}

/**
 * Tauri 환경에서 파일을 스트리밍으로 읽는 함수
 */
async function createTauriFileStream(filePath: string, chunkSize: number = 32 * 1024 * 1024): Promise<ReadableStream<Uint8Array>> {
    const file = await open(filePath, { read: true, baseDir: BaseDirectory.AppData } as OpenOptions);
    
    return new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                let position = 0;
                const buffer = new Uint8Array(chunkSize);
                
                while (true) {
                    const bytesRead = await file.read(buffer);
                    if (bytesRead === null || bytesRead === 0) {
                        break;
                    }
                    
                    const chunk = buffer.slice(0, bytesRead);
                    controller.enqueue(chunk);
                    position += bytesRead;
                }
                
                controller.close();
            } catch (error) {
                controller.error(error);
            } finally {
                await file.close();
            }
        }
    });
}

/**
 * 웹 환경에서 ForageStorage로부터 스트리밍으로 데이터를 읽는 함수
 * (실제로는 한 번에 로드하지만 스트리밍 인터페이스로 래핑)
 */
async function createForageStreamingWrapper(key: string, chunkSize: number = 32 * 1024 * 1024): Promise<ReadableStream<Uint8Array>> {
    const data = await forageStorage.getItem(key) as unknown as Uint8Array;
    
    return new ReadableStream<Uint8Array>({
        start(controller) {
            try {
                // 큰 데이터를 청크 단위로 나누어 전송
                let offset = 0;
                
                const sendNextChunk = () => {
                    if (offset >= data.length) {
                        controller.close();
                        return;
                    }
                    
                    const end = Math.min(offset + chunkSize, data.length);
                    const chunk = data.slice(offset, end);
                    controller.enqueue(chunk);
                    offset = end;
                    
                    // 다음 청크를 비동기적으로 전송 (메모리 압박 완화)
                    setTimeout(sendNextChunk, 0);
                };
                
                sendNextChunk();
            } catch (error) {
                controller.error(error);
            }
        }
    });
}

/**
 * 파일 크기를 얻는 헬퍼 함수 (권한 문제 해결)
 */
async function getFileSize(key: string): Promise<number> {
    if (isTauri) {
        try {
            // 직접 파일을 읽어서 크기 확인 (stat() 권한 문제 회피)
            const data = await readFile(`assets/${key}`, { baseDir: BaseDirectory.AppData });
            return data.length;
        } catch (error) {
            console.warn(`[getFileSize] Could not get size for ${key}:`, error);
            return 0;
        }
    } else {
        try {
            const data = await forageStorage.getItem(`assets/${key}`) as unknown as Uint8Array;
            return data ? data.length : 0;
        } catch (error) {
            console.warn(`[getFileSize] Could not get size for ${key}:`, error);
            return 0;
        }
    }
}

let backupController: ReturnType<typeof createChunkingController> | null = null;

export async function SaveLocalBackup(){
    alertWait("Saving local backup...")
    const writer = new LocalWriter()
    const r = await writer.init()
    if(!r){
        alertError('Failed')
        return
    }

    // 백업 중단 컨트롤러 생성
    backupController = createChunkingController();

    //check backup data is corrupted (skip for large data due to server limitations)
    try {
        const database = getDatabase();
        const jsonData = JSON.stringify(database);
        const dataSizeMB = (new Blob([jsonData]).size / 1024 / 1024);
        console.log(`[SaveLocalBackup] Database size: ${dataSizeMB.toFixed(2)} MB`);
        
        // Skip backup check if data is large (>50MB) to avoid 413 Content Too Large and CORS issues
        if (dataSizeMB > 50) {
            console.log(`[SaveLocalBackup] Skipping backup check - data too large (${dataSizeMB.toFixed(2)}MB)`);
            alertWait(`Saving local backup... (Skipping validation for large data: ${dataSizeMB.toFixed(2)}MB)`);
            await sleep(1000);
        } else {
            console.log(`[SaveLocalBackup] Starting backup check request to: ${hubURL}/backupcheck`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            try {
                const startTime = Date.now();
                const corrupted = await fetch(hubURL + '/backupcheck', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: jsonData,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                const requestTime = Date.now() - startTime;
                console.log(`[SaveLocalBackup] Backup check request completed in ${requestTime}ms, status: ${corrupted.status}`);
                
                if(corrupted.status === 400){
                    alertError('Failed, Backup data is corrupted')
                    return
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                throw fetchError;
            }
        }
    } catch (error) {
        console.error('[SaveLocalBackup] Backup check request failed:', error);
        console.error('[SaveLocalBackup] Error type:', error.constructor.name);
        console.error('[SaveLocalBackup] Error message:', error.message);
        
        // Handle specific error types but continue with backup for recoverable errors
        if (error.name === 'AbortError') {
            console.warn('[SaveLocalBackup] Backup check timed out, continuing with backup...');
            alertWait('Backup validation timed out, continuing backup...');
            await sleep(1500);
        } else if (error.message && (error.message.includes('413') || error.message.includes('Content Too Large'))) {
            console.warn('[SaveLocalBackup] Data too large for server validation, continuing with backup...');
            alertWait('Data too large for validation, continuing backup...');
            await sleep(1500);
        } else if (error.message && error.message.includes('CORS')) {
            console.warn('[SaveLocalBackup] CORS error during backup check, continuing with backup...');
            alertWait('Cross-origin validation blocked, continuing backup...');
            await sleep(1500);
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            console.warn('[SaveLocalBackup] Network error during backup check, continuing with backup...');
            alertWait('Network error during validation, continuing backup...');
            await sleep(1500);
        } else {
            // For any other errors, log but continue with backup (server might be down)
            console.warn(`[SaveLocalBackup] Unknown error during backup check, continuing with backup: ${error.message}`);
            alertWait('Backup validation failed, but continuing backup...');
            await sleep(1500);
        }
    }

    console.log('[SaveLocalBackup] Starting streaming asset backup process...');
    const memoryBefore = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0;
    console.log(`[SaveLocalBackup] Memory before asset processing: ${memoryBefore.toFixed(2)}MB`);

    const STREAM_THRESHOLD_MB = 50; // 50MB 이상 파일은 스트리밍 처리
    const CHUNK_SIZE = 32 * 1024 * 1024; // 32MB 청크 크기

    if(isTauri){
        const assets = await readDir('assets', {baseDir: BaseDirectory.AppData})
        console.log(`[SaveLocalBackup] Found ${assets.length} assets to backup`);
        let i = 0;
        let totalAssetSize = 0;
        
        for(let asset of assets){
            i += 1;
            alertWait(`Saving local Backup... (${i} / ${assets.length})`)
            const key = asset.name
            if(!key || !key.endsWith('.png')){
                continue
            }
            
            // 파일 크기 확인
            const assetSize = await getFileSize(key);
            const assetSizeMB = assetSize / 1024 / 1024;
            totalAssetSize += assetSizeMB;
            
            const memoryDuring = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0;
            console.log(`[SaveLocalBackup] Processing asset ${i}/${assets.length}: ${key} (${assetSizeMB.toFixed(2)}MB), Memory: ${memoryDuring.toFixed(2)}MB`);
            
            // 🔧 해결책: 파일 크기에 따라 처리 방식 선택
            if (assetSizeMB > STREAM_THRESHOLD_MB) {
                console.log(`[SaveLocalBackup] Using streaming for large asset: ${key} (${assetSizeMB.toFixed(2)}MB)`);
                
                // 스트리밍 방식으로 처리
                await writer.writeBackupStream(
                    key,
                    () => createTauriFileStream(`assets/${key}`, CHUNK_SIZE),
                    assetSize,
                    (progress) => {
                        alertWait(`Saving local Backup... (${i} / ${assets.length}) - ${key}: ${progress.toFixed(1)}%`);
                    }
                );
            } else {
                // 작은 파일은 기존 방식 사용 (메모리 효율성 vs 처리 속도)
                console.log(`[SaveLocalBackup] Using traditional method for small asset: ${key} (${assetSizeMB.toFixed(2)}MB)`);
                const assetData = await readFile('assets/' + asset.name, {baseDir: BaseDirectory.AppData});
                await writer.writeBackup(key, assetData);
            }
            
            // 메모리 정리 시도 (더 자주)
            if (i % 5 === 0 && globalThis.gc) {
                globalThis.gc();
                const memoryAfterGC = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0;
                console.log(`[SaveLocalBackup] Memory after GC (every 5 assets): ${memoryAfterGC.toFixed(2)}MB`);
            }
        }
        console.log(`[SaveLocalBackup] Total asset data processed: ${totalAssetSize.toFixed(2)}MB`);
    }
    else{
        const keys = await forageStorage.keys()
        console.log(`[SaveLocalBackup] Found ${keys.length} keys to process`);
        let totalAssetSize = 0;

        for(let i=0;i<keys.length;i++){
            alertWait(`Saving local Backup... (${i} / ${keys.length})`)

            const key = keys[i]
            if(!key || !key.endsWith('.png')){
                continue
            }
            
            // 파일 크기 확인
            const assetSize = await getFileSize(key.replace('assets/', ''));
            const assetSizeMB = assetSize / 1024 / 1024;
            totalAssetSize += assetSizeMB;
            
            const memoryDuring = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0;
            console.log(`[SaveLocalBackup] Processing key ${i}/${keys.length}: ${key} (${assetSizeMB.toFixed(2)}MB), Memory: ${memoryDuring.toFixed(2)}MB`);
            
            // 🔧 해결책: 파일 크기에 따라 처리 방식 선택
            if (assetSizeMB > STREAM_THRESHOLD_MB) {
                console.log(`[SaveLocalBackup] Using streaming wrapper for large asset: ${key} (${assetSizeMB.toFixed(2)}MB)`);
                
                // 웹 환경에서는 스트리밍 래퍼 사용
                await writer.writeBackupStream(
                    key,
                    () => createForageStreamingWrapper(key, CHUNK_SIZE),
                    assetSize,
                    (progress) => {
                        alertWait(`Saving local Backup... (${i} / ${keys.length}) - ${key}: ${progress.toFixed(1)}%`);
                    }
                );
            } else {
                // 작은 파일은 기존 방식 사용
                console.log(`[SaveLocalBackup] Using traditional method for small asset: ${key} (${assetSizeMB.toFixed(2)}MB)`);
                const assetData = await forageStorage.getItem(key) as unknown as Uint8Array;
                await writer.writeBackup(key, assetData);
            }
            
            if(forageStorage.isAccount){
                await sleep(1000)
            }
            
            // 메모리 정리 시도 (더 자주)
            if (i % 5 === 0 && globalThis.gc) {
                globalThis.gc();
                const memoryAfterGC = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0;
                console.log(`[SaveLocalBackup] Memory after GC (every 5 assets): ${memoryAfterGC.toFixed(2)}MB`);
            }
        }
        console.log(`[SaveLocalBackup] Total asset data processed: ${totalAssetSize.toFixed(2)}MB`);
    }

    const memoryAfter = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0;
    console.log(`[SaveLocalBackup] Memory after streaming asset processing: ${memoryAfter.toFixed(2)}MB (diff: +${(memoryAfter - memoryBefore).toFixed(2)}MB)`);

    // 메모리 효율적인 데이터베이스 인코딩
    const database = getDatabase();
    console.log('[SaveLocalBackup] Starting database encoding with chunking...');
    
    let dbData: Uint8Array;
    try {
        // Enhanced encoding with progress callback and abort support
        dbData = await encodeRisuSaveEnhanced(database, (progress, stage, current, total) => {
            if (current && total) {
                alertWait(`Saving local Backup... (Database: ${stage} ${current}/${total}) [Click to cancel]`);
            } else {
                alertWait(`Saving local Backup... (Database: ${stage} ${progress.toFixed(1)}%) [Click to cancel]`);
            }
        }, backupController);
        console.log(`[SaveLocalBackup] Enhanced encoding completed: ${(dbData.length / 1024 / 1024).toFixed(2)}MB`);
    } catch (error) {
        if (error.message?.includes('aborted')) {
            console.log('[SaveLocalBackup] Backup was cancelled by user');
            alertError('Backup cancelled by user');
            backupController = null;
            await writer.close();
            return;
        }
        console.warn('[SaveLocalBackup] Enhanced encoding failed, using legacy method:', error);
        alertWait(`Saving local Backup... (Saving database - fallback mode)`);
        dbData = encodeRisuSaveLegacy(database, 'compression');
        console.log(`[SaveLocalBackup] Legacy encoding completed: ${(dbData.length / 1024 / 1024).toFixed(2)}MB`);
    }

    alertWait(`Saving local Backup... (Writing database file)`);
    await writer.writeBackup('database.risudat', dbData);

    alertNormal('Success')
    backupController = null;
    await writer.close()
}

/**
 * 백업 작업 중단
 */
export function cancelBackup() {
    if (backupController) {
        console.log('[SaveLocalBackup] Cancelling backup operation...');
        backupController.abort();
    }
}

let restoreController: ReturnType<typeof createChunkingController> | null = null;

export async function LoadLocalBackup(){
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.bin';
        input.onchange = async () => {
            if (!input.files || input.files.length === 0) {
                input.remove();
                return;
            }
            const file = input.files[0];
            input.remove();

            // 복원 중단 컨트롤러 생성
            restoreController = createChunkingController();

            const reader = file.stream().getReader();
            const CHUNK_SIZE = 1024 * 1024; // 1MB chunk size
            let bytesRead = 0;
            let remainingBuffer = new Uint8Array();

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                bytesRead += value.length;
                const progress = ((bytesRead / file.size) * 100).toFixed(2);
                alertWait(`Loading local Backup... (${progress}%)`);

                const newBuffer = new Uint8Array(remainingBuffer.length + value.length);
                newBuffer.set(remainingBuffer);
                newBuffer.set(value, remainingBuffer.length);
                remainingBuffer = newBuffer;

                let offset = 0;
                while (offset + 4 <= remainingBuffer.length) {
                    const nameLength = new Uint32Array(remainingBuffer.slice(offset, offset + 4).buffer)[0];

                    if (offset + 4 + nameLength > remainingBuffer.length) {
                        break;
                    }
                    const nameBuffer = remainingBuffer.slice(offset + 4, offset + 4 + nameLength);
                    const name = new TextDecoder().decode(nameBuffer);

                    if (offset + 4 + nameLength + 4 > remainingBuffer.length) {
                        break;
                    }
                    const dataLength = new Uint32Array(remainingBuffer.slice(offset + 4 + nameLength, offset + 4 + nameLength + 4).buffer)[0];

                    if (offset + 4 + nameLength + 4 + dataLength > remainingBuffer.length) {
                        break;
                    }
                    const data = remainingBuffer.slice(offset + 4 + nameLength + 4, offset + 4 + nameLength + 4 + dataLength);

                    if (name === 'database.risudat') {
                        const db = new Uint8Array(data);
                        console.log(`[LoadLocalBackup] Decoding database: ${(db.length / 1024 / 1024).toFixed(2)}MB`);
                        
                        let dbData: any;
                        try {
                            // Enhanced decoding with progress callback and abort support
                            dbData = await decodeRisuSaveEnhanced(db, (progress, stage) => {
                                alertWait(`Loading local Backup... (Database: ${stage} ${progress.toFixed(1)}%) [Click to cancel]`);
                            }, restoreController);
                            console.log('[LoadLocalBackup] Enhanced decoding completed');
                        } catch (error) {
                            if (error.message?.includes('aborted')) {
                                console.log('[LoadLocalBackup] Restore was cancelled by user');
                                alertError('Restore cancelled by user');
                                restoreController = null;
                                return;
                            }
                            console.warn('[LoadLocalBackup] Enhanced decoding failed, using legacy method:', error);
                            alertWait(`Loading local Backup... (Database decoding - fallback mode)`);
                            dbData = await decodeRisuSave(db);
                            console.log('[LoadLocalBackup] Legacy decoding completed');
                        }
                        
                        setDatabaseLite(dbData);
                        if (isTauri) {
                            await writeFile('database/database.bin', db, { baseDir: BaseDirectory.AppData });
                            await relaunch();
                            alertStore.set({
                                type: "wait",
                                msg: "Success, Refreshing your app."
                            });
                        } else {
                            await forageStorage.setItem('database/database.bin', db);
                            location.search = '';
                            alertStore.set({
                                type: "wait",
                                msg: "Success, Refreshing your app."
                            });
                        }
                    } else {
                        // 🔧 해결책: Asset 파일도 스트리밍 처리 (대용량 파일의 경우)
                        const assetSizeMB = data.length / 1024 / 1024;
                        const RESTORE_STREAM_THRESHOLD_MB = 50;
                        
                        console.log(`[LoadLocalBackup] Restoring asset ${name}: ${assetSizeMB.toFixed(2)}MB`);
                        const memoryBefore = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0;
                        
                        if (assetSizeMB > RESTORE_STREAM_THRESHOLD_MB) {
                            console.log(`[LoadLocalBackup] Using streaming for large asset restore: ${name} (${assetSizeMB.toFixed(2)}MB)`);
                            
                            // 큰 파일은 청크 단위로 저장
                            if (isTauri) {
                                const file = await open(`assets/${name}`, {
                                    write: true,
                                    create: true,
                                    truncate: true,
                                    baseDir: BaseDirectory.AppData
                                } as OpenOptions);
                                
                                try {
                                    const chunkSize = 32 * 1024 * 1024; // 32MB chunks
                                    let chunkOffset = 0;
                                    let chunkCount = 0;
                                    
                                    while (chunkOffset < data.length) {
                                        const end = Math.min(chunkOffset + chunkSize, data.length);
                                        const chunk = data.slice(chunkOffset, end);
                                        await file.write(chunk);
                                        chunkOffset = end;
                                        chunkCount++;
                                        
                                        // Progress update for large files
                                        if (chunkCount % 10 === 0) {
                                            const progress = (chunkOffset / data.length) * 100;
                                            alertWait(`Loading local Backup... (Restoring ${name}: ${progress.toFixed(1)}%)`);
                                        }
                                        
                                        // Allow other operations to run
                                        await sleep(1);
                                    }
                                    console.log(`[LoadLocalBackup] Streamed ${chunkCount} chunks for ${name}`);
                                } finally {
                                    await file.close();
                                }
                            } else {
                                // 웹 환경에서는 여전히 전체 저장 (forageStorage 제한)
                                // 하지만 청크 단위로 처리하여 UI 블로킹 방지
                                const chunkSize = 32 * 1024 * 1024;
                                const chunks: Uint8Array[] = [];
                                let chunkOffset = 0;
                                
                                while (chunkOffset < data.length) {
                                    const end = Math.min(chunkOffset + chunkSize, data.length);
                                    chunks.push(data.slice(chunkOffset, end));
                                    chunkOffset = end;
                                    await sleep(1); // UI 블로킹 방지
                                }
                                
                                // 최종적으로 전체 데이터 저장
                                await forageStorage.setItem('assets/' + name, data);
                                console.log(`[LoadLocalBackup] Processed ${chunks.length} chunks for web storage: ${name}`);
                            }
                        } else {
                            // 작은 파일은 기존 방식 사용
                            console.log(`[LoadLocalBackup] Using traditional method for small asset: ${name} (${assetSizeMB.toFixed(2)}MB)`);
                            if (isTauri) {
                                await writeFile(`assets/` + name, data, { baseDir: BaseDirectory.AppData });
                            } else {
                                await forageStorage.setItem('assets/' + name, data);
                            }
                        }
                        
                        const memoryAfter = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0;
                        console.log(`[LoadLocalBackup] Asset ${name} restored, Memory: ${memoryAfter.toFixed(2)}MB (diff: +${(memoryAfter - memoryBefore).toFixed(2)}MB)`);
                    }
                    await sleep(10);
                    if (forageStorage.isAccount) {
                        await sleep(1000);
                    }

                    offset += 4 + nameLength + 4 + dataLength;
                    
                    // 메모리 정리 시도 (큰 파일 처리 후)
                    if (dataLength > 50 * 1024 * 1024 && globalThis.gc) { // 50MB 이상 파일 후
                        globalThis.gc();
                        const memoryAfterGC = (performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0;
                        console.log(`[LoadLocalBackup] Memory after GC (large file processed): ${memoryAfterGC.toFixed(2)}MB`);
                    }
                }
                remainingBuffer = remainingBuffer.slice(offset);
            }

            alertNormal('Success');
            restoreController = null;
        };

        input.click();
    } catch (error) {
        console.error(error);
        alertError('Failed, Is file corrupted?')
        restoreController = null;
    }
}

/**
 * 복원 작업 중단
 */
export function cancelRestore() {
    if (restoreController) {
        console.log('[LoadLocalBackup] Cancelling restore operation...');
        restoreController.abort();
    }
}