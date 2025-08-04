<script lang="ts">
    import { characterFormatUpdate, getCharImage, removeChar } from "../../ts/characters";
    import { type Database } from "../../ts/storage/database.svelte";
    import { DBState } from 'src/ts/stores.svelte';
    import BarIcon from "../SideBars/BarIcon.svelte";
    import { ArrowLeft, User, Users, Inspect, TrashIcon, Undo2Icon } from "lucide-svelte";
    import { selectedCharID } from "../../ts/stores.svelte";
    import TextInput from "../UI/GUI/TextInput.svelte";
    import Button from "../UI/GUI/Button.svelte";
    import { language } from "src/lang";
    import { parseMultilangString } from "src/ts/util";
    import { checkCharOrder } from "src/ts/globalApi.svelte";
  import MobileCharacters from "../Mobile/MobileCharacters.svelte";
    interface Props {
        endGrid?: any;
    }

    let { endGrid = () => {} }: Props = $props();
    let search = $state('')
    let selected = $state(3)

    // Grid 모드 전용 상태 변수들
    let gridScrollContainer: HTMLElement;
    let gridContainerHeight = $state(600);
    let gridScrollTop = $state(0);
    let gridRowHeight = $state(72); // 56px 아바타 + 16px 여백
    let actualRowHeight = $state(72); // 실제 측정된 Row 높이
    let actualAvatarWidth = $state(56); // 실제 측정된 Avatar 너비 (56x56)
    let itemsPerRow = $state(6);
    let gridStartRow = $state(0);
    let gridEndRow = $state(0);
    let gridStartIndex = $state(0);
    let gridEndIndex = $state(0);
    let gridTotalHeight = $state(0);
    
    // List/Trash 모드 전용 상태 변수들
    let listScrollContainer: HTMLElement;
    let trashScrollContainer: HTMLElement;
    let listContainerHeight = $state(600);
    let listScrollTop = $state(0);
    let listItemHeight = $state(120);
    let listVisibleCount = $state(0);
    let listStartIndex = $state(0);
    let listEndIndex = $state(0);
    let listTotalHeight = $state(0);
    
    // 성능 최적화를 위한 변수들
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let cachedChars: any[] = [];
    let lastSearch = '';
    let lastSelected = -1;
    let lastDbState: any = null;
    
    // 터치 스크롤링 관련 변수들
    let isTouching = $state(false);
    let touchScrollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTouchScrollTime = 0;

    function changeChar(index = -1){
        characterFormatUpdate(index)
        selectedCharID.set(index)
        endGrid()
    }

    function formatChars(search:string, db:Database, trash = false){
        let charas:{
            image:string
            index:number
            type:string,
            name:string
            desc:string
        }[] = []

        for(let i=0;i<db.characters.length;i++){
            const c = db.characters[i]
            if(c.trashTime && !trash){
                continue
            }
            if(!c.trashTime && trash){
                continue
            }
            if(c.name.replace(/ /g,"").toLocaleLowerCase().includes(search.toLocaleLowerCase().replace(/ /g,""))){
                charas.push({
                    image: c.image,
                    index: i,
                    type: c.type,
                    name: c.name,
                    desc: c.creatorNotes ?? 'No description'
                })
            }
        }
        return charas
    }

    // 캐시된 캐릭터 데이터 가져오기
    function getCachedChars(search: string, db: Database, trash = false) {
        const currentSelected = trash ? 2 : selected;
        const dbChanged = lastDbState !== db;
        
        if (cachedChars.length === 0 || lastSearch !== search || lastSelected !== currentSelected || dbChanged) {
            cachedChars = formatChars(search, db, trash);
            lastSearch = search;
            lastSelected = currentSelected;
            lastDbState = db;
        }
        
        return cachedChars;
    }

    // 스크롤 위치 리셋 (각 모드별로 분리)
    function resetGridScrollPosition() {
        if (gridScrollContainer && gridScrollContainer.scrollTop > 0) {
            gridScrollTop = 0;
            gridScrollContainer.scrollTop = 0;
        } else {
            gridScrollTop = 0;
        }
    }

    function resetListScrollPosition() {
        const currentContainer = selected === 1 ? listScrollContainer : trashScrollContainer;
        if (currentContainer && currentContainer.scrollTop > 0) {
            listScrollTop = 0;
            currentContainer.scrollTop = 0;
        } else {
            listScrollTop = 0;
        }
    }

    // Avatar 크기 고정 (측정 기반 불안정성 제거)
    function setFixedAvatarDimensions() {
        // 고정값 사용으로 안정성 확보 (56px + 약간의 여백)
        actualAvatarWidth = 64; // 56px Avatar + 8px 여백
    }

    // Grid 모드 전용 함수들 - 고정 크기 기반
    function calculateGridItemsPerRow() {
        if (gridScrollContainer && gridScrollContainer.clientWidth > 0) {
            // 고정 Avatar 크기 사용
            setFixedAvatarDimensions();
            
            const containerWidth = gridScrollContainer.clientWidth;
            const gap = 8; // gap-2 = 0.5rem = 8px
            const paddingX = 16; // 좌우 여백
            const availableWidth = containerWidth - paddingX;
            
            // 고정된 Avatar 너비 사용 (64px = 56px Avatar + 여백)
            const calculatedItems = Math.floor(availableWidth / actualAvatarWidth);
            const newItemsPerRow = Math.max(1, calculatedItems); // 최소 1개, 최대 제한 없음
            
            // 디버그 로그 추가
            console.log(`[DEBUG] calculateGridItemsPerRow: containerWidth=${containerWidth}, availableWidth=${availableWidth}, actualAvatarWidth=${actualAvatarWidth}, calculatedItems=${calculatedItems}, newItemsPerRow=${newItemsPerRow}`);
            
            return newItemsPerRow;
        } else {
            console.log(`[DEBUG] calculateGridItemsPerRow: container not ready, returning default 6`);
            return 6;
        }
    }

    // 레이아웃 완전 리셋 함수
    function resetGridLayout() {
        console.log(`[DEBUG] resetGridLayout: resetting all virtual scrolling state`);
        
        // Virtual Scrolling 상태 완전 리셋
        gridScrollTop = 0;
        gridStartRow = 0;
        gridEndRow = 0;
        gridStartIndex = 0;
        gridEndIndex = 0;
        
        // 스크롤 위치 리셋
        if (gridScrollContainer) {
            gridScrollContainer.scrollTop = 0;
        }
        
        // 캐시 무효화
        cachedChars = [];
        lastSearch = '';
        lastSelected = -1;
        
        console.log(`[DEBUG] resetGridLayout: layout reset complete`);
    }

    // itemsPerRow 업데이트 - 간단하고 효율적인 방식
    function updateItemsPerRowAndRecalculate() {
        const newItemsPerRow = calculateGridItemsPerRow();
        const oldItemsPerRow = itemsPerRow;
        
        console.log(`[DEBUG] updateItemsPerRowAndRecalculate: oldItemsPerRow=${oldItemsPerRow}, newItemsPerRow=${newItemsPerRow}`);
        
        // Row당 아바타 수가 실제로 변경된 경우에만 처리
        if (oldItemsPerRow !== newItemsPerRow) {
            itemsPerRow = newItemsPerRow;
            console.log(`[DEBUG] itemsPerRow CHANGED: ${oldItemsPerRow} -> ${newItemsPerRow}, will trigger reset via $effect`);
        } else {
            console.log(`[DEBUG] itemsPerRow unchanged: ${oldItemsPerRow}, no action needed`);
        }
    }

    // Row 높이를 고정값으로 안정화 (Jittering 방지)
    function stabilizeRowHeight() {
        // 56px Avatar + 16px 여백으로 고정 (Jittering 방지)
        const stableRowHeight = 72;
        if (actualRowHeight !== stableRowHeight) {
            actualRowHeight = stableRowHeight;
            gridRowHeight = actualRowHeight;
        }
    }

    // 컨테이너 크기 변경 감지 및 재계산
    function handleContainerResize() {
        console.log(`[DEBUG] handleContainerResize called: gridScrollContainer exists=${!!gridScrollContainer}, selected=${selected}`);
        
        if (gridScrollContainer) {
            // 컨테이너 높이 업데이트
            const rect = gridScrollContainer.getBoundingClientRect();
            console.log(`[DEBUG] handleContainerResize: rect.width=${rect.width}, rect.height=${rect.height}, current gridContainerHeight=${gridContainerHeight}`);
            console.log(`[DEBUG] gridScrollContainer clientWidth=${gridScrollContainer.clientWidth}, scrollTop=${gridScrollContainer.scrollTop}`);
            
            if (rect.height > 0 && Math.abs(gridContainerHeight - rect.height) > 5) {
                console.log(`[DEBUG] updating gridContainerHeight from ${gridContainerHeight} to ${rect.height}`);
                gridContainerHeight = rect.height;
            }
            
            // itemsPerRow 업데이트 및 완전 재계산
            updateItemsPerRowAndRecalculate();
            
            // Row 높이 안정화
            setTimeout(() => {
                stabilizeRowHeight();
            }, 20);
        } else {
            console.log(`[DEBUG] handleContainerResize: gridScrollContainer is null/undefined - this is the root cause!`);
        }
    }

    function updateGridVirtualScrolling(chars: any[]) {
        console.log(`[DEBUG] updateGridVirtualScrolling: chars.length=${chars.length}, itemsPerRow=${itemsPerRow}, gridScrollTop=${gridScrollTop}`);
        
        if (itemsPerRow <= 0 || chars.length === 0) {
            console.log(`[DEBUG] early return: itemsPerRow=${itemsPerRow}, chars.length=${chars.length}`);
            gridTotalHeight = gridContainerHeight;
            gridStartRow = 0;
            gridEndRow = 0;
            gridStartIndex = 0;
            gridEndIndex = 0;
            return;
        }
        
        const totalRows = Math.ceil(chars.length / itemsPerRow);
        
        // 화면 높이와 Row 높이에 따라 완전히 다이나믹하게 계산
        const exactVisibleRows = gridContainerHeight / actualRowHeight;
        const baseVisibleRows = Math.ceil(exactVisibleRows);
        const dynamicBuffer = Math.max(1, Math.min(3, Math.ceil(exactVisibleRows * 0.3))); // 30% 버퍼, 최소 1개, 최대 3개
        const totalVisibleRows = baseVisibleRows + dynamicBuffer;
        
        const oldStartRow = gridStartRow;
        const oldEndRow = gridEndRow;
        const oldStartIndex = gridStartIndex;
        const oldEndIndex = gridEndIndex;
        
        gridStartRow = Math.max(0, Math.floor(gridScrollTop / actualRowHeight));
        gridEndRow = Math.min(gridStartRow + totalVisibleRows, totalRows);
        
        gridStartIndex = gridStartRow * itemsPerRow;
        gridEndIndex = Math.min(gridEndRow * itemsPerRow, chars.length);
        
        gridTotalHeight = totalRows * actualRowHeight;
        
        // 경계값 검증
        gridStartRow = Math.max(0, Math.min(gridStartRow, totalRows));
        gridEndRow = Math.max(gridStartRow, Math.min(gridEndRow, totalRows));
        gridStartIndex = Math.max(0, Math.min(gridStartIndex, chars.length));
        gridEndIndex = Math.max(gridStartIndex, Math.min(gridEndIndex, chars.length));
        
        console.log(`[DEBUG] Virtual Scrolling calculated: totalRows=${totalRows}, gridStartRow=${gridStartRow} (was ${oldStartRow}), gridEndRow=${gridEndRow} (was ${oldEndRow}), gridStartIndex=${gridStartIndex} (was ${oldStartIndex}), gridEndIndex=${gridEndIndex} (was ${oldEndIndex}), totalHeight=${gridTotalHeight}`);
    }

    // Row 단위 데이터 생성 함수 - 안전성 강화
    function getVisibleGridRows(chars: any[]) {
        const rows = [];
        console.log(`[DEBUG] getVisibleGridRows: generating rows from ${gridStartRow} to ${gridEndRow}, itemsPerRow=${itemsPerRow}, chars.length=${chars.length}`);
        
        // 경계값 재검증
        const safeStartRow = Math.max(0, gridStartRow);
        const totalRows = Math.ceil(chars.length / Math.max(1, itemsPerRow));
        const safeEndRow = Math.min(gridEndRow, totalRows);
        
        console.log(`[DEBUG] getVisibleGridRows: safe bounds - startRow=${safeStartRow}, endRow=${safeEndRow}, totalRows=${totalRows}`);
        
        for (let rowIndex = safeStartRow; rowIndex < safeEndRow; rowIndex++) {
            const startIdx = rowIndex * itemsPerRow;
            const endIdx = Math.min(startIdx + itemsPerRow, chars.length);
            
            // 유효한 인덱스 범위 확인
            if (startIdx < chars.length && startIdx >= 0) {
                const rowItems = chars.slice(startIdx, endIdx);
                console.log(`[DEBUG] Row ${rowIndex}: startIdx=${startIdx}, endIdx=${endIdx}, items=${rowItems.length}, item names=[${rowItems.map(item => item.name).join(', ')}]`);
                
                if (rowItems.length > 0) {
                    rows.push({
                        rowIndex,
                        items: rowItems,
                        yPosition: rowIndex * actualRowHeight
                    });
                }
            } else {
                console.warn(`[DEBUG] Row ${rowIndex}: invalid startIdx=${startIdx}, skipping`);
            }
        }
        
        console.log(`[DEBUG] getVisibleGridRows: generated ${rows.length} rows with total ${rows.reduce((sum, row) => sum + row.items.length, 0)} items`);
        return rows;
    }

    // List 모드 전용 함수들
    function updateListVirtualScrolling(chars: any[]) {
        if (chars.length === 0) {
            listTotalHeight = listContainerHeight;
            listStartIndex = 0;
            listEndIndex = 0;
            return;
        }
        
        listVisibleCount = Math.ceil(listContainerHeight / listItemHeight) + 2;
        
        listStartIndex = Math.max(0, Math.floor(listScrollTop / listItemHeight));
        listEndIndex = Math.min(listStartIndex + listVisibleCount, chars.length);
        
        listTotalHeight = chars.length * listItemHeight;
        
        listStartIndex = Math.max(0, listStartIndex);
        listEndIndex = Math.max(listStartIndex, listEndIndex);
    }


    // Grid 모드 터치 이벤트 핸들러들
    function handleGridTouchStart(event: TouchEvent) {
        isTouching = true;
        lastTouchScrollTime = Date.now();
    }

    function handleGridTouchMove(event: TouchEvent) {
        if (!isTouching || !gridScrollContainer) return;
        
        const currentTime = Date.now();
        if (currentTime - lastTouchScrollTime > 8) {
            gridScrollTop = gridScrollContainer.scrollTop;
            updateGridVirtualScrollingImmediate();
            lastTouchScrollTime = currentTime;
        }
    }

    function handleGridTouchEnd(event: TouchEvent) {
        isTouching = false;
        
        if (touchScrollTimer) {
            clearTimeout(touchScrollTimer);
        }
        
        touchScrollTimer = setTimeout(() => {
            if (gridScrollContainer) {
                gridScrollTop = gridScrollContainer.scrollTop;
                updateGridVirtualScrollingImmediate();
            }
            touchScrollTimer = null;
        }, 50);
    }

    function updateGridVirtualScrollingImmediate() {
        const chars = getCachedChars(search, DBState.db);
        updateGridVirtualScrolling(chars);
    }

    function handleGridScroll(event: Event) {
        const target = event.target as HTMLElement;
        gridScrollTop = target.scrollTop;
        
        if (isTouching) {
            updateGridVirtualScrollingImmediate();
            return;
        }
        
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
        }
        
        throttleTimer = setTimeout(() => {
            updateGridVirtualScrollingImmediate();
            throttleTimer = null;
        }, 16);
    }

    // List 모드 터치 이벤트 핸들러들
    function handleListTouchStart(event: TouchEvent) {
        isTouching = true;
        lastTouchScrollTime = Date.now();
    }

    function handleListTouchMove(event: TouchEvent) {
        const currentContainer = selected === 1 ? listScrollContainer : trashScrollContainer;
        if (!isTouching || !currentContainer) return;
        
        const currentTime = Date.now();
        if (currentTime - lastTouchScrollTime > 8) {
            listScrollTop = currentContainer.scrollTop;
            updateListVirtualScrollingImmediate();
            lastTouchScrollTime = currentTime;
        }
    }

    function handleListTouchEnd(event: TouchEvent) {
        isTouching = false;
        
        if (touchScrollTimer) {
            clearTimeout(touchScrollTimer);
        }
        
        touchScrollTimer = setTimeout(() => {
            const currentContainer = selected === 1 ? listScrollContainer : trashScrollContainer;
            if (currentContainer) {
                listScrollTop = currentContainer.scrollTop;
                updateListVirtualScrollingImmediate();
            }
            touchScrollTimer = null;
        }, 50);
    }

    function updateListVirtualScrollingImmediate() {
        const chars = selected === 2 ?
            getCachedChars(search, DBState.db, true) :
            getCachedChars(search, DBState.db);
        updateListVirtualScrolling(chars);
    }

    function handleListScroll(event: Event) {
        const target = event.target as HTMLElement;
        listScrollTop = target.scrollTop;
        
        if (isTouching) {
            updateListVirtualScrollingImmediate();
            return;
        }
        
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
        }
        
        throttleTimer = setTimeout(() => {
            updateListVirtualScrollingImmediate();
            throttleTimer = null;
        }, 16);
    }


    // 현재 모드에 따른 스크롤 컨테이너 반환
    function getCurrentScrollContainer() {
        const container = selected === 0 ? gridScrollContainer :
                         selected === 1 ? listScrollContainer :
                         selected === 2 ? trashScrollContainer :
                         null;
        console.log(`[DEBUG] getCurrentScrollContainer: selected=${selected}, container exists=${!!container}`);
        return container;
    }

    // 현재 모드에 따른 컨테이너 높이 반환
    function getCurrentContainerHeight() {
        return selected === 0 ? gridContainerHeight : listContainerHeight;
    }

    // 현재 모드에 따른 컨테이너 높이 설정
    function setCurrentContainerHeight(height: number) {
        if (selected === 0) {
            gridContainerHeight = height;
        } else {
            listContainerHeight = height;
        }
    }

    // 검색어나 모드 변경 감지 (무한 루프 방지)
    let lastSearchValue = '';
    let lastSelectedValue = -1;
    let isInitializing = true;
    
    $effect(() => {
        // 실제 변경사항이 있을 때만 처리
        const searchChanged = lastSearchValue !== search;
        const selectedChanged = lastSelectedValue !== selected;
        
        if (isInitializing || searchChanged || selectedChanged) {
            // 변경 시에만 스크롤 위치 리셋
            if (searchChanged || selectedChanged) {
                if (selected === 0) {
                    resetGridScrollPosition();
                } else {
                    resetListScrollPosition();
                }
            }
            
            lastSearchValue = search;
            lastSelectedValue = selected;
            isInitializing = false;
        }
        
        // Virtual Scrolling 업데이트
        const chars = selected === 2 ?
            getCachedChars(search, DBState.db, true) :
            getCachedChars(search, DBState.db);
        
        if (selected === 0) {
            // Grid 모드에서는 안정화된 처리 순서
            requestAnimationFrame(() => {
                setFixedAvatarDimensions();
                stabilizeRowHeight();
                updateItemsPerRowAndRecalculate();
            });
            updateGridVirtualScrolling(chars);
        } else {
            updateListVirtualScrolling(chars);
        }
    });

    // 컨테이너 초기화 및 높이 설정 (무한 루프 방지)
    $effect(() => {
        const currentContainer = getCurrentScrollContainer();
        if (currentContainer) {
            // 컨테이너 높이 설정
            const rect = currentContainer.getBoundingClientRect();
            const currentHeight = getCurrentContainerHeight();
            if (rect.height > 0 && Math.abs(currentHeight - rect.height) > 5) {
                setCurrentContainerHeight(rect.height);
                
                // Grid 모드에서 크기 변경 시 재계산
                if (selected === 0) {
                    handleContainerResize();
                }
            }
            
            // 모바일 최적화 (한번만 적용)
            if (!currentContainer.dataset.optimized) {
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                if (isMobile) {
                    currentContainer.style.willChange = 'scroll-position';
                    currentContainer.style.backfaceVisibility = 'hidden';
                    currentContainer.style.perspective = '1000px';
                }
                currentContainer.dataset.optimized = 'true';
            }
        }
    });

    // ResizeObserver는 별도로 관리
    let currentResizeObserver: ResizeObserver | null = null;
    
    $effect(() => {
        const currentContainer = getCurrentScrollContainer();
        
        // 기존 observer 정리
        if (currentResizeObserver) {
            currentResizeObserver.disconnect();
            currentResizeObserver = null;
        }
        
        if (currentContainer) {
            console.log(`[DEBUG] Setting up ResizeObserver for container, selected=${selected}`);
            currentResizeObserver = new ResizeObserver((entries) => {
                console.log(`[DEBUG] ResizeObserver triggered with ${entries.length} entries, selected=${selected}`);
                for (const entry of entries) {
                    const newWidth = entry.contentRect.width;
                    const newHeight = entry.contentRect.height;
                    const currentHeight = getCurrentContainerHeight();
                    
                    console.log(`[DEBUG] ResizeObserver: newWidth=${newWidth}, newHeight=${newHeight}, currentHeight=${currentHeight}, selected=${selected}`);

                    // Height 변화 처리
                    if (newHeight > 0 && Math.abs(currentHeight - newHeight) > 1) {
                        console.log(`[DEBUG] ResizeObserver: updating container height from ${currentHeight} to ${newHeight}`);
                        setCurrentContainerHeight(newHeight);
                    }
                    
                    // Grid 모드에서 Width 변화를 감지해서 itemsPerRow 재계산
                    if (selected === 0 && newWidth > 0) {
                        console.log(`[DEBUG] ResizeObserver: Grid container width detected=${newWidth}, forcing itemsPerRow recalculation`);
                        
                        // 즉시 및 requestAnimationFrame 이중 처리로 완전한 리셋까지 수행
                        const forceCalculationAndReset = () => {
                            if (selected === 0 && gridScrollContainer) {
                                console.log(`[DEBUG] ResizeObserver: calling calculateGridItemsPerRow for width=${gridScrollContainer.clientWidth}`);
                                const newItemsPerRow = calculateGridItemsPerRow();
                                const oldItemsPerRow = itemsPerRow;
                                
                                if (newItemsPerRow !== oldItemsPerRow) {
                                    console.log(`[DEBUG] ResizeObserver: itemsPerRow changing ${oldItemsPerRow} -> ${newItemsPerRow}, performing complete reset`);
                                    itemsPerRow = newItemsPerRow;
                                    
                                    // 바로 리셋 및 재계산 수행 (중복 처리 방지)
                                    resetGridLayout();
                                    const chars = getCachedChars(search, DBState.db);
                                    updateGridVirtualScrolling(chars);
                                    
                                    console.log(`[DEBUG] ResizeObserver: complete reset finished for itemsPerRow=${newItemsPerRow}`);
                                } else {
                                    console.log(`[DEBUG] ResizeObserver: itemsPerRow unchanged ${oldItemsPerRow}, no reset needed`);
                                }
                            }
                        };
                        
                        // 즉시 실행
                        forceCalculationAndReset();
                        
                        // requestAnimationFrame으로도 한 번 더
                        requestAnimationFrame(forceCalculationAndReset);
                    }
                }
            });
            
            currentResizeObserver.observe(currentContainer);
            console.log(`[DEBUG] ResizeObserver set up successfully`);
        } else {
            console.log(`[DEBUG] No current container to observe, selected=${selected}`);
        }
        
        return () => {
            if (currentResizeObserver) {
                currentResizeObserver.disconnect();
                currentResizeObserver = null;
            }
            if (throttleTimer) {
                clearTimeout(throttleTimer);
                throttleTimer = null;
            }
            if (touchScrollTimer) {
                clearTimeout(touchScrollTimer);
                touchScrollTimer = null;
            }
            isTouching = false;
        };
    });
</script>

<div class="h-full w-full flex justify-center">
    <div class="h-full p-6 bg-darkbg max-w-full w-2xl flex flex-col min-h-0">
        <div class="mx-4 mb-6 flex flex-col">
            <div class="flex items-center gap-3 mb-2">
                <button 
                    class="flex items-center justify-center p-2 rounded-lg hover:bg-selected transition-colors flex-shrink-0"
                    onclick={() => endGrid()}
                    title="Back"
                >
                    <ArrowLeft size={20} />
                </button>
                <div class="flex-1">
                    <TextInput placeholder="Search" bind:value={search} size="lg" autocomplete="off" fullwidth={true}/>
                </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-2">
                <Button styled={selected === 3 ? 'primary' : 'outlined'} size="sm" onclick={() => {selected = 3}}>
                    {language.simple}
                </Button>
                <Button styled={selected === 0 ? 'primary' : 'outlined'} size="sm" onclick={() => {selected = 0}}>
                    {language.grid}
                </Button>
                <Button styled={selected === 1  ? 'primary' : 'outlined'} size="sm" onclick={() => {selected = 1}}>
                    {language.list}
                </Button>
                <Button styled={selected === 2  ? 'primary' : 'outlined'} size="sm" onclick={() => {selected = 2}}>
                    {language.trash}
                </Button>
                <div class="flex-grow"></div>
                <span class="text-textcolor2 text-sm">
                    {selected === 2 ? getCachedChars(search, DBState.db, true).length : getCachedChars(search, DBState.db).length} {language.character}
                </span>
            </div>
        </div>
        {#if selected === 0}
            <!-- Grid 모드 Virtual Scrolling -->
            <div
                class="flex-1 overflow-y-auto min-h-0"
                bind:this={gridScrollContainer}
                onscroll={handleGridScroll}
                ontouchstart={handleGridTouchStart}
                ontouchmove={handleGridTouchMove}
                ontouchend={handleGridTouchEnd}
                style="touch-action: pan-y; -webkit-overflow-scrolling: touch; height: 100%;"
            >
                <div style="height: {gridTotalHeight}px; position: relative; min-height: 100%;">
                    {#each getVisibleGridRows(getCachedChars(search, DBState.db)) as row (row.rowIndex)}
                        <div
                            class="absolute w-full flex justify-center grid-row"
                            style="transform: translateY({row.yPosition}px); height: {actualRowHeight}px;"
                        >
                            <div class="flex flex-wrap gap-2 w-full justify-center items-center h-full px-2">
                                {#each row.items as char}
                                    <div class="flex items-center text-textcolor">
                                        {#if char.image}
                                            <BarIcon onClick={() => {changeChar(char.index)}} additionalStyle={getCharImage(char.image, 'css')}></BarIcon>
                                        {:else}
                                            <BarIcon onClick={() => {changeChar(char.index)}} additionalStyle={char.index === $selectedCharID ? 'background:var(--risu-theme-selected)' : ''}>
                                                {#if char.type === 'group'}
                                                    <Users />
                                                {:else}
                                                    <User/>
                                                {/if}
                                            </BarIcon>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {:else if selected === 1}
            <!-- List 모드 Virtual Scrolling -->
            <div
                class="flex-1 overflow-y-auto"
                bind:this={listScrollContainer}
                onscroll={handleListScroll}
                ontouchstart={handleListTouchStart}
                ontouchmove={handleListTouchMove}
                ontouchend={handleListTouchEnd}
                style="touch-action: pan-y; -webkit-overflow-scrolling: touch;"
            >
                <div style="height: {listTotalHeight}px; position: relative;">
                    <div style="transform: translateY({listStartIndex * listItemHeight}px);">
                        {#each getCachedChars(search, DBState.db).slice(listStartIndex, listEndIndex) as char}
                            <div class="flex p-2 border border-darkborderc rounded-md mb-2" style="min-height: {listItemHeight - 8}px;">
                                <BarIcon onClick={() => {changeChar(char.index)}} additionalStyle={getCharImage(char.image, 'css')}></BarIcon>
                                <div class="flex-1 flex flex-col ml-2 overflow-hidden">
                                    <h4 class="text-textcolor font-bold text-lg mb-1 truncate">{char.name || "Unnamed"}</h4>
                                    <span class="text-textcolor2 text-sm line-clamp-2 flex-1">{parseMultilangString(char.desc)['en'] || parseMultilangString(char.desc)['xx'] || 'No description'}</span>
                                    <div class="flex gap-2 justify-end mt-auto">
                                        <button class="hover:text-textcolor text-textcolor2 p-1" onclick={() => {
                                            changeChar(char.index)
                                        }}>
                                            <Inspect size={16} />
                                        </button>
                                        <button class="hover:text-textcolor text-textcolor2 p-1" onclick={() => {
                                            removeChar(char.index, char.name)
                                        }}>
                                            <TrashIcon size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        {:else if selected === 2}
            <!-- Trash 모드 Virtual Scrolling -->
            <span class="text-textcolor2 text-sm mb-2">{language.trashDesc}</span>
            <div
                class="flex-1 overflow-y-auto"
                bind:this={trashScrollContainer}
                onscroll={handleListScroll}
                ontouchstart={handleListTouchStart}
                ontouchmove={handleListTouchMove}
                ontouchend={handleListTouchEnd}
                style="touch-action: pan-y; -webkit-overflow-scrolling: touch;"
            >
                <div style="height: {listTotalHeight}px; position: relative;">
                    <div style="transform: translateY({listStartIndex * listItemHeight}px);">
                        {#each getCachedChars(search, DBState.db, true).slice(listStartIndex, listEndIndex) as char}
                            <div class="flex p-2 border border-darkborderc rounded-md mb-2" style="min-height: {listItemHeight - 8}px;">
                                <BarIcon onClick={() => {changeChar(char.index)}} additionalStyle={getCharImage(char.image, 'css')}></BarIcon>
                                <div class="flex-1 flex flex-col ml-2 overflow-hidden">
                                    <h4 class="text-textcolor font-bold text-lg mb-1 truncate">{char.name || "Unnamed"}</h4>
                                    <span class="text-textcolor2 text-sm line-clamp-2 flex-1">{parseMultilangString(char.desc)['en'] || parseMultilangString(char.desc)['xx'] || 'No description'}</span>
                                    <div class="flex gap-2 justify-end mt-auto">
                                        <button class="hover:text-textcolor text-textcolor2 p-1" onclick={() => {
                                            DBState.db.characters[char.index].trashTime = undefined
                                            checkCharOrder()
                                        }}>
                                            <Undo2Icon size={16} />
                                        </button>
                                        <button class="hover:text-textcolor text-textcolor2 p-1" onclick={() => {
                                            removeChar(char.index, char.name, 'permanent')
                                        }}>
                                            <TrashIcon size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        {:else if selected === 3}
            <MobileCharacters gridMode endGrid={endGrid} />
        {/if}
    </div>
</div>