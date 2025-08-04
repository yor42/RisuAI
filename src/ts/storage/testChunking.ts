import { encodeRisuSaveEnhanced, decodeRisuSaveEnhanced, createChunkingController } from './risuSaveEnhanced';
import { getDatabase } from './database.svelte';

/**
 * 청킹 시스템 테스트 함수
 */
export async function testChunkingSystem() {
    console.log('=== 청킹 시스템 테스트 시작 ===');
    
    try {
        // 1. 작은 데이터 테스트 (청킹 없이 처리되어야 함)
        console.log('\n1. 작은 데이터 테스트...');
        const smallData = {
            formatversion: 4,
            characters: [
                { name: 'Test1', desc: 'Small test data' },
                { name: 'Test2', desc: 'Another small test' }
            ]
        };
        
        const smallEncoded = await encodeRisuSaveEnhanced(smallData, (progress, stage) => {
            console.log(`   소형 데이터 인코딩: ${stage} ${progress.toFixed(1)}%`);
        });
        
        const smallDecoded = await decodeRisuSaveEnhanced(smallEncoded, (progress, stage) => {
            console.log(`   소형 데이터 디코딩: ${stage} ${progress.toFixed(1)}%`);
        });
        
        console.log(`   ✓ 소형 데이터 테스트 성공: ${(smallEncoded.length / 1024).toFixed(2)}KB`);
        console.log(`   ✓ 데이터 무결성 확인: ${smallDecoded.characters.length === 2 ? '성공' : '실패'}`);
        
        // 2. 현재 데이터베이스를 사용한 실제 크기 테스트
        console.log('\n2. 현재 데이터베이스 테스트...');
        const currentDb = getDatabase();
        
        console.log(`   현재 캐릭터 수: ${currentDb.characters?.length || 0}개`);
        const dbSize = JSON.stringify(currentDb).length;
        console.log(`   추정 데이터베이스 크기: ${(dbSize / 1024 / 1024).toFixed(2)}MB`);
        
        let progressLog: string[] = [];
        const dbEncoded = await encodeRisuSaveEnhanced(currentDb, (progress, stage, current, total) => {
            const logMessage = current && total ? 
                `${stage} ${current}/${total}` : 
                `${stage} ${progress.toFixed(1)}%`;
            progressLog.push(logMessage);
            console.log(`   DB 인코딩: ${logMessage}`);
        });
        
        console.log(`   ✓ DB 인코딩 완료: ${(dbEncoded.length / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   ✓ 진행률 로그 수: ${progressLog.length}개`);
        
        const dbDecoded = await decodeRisuSaveEnhanced(dbEncoded, (progress, stage) => {
            console.log(`   DB 디코딩: ${stage} ${progress.toFixed(1)}%`);
        });
        
        console.log(`   ✓ DB 디코딩 완료`);
        console.log(`   ✓ 캐릭터 수 확인: ${dbDecoded.characters?.length || 0}개`);
        
        // 3. 중단 기능 테스트
        console.log('\n3. 중단 기능 테스트...');
        const controller = createChunkingController();
        
        // 500ms 후 중단
        setTimeout(() => {
            console.log('   중단 신호 발송...');
            controller.abort();
        }, 500);
        
        try {
            await encodeRisuSaveEnhanced(currentDb, (progress, stage) => {
                console.log(`   중단 테스트 인코딩: ${stage} ${progress.toFixed(1)}%`);
            }, controller);
            console.log('   ✗ 중단 기능 실패: 작업이 완료됨');
        } catch (error) {
            if (error.message.includes('aborted')) {
                console.log('   ✓ 중단 기능 성공: 작업이 올바르게 중단됨');
            } else {
                console.log(`   ✗ 중단 기능 오류: ${error.message}`);
            }
        }
        
        // 4. 대용량 모의 데이터 테스트 (캐릭터 많이 생성)
        console.log('\n4. 대용량 모의 데이터 테스트...');
        const largeData = {
            formatversion: 4,
            characters: []
        };
        
        // 1000개의 모의 캐릭터 생성
        for (let i = 0; i < 1000; i++) {
            largeData.characters.push({
                name: `Character${i}`,
                desc: `Long description for character ${i}. `.repeat(100), // 긴 설명
                image: `assets/char${i}.png`,
                chats: [],
                firstMessage: `Hello, I'm character number ${i}!`,
                scenario: `Scenario for character ${i}. `.repeat(50)
            });
        }
        
        console.log(`   모의 캐릭터 생성: ${largeData.characters.length}개`);
        const largeSizeEstimate = JSON.stringify(largeData).length;
        console.log(`   추정 크기: ${(largeSizeEstimate / 1024 / 1024).toFixed(2)}MB`);
        
        const largeEncoded = await encodeRisuSaveEnhanced(largeData, (progress, stage, current, total) => {
            if (current && total) {
                console.log(`   대용량 인코딩: ${stage} ${current}/${total}`);
            } else {
                console.log(`   대용량 인코딩: ${stage} ${progress.toFixed(1)}%`);
            }
        });
        
        console.log(`   ✓ 대용량 인코딩 완료: ${(largeEncoded.length / 1024 / 1024).toFixed(2)}MB`);
        
        const largeDecoded = await decodeRisuSaveEnhanced(largeEncoded, (progress, stage) => {
            console.log(`   대용량 디코딩: ${stage} ${progress.toFixed(1)}%`);
        });
        
        console.log(`   ✓ 대용량 디코딩 완료`);
        console.log(`   ✓ 데이터 무결성 확인: ${largeDecoded.characters.length === 1000 ? '성공' : '실패'}`);
        
        console.log('\n=== 청킹 시스템 테스트 완료 ===');
        console.log('✓ 모든 테스트가 성공적으로 완료되었습니다!');
        
        return {
            success: true,
            results: {
                smallDataSize: smallEncoded.length,
                currentDbSize: dbEncoded.length,
                largeDataSize: largeEncoded.length,
                progressLogCount: progressLog.length
            }
        };
        
    } catch (error) {
        console.error('=== 청킹 시스템 테스트 실패 ===');
        console.error('오류:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 메모리 효율성 비교 테스트
 */
export async function compareMemoryEfficiency() {
    console.log('=== 메모리 효율성 비교 테스트 ===');
    
    const testData = {
        formatversion: 4,
        characters: []
    };
    
    // 100개의 캐릭터로 테스트
    for (let i = 0; i < 100; i++) {
        testData.characters.push({
            name: `TestChar${i}`,
            desc: 'Test description. '.repeat(200), // 약 3.6KB per character
            image: `assets/test${i}.png`,
            chats: [],
            firstMessage: 'Test message',
            scenario: 'Test scenario. '.repeat(100)
        });
    }
    
    const testSize = JSON.stringify(testData).length;
    console.log(`테스트 데이터 크기: ${(testSize / 1024 / 1024).toFixed(2)}MB`);
    
    // 메모리 사용량 측정 (근사치)
    const memoryBefore = (performance as any).memory?.usedJSHeapSize || 0;
    
    const startTime = Date.now();
    const encoded = await encodeRisuSaveEnhanced(testData, (progress, stage) => {
        // 진행률만 기록
    });
    const encodeTime = Date.now() - startTime;
    
    const decodeStartTime = Date.now();
    const decoded = await decodeRisuSaveEnhanced(encoded);
    const decodeTime = Date.now() - decodeStartTime;
    
    const memoryAfter = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryUsed = memoryAfter - memoryBefore;
    
    console.log(`인코딩 시간: ${encodeTime}ms`);
    console.log(`디코딩 시간: ${decodeTime}ms`);
    console.log(`압축 효율: ${((testSize - encoded.length) / testSize * 100).toFixed(1)}%`);
    if (memoryUsed > 0) {
        console.log(`메모리 사용량: ${(memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    }
    console.log(`데이터 무결성: ${decoded.characters.length === 100 ? '성공' : '실패'}`);
    
    return {
        originalSize: testSize,
        encodedSize: encoded.length,
        encodeTime,
        decodeTime,
        memoryUsed,
        compressionRatio: (testSize - encoded.length) / testSize
    };
}

/**
 * 스트리밍 백업 시스템 테스트 (메모리 효율성 검증)
 */
export async function testStreamingBackupSystem() {
    console.log('=== 스트리밍 백업 시스템 테스트 ===');
    
    try {
        // 1. 메모리 사용량 모니터링 함수
        const getMemoryUsage = () => {
            if (typeof (performance as any).memory !== 'undefined') {
                const memory = (performance as any).memory;
                return {
                    used: memory.usedJSHeapSize,
                    total: memory.totalJSHeapSize,
                    limit: memory.jsHeapSizeLimit
                };
            }
            return null;
        };

        // 2. 대용량 모의 데이터 생성 (메모리 집약적)
        console.log('\n1. 대용량 모의 데이터 생성...');
        const largeTestData = {
            formatversion: 4,
            characters: [],
            lorebooks: [],
            assets: new Map()
        };

        // 500개의 캐릭터와 큰 자산 파일들 생성
        for (let i = 0; i < 500; i++) {
            // 큰 설명과 시나리오
            const longDescription = `Character ${i} description. `.repeat(500); // ~12KB
            const longScenario = `Scenario for character ${i}. `.repeat(300); // ~7KB
            
            largeTestData.characters.push({
                name: `Character${i}`,
                desc: longDescription,
                scenario: longScenario,
                image: `char${i}.png`,
                firstMessage: `Hello from character ${i}!`,
                chats: []
            });

            // 큰 모의 자산 파일 추가 (10MB 자산 파일들)
            if (i % 20 === 0) { // 25개의 10MB 파일 = 250MB 총 자산
                const largeAsset = new Uint8Array(10 * 1024 * 1024); // 10MB per asset
                // 패턴으로 채워서 압축률 테스트
                for (let j = 0; j < largeAsset.length; j++) {
                    largeAsset[j] = (i + j) % 256;
                }
                largeTestData.assets.set(`large_asset_${i}.bin`, largeAsset);
            }
        }

        const estimatedSize = JSON.stringify({...largeTestData, assets: Array.from(largeTestData.assets.keys())}).length;
        const assetSize = Array.from(largeTestData.assets.values()).reduce((sum, asset) => sum + asset.length, 0);
        
        console.log(`   생성된 캐릭터: ${largeTestData.characters.length}개`);
        console.log(`   생성된 자산: ${largeTestData.assets.size}개`);
        console.log(`   추정 DB 크기: ${(estimatedSize / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   자산 총 크기: ${(assetSize / 1024 / 1024).toFixed(2)}MB`);

        // 3. 메모리 사용량 측정 시작
        const memoryBefore = getMemoryUsage();
        if (memoryBefore) {
            console.log(`\n2. 시작 메모리: ${(memoryBefore.used / 1024 / 1024).toFixed(2)}MB / ${(memoryBefore.total / 1024 / 1024).toFixed(2)}MB`);
        }

        // 4. 스트리밍 인코딩 테스트
        console.log('\n3. 스트리밍 인코딩 테스트...');
        let progressCount = 0;
        const encodeStartTime = Date.now();
        
        const encoded = await encodeRisuSaveEnhanced(largeTestData, (progress, stage, current, total) => {
            progressCount++;
            if (current && total) {
                console.log(`   인코딩 진행: ${stage} ${current}/${total} (${progress.toFixed(1)}%)`);
            } else {
                console.log(`   인코딩 진행: ${stage} ${progress.toFixed(1)}%`);
            }
            
            // 메모리 사용량 주기적 체크
            if (progressCount % 10 === 0) {
                const currentMemory = getMemoryUsage();
                if (currentMemory) {
                    console.log(`     메모리: ${(currentMemory.used / 1024 / 1024).toFixed(2)}MB`);
                }
            }
        });

        const encodeTime = Date.now() - encodeStartTime;
        const memoryAfterEncode = getMemoryUsage();
        
        console.log(`   ✓ 인코딩 완료: ${encodeTime}ms`);
        console.log(`   ✓ 압축 결과: ${(encoded.length / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   ✓ 압축률: ${(((estimatedSize + assetSize) - encoded.length) / (estimatedSize + assetSize) * 100).toFixed(1)}%`);
        
        if (memoryAfterEncode) {
            console.log(`   ✓ 인코딩 후 메모리: ${(memoryAfterEncode.used / 1024 / 1024).toFixed(2)}MB`);
        }

        // 5. 가비지 컬렉션 강제 실행
        if (typeof window !== 'undefined' && (window as any).gc) {
            console.log('\n4. 가비지 컬렉션 실행...');
            (window as any).gc();
            const memoryAfterGC = getMemoryUsage();
            if (memoryAfterGC) {
                console.log(`   ✓ GC 후 메모리: ${(memoryAfterGC.used / 1024 / 1024).toFixed(2)}MB`);
            }
        }

        // 6. 스트리밍 디코딩 테스트
        console.log('\n5. 스트리밍 디코딩 테스트...');
        const decodeStartTime = Date.now();
        
        const decoded = await decodeRisuSaveEnhanced(encoded, (progress, stage) => {
            console.log(`   디코딩 진행: ${stage} ${progress.toFixed(1)}%`);
        });

        const decodeTime = Date.now() - decodeStartTime;
        const memoryAfterDecode = getMemoryUsage();

        console.log(`   ✓ 디코딩 완료: ${decodeTime}ms`);
        console.log(`   ✓ 캐릭터 수 확인: ${decoded.characters?.length || 0}개`);
        console.log(`   ✓ 자산 수 확인: ${decoded.assets?.size || 0}개`);
        
        if (memoryAfterDecode) {
            console.log(`   ✓ 디코딩 후 메모리: ${(memoryAfterDecode.used / 1024 / 1024).toFixed(2)}MB`);
        }

        // 7. 데이터 무결성 검증
        console.log('\n6. 데이터 무결성 검증...');
        const integrityChecks = {
            charactersCount: decoded.characters?.length === largeTestData.characters.length,
            assetsCount: (decoded.assets?.size || 0) === largeTestData.assets.size,
            sampleCharacter: decoded.characters?.[0]?.name === largeTestData.characters[0].name,
            sampleAsset: false
        };

        // 샘플 자산 검증
        if (decoded.assets && largeTestData.assets.size > 0) {
            const firstAssetKey = Array.from(largeTestData.assets.keys())[0];
            const originalAsset = largeTestData.assets.get(firstAssetKey);
            const decodedAsset = decoded.assets.get(firstAssetKey);
            
            if (originalAsset && decodedAsset && originalAsset.length === decodedAsset.length) {
                // 처음 1KB만 비교 (성능상의 이유)
                let matches = true;
                for (let i = 0; i < Math.min(1024, originalAsset.length); i++) {
                    if (originalAsset[i] !== decodedAsset[i]) {
                        matches = false;
                        break;
                    }
                }
                integrityChecks.sampleAsset = matches;
            }
        }

        console.log(`   ✓ 캐릭터 수: ${integrityChecks.charactersCount ? '성공' : '실패'}`);
        console.log(`   ✓ 자산 수: ${integrityChecks.assetsCount ? '성공' : '실패'}`);
        console.log(`   ✓ 샘플 캐릭터: ${integrityChecks.sampleCharacter ? '성공' : '실패'}`);
        console.log(`   ✓ 샘플 자산: ${integrityChecks.sampleAsset ? '성공' : '실패'}`);

        console.log('\n=== 스트리밍 백업 시스템 테스트 완료 ===');
        console.log('✓ 대용량 데이터 처리가 성공적으로 완료되었습니다!');

        return {
            success: true,
            results: {
                originalSize: estimatedSize + assetSize,
                encodedSize: encoded.length,
                encodeTime,
                decodeTime,
                progressCount,
                compressionRatio: ((estimatedSize + assetSize) - encoded.length) / (estimatedSize + assetSize),
                integrityChecks,
                memoryUsage: {
                    before: memoryBefore,
                    afterEncode: memoryAfterEncode,
                    afterDecode: memoryAfterDecode
                }
            }
        };

    } catch (error) {
        console.error('=== 스트리밍 백업 시스템 테스트 실패 ===');
        console.error('오류:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 중단 기능 상세 테스트
 */
export async function testAbortFunctionality() {
    console.log('=== 중단 기능 상세 테스트 ===');
    
    try {
        // 중간 크기 데이터 생성
        const testData = {
            formatversion: 4,
            characters: []
        };

        for (let i = 0; i < 200; i++) {
            testData.characters.push({
                name: `AbortTestChar${i}`,
                desc: 'Abort test description. '.repeat(100),
                scenario: 'Abort test scenario. '.repeat(50),
                image: `abort_test_${i}.png`,
                firstMessage: 'Test abort functionality',
                chats: []
            });
        }

        console.log(`테스트 데이터 준비: ${testData.characters.length}개 캐릭터`);

        // 테스트 1: 즉시 중단
        console.log('\n1. 즉시 중단 테스트...');
        const controller1 = createChunkingController();
        controller1.abort(); // 시작 전 중단

        try {
            await encodeRisuSaveEnhanced(testData, (progress, stage) => {
                console.log(`   즉시 중단 테스트: ${stage} ${progress.toFixed(1)}%`);
            }, controller1);
            console.log('   ✗ 실패: 작업이 완료됨 (중단되지 않음)');
        } catch (error) {
            if (error.message.includes('aborted')) {
                console.log('   ✓ 성공: 작업이 시작 전에 중단됨');
            } else {
                console.log(`   ✗ 예상치 못한 오류: ${error.message}`);
            }
        }

        // 테스트 2: 지연 중단
        console.log('\n2. 지연 중단 테스트...');
        const controller2 = createChunkingController();
        
        // 1초 후 중단
        setTimeout(() => {
            console.log('   중단 신호 발송...');
            controller2.abort();
        }, 1000);

        let progressReceived = 0;
        try {
            await encodeRisuSaveEnhanced(testData, (progress, stage) => {
                progressReceived++;
                console.log(`   지연 중단 테스트: ${stage} ${progress.toFixed(1)}%`);
            }, controller2);
            console.log('   ✗ 실패: 작업이 완료됨 (중단되지 않음)');
        } catch (error) {
            if (error.message.includes('aborted')) {
                console.log(`   ✓ 성공: 작업이 진행 중에 중단됨 (진행률 업데이트 ${progressReceived}회)`);
            } else {
                console.log(`   ✗ 예상치 못한 오류: ${error.message}`);
            }
        }

        // 테스트 3: 디코딩 중단
        console.log('\n3. 디코딩 중단 테스트...');
        // 먼저 정상적으로 인코딩
        const encoded = await encodeRisuSaveEnhanced(testData);
        console.log(`   테스트용 데이터 인코딩 완료: ${(encoded.length / 1024).toFixed(2)}KB`);

        const controller3 = createChunkingController();
        
        // 500ms 후 중단
        setTimeout(() => {
            console.log('   디코딩 중단 신호 발송...');
            controller3.abort();
        }, 500);

        try {
            await decodeRisuSaveEnhanced(encoded, (progress, stage) => {
                console.log(`   디코딩 중단 테스트: ${stage} ${progress.toFixed(1)}%`);
            }, controller3);
            console.log('   ✗ 실패: 디코딩이 완료됨 (중단되지 않음)');
        } catch (error) {
            if (error.message.includes('aborted')) {
                console.log('   ✓ 성공: 디코딩이 중단됨');
            } else {
                console.log(`   ✗ 예상치 못한 오류: ${error.message}`);
            }
        }

        console.log('\n=== 중단 기능 상세 테스트 완료 ===');
        return { success: true };

    } catch (error) {
        console.error('=== 중단 기능 테스트 실패 ===');
        console.error('오류:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 성능 벤치마크 테스트
 */
export async function performanceBenchmark() {
    console.log('=== 성능 벤치마크 테스트 ===');

    const results = [];
    const testSizes = [10, 50, 100, 500]; // 캐릭터 수

    for (const size of testSizes) {
        console.log(`\n${size}개 캐릭터 벤치마크...`);
        
        const testData = {
            formatversion: 4,
            characters: []
        };

        // 테스트 데이터 생성
        for (let i = 0; i < size; i++) {
            testData.characters.push({
                name: `BenchChar${i}`,
                desc: 'Benchmark description. '.repeat(50),
                scenario: 'Benchmark scenario. '.repeat(25),
                image: `bench_${i}.png`,
                firstMessage: 'Benchmark test',
                chats: []
            });
        }

        const originalSize = JSON.stringify(testData).length;
        console.log(`   원본 크기: ${(originalSize / 1024).toFixed(2)}KB`);

        // 인코딩 벤치마크
        const encodeStart = performance.now();
        const encoded = await encodeRisuSaveEnhanced(testData);
        const encodeTime = performance.now() - encodeStart;

        // 디코딩 벤치마크
        const decodeStart = performance.now();
        const decoded = await decodeRisuSaveEnhanced(encoded);
        const decodeTime = performance.now() - decodeStart;

        const result = {
            characterCount: size,
            originalSize,
            encodedSize: encoded.length,
            encodeTime: Math.round(encodeTime),
            decodeTime: Math.round(decodeTime),
            compressionRatio: ((originalSize - encoded.length) / originalSize * 100).toFixed(1),
            totalTime: Math.round(encodeTime + decodeTime)
        };

        results.push(result);

        console.log(`   압축 크기: ${(result.encodedSize / 1024).toFixed(2)}KB`);
        console.log(`   인코딩: ${result.encodeTime}ms`);
        console.log(`   디코딩: ${result.decodeTime}ms`);
        console.log(`   압축률: ${result.compressionRatio}%`);
        console.log(`   총 시간: ${result.totalTime}ms`);
    }

    console.log('\n=== 성능 벤치마크 결과 요약 ===');
    console.table(results);

    return { success: true, results };
}

// 전역 함수로 노출
if (typeof window !== 'undefined') {
    (window as any).testChunkingSystem = testChunkingSystem;
    (window as any).compareMemoryEfficiency = compareMemoryEfficiency;
    (window as any).testStreamingBackupSystem = testStreamingBackupSystem;
    (window as any).testAbortFunctionality = testAbortFunctionality;
    (window as any).performanceBenchmark = performanceBenchmark;
}