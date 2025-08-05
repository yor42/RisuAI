<script lang="ts">
    import { characterFormatUpdate, removeChar } from "../../ts/characters";
    import { type Database } from "../../ts/storage/database.svelte";
    import { DBState } from 'src/ts/stores.svelte';
    import LazyAvatar from "./LazyAvatar.svelte";
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

    // 상수 정의
    const CONSTANTS = {
        AVATAR_SIZE: 56,
        AVATAR_MARGIN: 8,
        AVATAR_WIDTH: 64, // 56 + 8
        ROW_HEIGHT: 72, // 56 + 16
        LIST_ITEM_HEIGHT: 120,
        DEFAULT_ITEMS_PER_ROW: 6,
        DEFAULT_CONTAINER_HEIGHT: 600,
        CONTAINER_PADDING: 16,
        GRID_GAP: 8,
        SCROLL_THROTTLE: 16,
        TOUCH_THROTTLE: 8,
        TOUCH_END_DELAY: 50,
        STABILIZE_DELAY: 20,
        BUFFER_RATIO: 0.3,
        MIN_BUFFER: 1,
        MAX_BUFFER: 3,
        HEIGHT_CHANGE_THRESHOLD: 5,
        RESIZE_THRESHOLD: 1
    };

    // 스크롤 컨테이너들
    let gridScrollContainer: HTMLElement;
    let listScrollContainer: HTMLElement;
    let trashScrollContainer: HTMLElement;
    
    // Grid 모드 상태
    let gridContainerHeight = $state(CONSTANTS.DEFAULT_CONTAINER_HEIGHT);
    let gridScrollTop = $state(0);
    let actualRowHeight = $state(CONSTANTS.ROW_HEIGHT);
    let actualAvatarWidth = $state(CONSTANTS.AVATAR_WIDTH);
    let itemsPerRow = $state(CONSTANTS.DEFAULT_ITEMS_PER_ROW);
    let gridStartRow = $state(0);
    let gridEndRow = $state(0);
    let gridStartIndex = $state(0);
    let gridEndIndex = $state(0);
    let gridTotalHeight = $state(0);
    
    // List 모드 상태
    let listContainerHeight = $state(CONSTANTS.DEFAULT_CONTAINER_HEIGHT);
    let listScrollTop = $state(0);
    let listItemHeight = $state(CONSTANTS.LIST_ITEM_HEIGHT);
    let listVisibleCount = $state(0);
    let listStartIndex = $state(0);
    let listEndIndex = $state(0);
    let listTotalHeight = $state(0);
    
    // 캐시 및 성능 최적화
    let cachedChars: any[] = [];
    let lastSearch = '';
    let lastSelected = -1;
    let lastDbState: any = null;
    
    // 이벤트 처리
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let touchScrollTimer: ReturnType<typeof setTimeout> | null = null;
    let isTouching = $state(false);
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
        actualAvatarWidth = CONSTANTS.AVATAR_WIDTH;
    }

    // Grid 모드 전용 함수들 - 고정 크기 기반
    function calculateGridItemsPerRow() {
        if (gridScrollContainer && gridScrollContainer.clientWidth > 0) {
            setFixedAvatarDimensions();
            
            const containerWidth = gridScrollContainer.clientWidth;
            const availableWidth = containerWidth - CONSTANTS.CONTAINER_PADDING;
            const calculatedItems = Math.floor(availableWidth / actualAvatarWidth);
            
            return Math.max(1, calculatedItems);
        } else {
            return CONSTANTS.DEFAULT_ITEMS_PER_ROW;
        }
    }

    // 레이아웃 완전 리셋 함수
    function resetGridLayout() {
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
    }

    // itemsPerRow 업데이트 - 간단하고 효율적인 방식
    function updateItemsPerRowAndRecalculate() {
        const newItemsPerRow = calculateGridItemsPerRow();
        const oldItemsPerRow = itemsPerRow;
        
        // Row당 아바타 수가 실제로 변경된 경우에만 처리
        if (oldItemsPerRow !== newItemsPerRow) {
            itemsPerRow = newItemsPerRow;
        }
    }

    // Row 높이를 고정값으로 안정화 (Jittering 방지)
    function stabilizeRowHeight() {
        if (actualRowHeight !== CONSTANTS.ROW_HEIGHT) {
            actualRowHeight = CONSTANTS.ROW_HEIGHT;
        }
    }

    // 컨테이너 크기 변경 감지 및 재계산
    function handleContainerResize() {
        if (gridScrollContainer) {
            const rect = gridScrollContainer.getBoundingClientRect();
            
            if (rect.height > 0 && Math.abs(gridContainerHeight - rect.height) > CONSTANTS.HEIGHT_CHANGE_THRESHOLD) {
                gridContainerHeight = rect.height;
            }
            
            updateItemsPerRowAndRecalculate();
            
            setTimeout(() => {
                stabilizeRowHeight();
            }, CONSTANTS.STABILIZE_DELAY);
        }
    }

    function updateGridVirtualScrolling(chars: any[]) {
        if (itemsPerRow <= 0 || chars.length === 0) {
            gridTotalHeight = gridContainerHeight;
            resetGridIndices();
            return;
        }
        
        const totalRows = Math.ceil(chars.length / itemsPerRow);
        const exactVisibleRows = gridContainerHeight / actualRowHeight;
        const baseVisibleRows = Math.ceil(exactVisibleRows);
        const dynamicBuffer = Math.max(
            CONSTANTS.MIN_BUFFER,
            Math.min(CONSTANTS.MAX_BUFFER, Math.ceil(exactVisibleRows * CONSTANTS.BUFFER_RATIO))
        );
        const totalVisibleRows = baseVisibleRows + dynamicBuffer;
        
        gridStartRow = Math.max(0, Math.floor(gridScrollTop / actualRowHeight));
        gridEndRow = Math.min(gridStartRow + totalVisibleRows, totalRows);
        
        gridStartIndex = gridStartRow * itemsPerRow;
        gridEndIndex = Math.min(gridEndRow * itemsPerRow, chars.length);
        
        gridTotalHeight = totalRows * actualRowHeight;
        
        // 경계값 검증
        validateGridBounds(totalRows, chars.length);
    }

    function resetGridIndices() {
        gridStartRow = 0;
        gridEndRow = 0;
        gridStartIndex = 0;
        gridEndIndex = 0;
    }

    function validateGridBounds(totalRows: number, charsLength: number) {
        gridStartRow = Math.max(0, Math.min(gridStartRow, totalRows));
        gridEndRow = Math.max(gridStartRow, Math.min(gridEndRow, totalRows));
        gridStartIndex = Math.max(0, Math.min(gridStartIndex, charsLength));
        gridEndIndex = Math.max(gridStartIndex, Math.min(gridEndIndex, charsLength));
    }

    // Row 단위 데이터 생성 함수 - 안전성 강화
    function getVisibleGridRows(chars: any[]) {
        const rows = [];
        
        // 경계값 재검증
        const safeStartRow = Math.max(0, gridStartRow);
        const totalRows = Math.ceil(chars.length / Math.max(1, itemsPerRow));
        const safeEndRow = Math.min(gridEndRow, totalRows);
        
        for (let rowIndex = safeStartRow; rowIndex < safeEndRow; rowIndex++) {
            const startIdx = rowIndex * itemsPerRow;
            const endIdx = Math.min(startIdx + itemsPerRow, chars.length);
            
            // 유효한 인덱스 범위 확인
            if (startIdx < chars.length && startIdx >= 0) {
                const rowItems = chars.slice(startIdx, endIdx);
                
                if (rowItems.length > 0) {
                    rows.push({
                        rowIndex,
                        items: rowItems,
                        yPosition: rowIndex * actualRowHeight
                    });
                }
            }
        }
        
        return rows;
    }

    // List 모드 전용 함수들
    function updateListVirtualScrolling(chars: any[]) {
        if (chars.length === 0) {
            listTotalHeight = listContainerHeight;
            resetListIndices();
            return;
        }
        
        listVisibleCount = Math.ceil(listContainerHeight / listItemHeight) + 2;
        listStartIndex = Math.max(0, Math.floor(listScrollTop / listItemHeight));
        listEndIndex = Math.min(listStartIndex + listVisibleCount, chars.length);
        listTotalHeight = chars.length * listItemHeight;
        
        validateListBounds(chars.length);
    }

    function resetListIndices() {
        listStartIndex = 0;
        listEndIndex = 0;
    }

    function validateListBounds(charsLength: number) {
        listStartIndex = Math.max(0, listStartIndex);
        listEndIndex = Math.max(listStartIndex, Math.min(listEndIndex, charsLength));
    }


    // 통합된 터치 및 스크롤 이벤트 핸들러들
    function handleTouchStart(event: TouchEvent) {
        isTouching = true;
        lastTouchScrollTime = Date.now();
    }

    function handleTouchMove(event: TouchEvent) {
        if (!isTouching) return;
        
        const currentTime = Date.now();
        if (currentTime - lastTouchScrollTime > CONSTANTS.TOUCH_THROTTLE) {
            updateCurrentScrollPosition();
            updateCurrentVirtualScrolling();
            lastTouchScrollTime = currentTime;
        }
    }

    function handleTouchEnd(event: TouchEvent) {
        isTouching = false;
        
        if (touchScrollTimer) {
            clearTimeout(touchScrollTimer);
        }
        
        touchScrollTimer = setTimeout(() => {
            updateCurrentScrollPosition();
            updateCurrentVirtualScrolling();
            touchScrollTimer = null;
        }, CONSTANTS.TOUCH_END_DELAY);
    }

    function handleScroll(event: Event) {
        const target = event.target as HTMLElement;
        
        if (selected === 0) {
            gridScrollTop = target.scrollTop;
        } else {
            listScrollTop = target.scrollTop;
        }
        
        if (isTouching) {
            updateCurrentVirtualScrolling();
            return;
        }
        
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
        }
        
        throttleTimer = setTimeout(() => {
            updateCurrentVirtualScrolling();
            throttleTimer = null;
        }, CONSTANTS.SCROLL_THROTTLE);
    }

    // 현재 모드에 따른 스크롤 위치 업데이트
    function updateCurrentScrollPosition() {
        const container = getCurrentScrollContainer();
        if (!container) return;
        
        if (selected === 0) {
            gridScrollTop = container.scrollTop;
        } else {
            listScrollTop = container.scrollTop;
        }
    }

    // 현재 모드에 따른 Virtual Scrolling 업데이트
    function updateCurrentVirtualScrolling() {
        if (selected === 0) {
            const chars = getCachedChars(search, DBState.db);
            updateGridVirtualScrolling(chars);
        } else {
            const chars = selected === 2 ?
                getCachedChars(search, DBState.db, true) :
                getCachedChars(search, DBState.db);
            updateListVirtualScrolling(chars);
        }
    }


    // 현재 모드에 따른 스크롤 컨테이너 반환
    function getCurrentScrollContainer() {
        return selected === 0 ? gridScrollContainer :
               selected === 1 ? listScrollContainer :
               selected === 2 ? trashScrollContainer :
               null;
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
            currentResizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const newWidth = entry.contentRect.width;
                    const newHeight = entry.contentRect.height;
                    const currentHeight = getCurrentContainerHeight();

                    // Height 변화 처리
                    if (newHeight > 0 && Math.abs(currentHeight - newHeight) > CONSTANTS.RESIZE_THRESHOLD) {
                        setCurrentContainerHeight(newHeight);
                    }
                    
                    // Grid 모드에서 Width 변화를 감지해서 itemsPerRow 재계산
                    if (selected === 0 && newWidth > 0) {
                        // 즉시 및 requestAnimationFrame 이중 처리로 완전한 리셋까지 수행
                        const forceCalculationAndReset = () => {
                            if (selected === 0 && gridScrollContainer) {
                                const newItemsPerRow = calculateGridItemsPerRow();
                                const oldItemsPerRow = itemsPerRow;
                                
                                if (newItemsPerRow !== oldItemsPerRow) {
                                    itemsPerRow = newItemsPerRow;
                                    
                                    // 바로 리셋 및 재계산 수행 (중복 처리 방지)
                                    resetGridLayout();
                                    const chars = getCachedChars(search, DBState.db);
                                    updateGridVirtualScrolling(chars);
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
                onscroll={handleScroll}
                ontouchstart={handleTouchStart}
                ontouchmove={handleTouchMove}
                ontouchend={handleTouchEnd}
                style="touch-action: pan-y; -webkit-overflow-scrolling: touch; height: 100%;"
            >
                <div style="height: {gridTotalHeight}px; position: relative; min-height: 100%;">
                    {#each getVisibleGridRows(getCachedChars(search, DBState.db)) as row (row.rowIndex)}
                        <div
                            class="absolute w-full flex justify-center grid-row"
                            style="transform: translateY({row.yPosition}px); height: {actualRowHeight}px;"
                        >
                            <div class="flex flex-wrap gap-2 w-full justify-center items-center h-full px-2">
                                {#each row.items as char, itemIndex}
                                    <div class="flex items-center text-textcolor">
                                        <LazyAvatar
                                            image={char.image}
                                            index={char.index}
                                            onClick={() => {changeChar(char.index)}}
                                            size={CONSTANTS.AVATAR_SIZE}
                                            isSelected={char.index === $selectedCharID}
                                            type={char.type}
                                        />
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
                onscroll={handleScroll}
                ontouchstart={handleTouchStart}
                ontouchmove={handleTouchMove}
                ontouchend={handleTouchEnd}
                style="touch-action: pan-y; -webkit-overflow-scrolling: touch;"
            >
                <div style="height: {listTotalHeight}px; position: relative;">
                    <div style="transform: translateY({listStartIndex * listItemHeight}px);">
                        {#each getCachedChars(search, DBState.db).slice(listStartIndex, listEndIndex) as char, listItemIndex}
                            <div class="flex p-2 border border-darkborderc rounded-md mb-2" style="min-height: {listItemHeight - 8}px;">
                                <LazyAvatar
                                    image={char.image}
                                    index={char.index}
                                    onClick={() => {changeChar(char.index)}}
                                    size={CONSTANTS.AVATAR_SIZE}
                                    isSelected={char.index === $selectedCharID}
                                    type={char.type}
                                />
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
                onscroll={handleScroll}
                ontouchstart={handleTouchStart}
                ontouchmove={handleTouchMove}
                ontouchend={handleTouchEnd}
                style="touch-action: pan-y; -webkit-overflow-scrolling: touch;"
            >
                <div style="height: {listTotalHeight}px; position: relative;">
                    <div style="transform: translateY({listStartIndex * listItemHeight}px);">
                        {#each getCachedChars(search, DBState.db, true).slice(listStartIndex, listEndIndex) as char, trashItemIndex}
                            <div class="flex p-2 border border-darkborderc rounded-md mb-2" style="min-height: {listItemHeight - 8}px;">
                                <LazyAvatar
                                    image={char.image}
                                    index={char.index}
                                    onClick={() => {changeChar(char.index)}}
                                    size={CONSTANTS.AVATAR_SIZE}
                                    isSelected={char.index === $selectedCharID}
                                    type={char.type}
                                />
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