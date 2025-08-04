<!-- Virtual Scrolling Component for Svelte 5 with Enhanced Features -->
<div
    bind:this={containerElement}
    class="virtual-scroll-container {className}"
    class:touch-drag-enabled={supportTouchDrag}
    class:touch-dragging={touchDragData?.isDragging}
    style="height: {containerHeight}px; overflow: auto; position: relative;"
    onscroll={handleScroll}
    onmousemove={allowDragScroll ? handleDragAutoScroll : undefined}
>
    <!-- Total height placeholder to maintain scrollbar -->
    <div 
        class="virtual-scroll-spacer" 
        style="height: {totalHeight}px; position: relative;"
    >
        <!-- Rendered items container -->
        <div 
            class="virtual-scroll-content"
            style="position: absolute; top: {offsetY}px; left: 0; right: 0;"
        >
            {#each visibleItems as item, index (item.index)}
                <div 
                    class="virtual-scroll-item"
                    style="position: relative;"
                    bind:this={itemElements[item.index]}
                    data-index={item.index}
                    data-virtual-index={index}
                >
                    {@render children?.(item.data, item.index)}
                </div>
            {/each}
        </div>
    </div>
</div>

<script lang="ts">
    import { untrack } from 'svelte';
    
    interface VirtualItem<T = any> {
        data: T;
        index: number;
        height?: number;
        top?: number;
    }

    interface Props<T = any> {
        items: T[];
        itemHeight: number;
        containerHeight: number;
        overscan?: number;
        className?: string;
        children?: import('svelte').Snippet<[T, number]>;
        onScroll?: (scrollTop: number, scrollDirection: 'up' | 'down') => void;
        scrollDisabled?: boolean;
        allowDragScroll?: boolean;
        dragScrollZone?: number;
        // 터치 드래그 관련 속성들
        supportTouchDrag?: boolean;
        longPressDelay?: number;
        onTouchDragStart?: (data: any, element: HTMLElement) => void;
        onTouchDragMove?: (data: any, x: number, y: number) => void;
        onTouchDrop?: (sourceData: any, targetData: any) => void;
    }

    let {
        items = [],
        itemHeight = 50,
        containerHeight = 400,
        overscan = 5,
        className = "",
        children,
        onScroll,
        scrollDisabled = false,
        allowDragScroll = false,
        dragScrollZone = 30,
        // 터치 드래그 관련 속성들
        supportTouchDrag = true,
        longPressDelay = 500,
        onTouchDragStart,
        onTouchDragMove,
        onTouchDrop
    }: Props = $props();

    // Reactive state using Svelte 5 runes
    let containerElement: HTMLDivElement | undefined = $state();
    let itemElements: (HTMLDivElement | undefined)[] = $state([]);
    let scrollTop = $state(0);
    let lastScrollTop = $state(0);
    let itemHeights = $state(new Map<number, number>());
    let itemTops = $state(new Map<number, number>());
    let isScrolling = $state(false);
    let isRecalculating = $state(false);
    let preservedScrollTop = $state<number | null>(null);
    let preservedItemHeights = $state(new Map<number, number>());
    let scrollTimeout: NodeJS.Timeout | undefined = $state();
    let scrollThrottleTimer: NodeJS.Timeout | undefined = $state();
    let isDragging = $state(false);
    let dragAutoScrollTimer: NodeJS.Timeout | undefined = $state();

    // 터치 드래그 관련 상태 변수들
    let touchDragData: {
        element: HTMLElement;
        data: any;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
        isDragging: boolean;
    } | null = $state(null);
    let touchPreviewElement: HTMLElement | null = $state(null);
    let longPressTimeout: NodeJS.Timeout | undefined = $state();
    let touchScrollDisabled = $state(false);

    // Track previous items to detect changes
    let previousItems: any[] = $state([]);

    // Derived values
    let totalHeight = $derived.by(() => {
        if (items.length === 0) return 0;
        
        // Calculate total height based on measured heights or estimated height
        let height = 0;
        for (let i = 0; i < items.length; i++) {
            height += itemHeights.get(i) || itemHeight;
        }
        return height;
    });

    let visibleRange = $derived.by(() => {
        if (items.length === 0) return { start: 0, end: 0 };

        let start = 0;
        let end = 0;
        let currentTop = 0;
        
        // Find start index
        for (let i = 0; i < items.length; i++) {
            const height = itemHeights.get(i) || itemHeight;
            if (currentTop + height > scrollTop) {
                start = Math.max(0, i - overscan);
                break;
            }
            currentTop += height;
        }

        // Find end index
        currentTop = 0;
        for (let i = 0; i < items.length; i++) {
            const height = itemHeights.get(i) || itemHeight;
            if (i >= start) {
                itemTops.set(i, currentTop);
            }
            currentTop += height;
            if (currentTop > scrollTop + containerHeight) {
                end = Math.min(items.length, i + 1 + overscan);
                break;
            }
        }

        if (end === 0) end = items.length;

        return { start, end };
    });

    let visibleItems = $derived.by(() => {
        const range = visibleRange;
        const result: VirtualItem[] = [];
        
        for (let i = range.start; i < range.end; i++) {
            if (i >= 0 && i < items.length) {
                result.push({
                    data: items[i],
                    index: i,
                    height: itemHeights.get(i),
                    top: itemTops.get(i)
                });
            }
        }
        
        return result;
    });

    let offsetY = $derived.by(() => {
        const range = visibleRange;
        if (range.start === 0) return 0;
        
        let offset = 0;
        for (let i = 0; i < range.start; i++) {
            offset += itemHeights.get(i) || itemHeight;
        }
        return offset;
    });

    // Handle scroll events with optimized performance
    function handleScroll(event: Event) {
        // 드래그 중일 때 사용자 스크롤 차단 (자동 스크롤은 허용)
        if ((scrollDisabled && !isDragging) || touchScrollDisabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        
        // 재계산 중일 때 스크롤 이벤트 무시 (성능 최적화)
        if (isRecalculating) {
            return;
        }
        
        if (scrollThrottleTimer) {
            return;
        }
        
        scrollThrottleTimer = setTimeout(() => {
            const target = event.target as HTMLElement;
            const newScrollTop = target.scrollTop;
            const direction = newScrollTop > lastScrollTop ? 'down' : 'up';
            
            scrollTop = newScrollTop;
            lastScrollTop = newScrollTop;
            isScrolling = true;
            
            // Call onScroll callback if provided
            onScroll?.(newScrollTop, direction);
            
            // Clear existing timeout
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            
            // Set scrolling to false after scroll ends
            scrollTimeout = setTimeout(() => {
                isScrolling = false;
                // 🔧 스크롤 리셋 방지: 스크롤 위치 보존 후 measureItems 실행
                if (!isRecalculating && containerElement) {
                    const preservedScroll = containerElement.scrollTop;
                    measureItems();
                    // 측정 후 스크롤 위치가 변경되었다면 복원
                    requestAnimationFrame(() => {
                        if (containerElement && Math.abs(containerElement.scrollTop - preservedScroll) > 5) {
                            console.log('🔧 [SCROLL RESET FIX] 스크롤 위치 복원:', {
                                preserved: preservedScroll,
                                current: containerElement.scrollTop,
                                direction: direction
                            });
                            containerElement.scrollTop = preservedScroll;
                        }
                    });
                }
            }, 150);
            
            // Reset throttle timer
            scrollThrottleTimer = undefined;
        }, 8); // 120fps for smooth scrolling
    }

    // Handle drag auto scroll - exported for external use
    export function handleDragAutoScroll(event: MouseEvent) {
        if (!allowDragScroll || !isDragging || !containerElement) return;

        const rect = containerElement.getBoundingClientRect();
        const mouseY = event.clientY - rect.top;
        const scrollSpeed = 5;
        
        // Clear existing auto scroll timer
        if (dragAutoScrollTimer) {
            clearTimeout(dragAutoScrollTimer);
        }

        // Check if mouse is in drag scroll zones
        if (mouseY < dragScrollZone) {
            // Scroll up
            dragAutoScrollTimer = setTimeout(() => {
                if (containerElement && isDragging) {
                    containerElement.scrollTop = Math.max(0, containerElement.scrollTop - scrollSpeed);
                    handleDragAutoScroll(event);
                }
            }, 16);
        } else if (mouseY > containerHeight - dragScrollZone) {
            // Scroll down
            dragAutoScrollTimer = setTimeout(() => {
                if (containerElement && isDragging) {
                    const maxScroll = totalHeight - containerHeight;
                    containerElement.scrollTop = Math.min(maxScroll, containerElement.scrollTop + scrollSpeed);
                    handleDragAutoScroll(event);
                }
            }, 16);
        }
    }

    // 터치 이벤트 핸들러들 - non-passive 모드로 등록
    function handleTouchStart(event: TouchEvent, itemData?: any) {
        console.log('🔍 [VIRTUAL SCROLL TOUCH] Touch start 이벤트 발생');
        
        if (!supportTouchDrag || touchDragData) return;

        const touch = event.touches[0];
        const target = event.currentTarget as HTMLElement;
        
        // 터치 데이터 초기화
        touchDragData = {
            element: target,
            data: itemData,
            startX: touch.clientX,
            startY: touch.clientY,
            currentX: touch.clientX,
            currentY: touch.clientY,
            isDragging: false
        };

        // 길게 터치 타이머 시작
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
        }
        
        longPressTimeout = setTimeout(() => {
            if (touchDragData && !touchDragData.isDragging) {
                startTouchDrag();
                // 햅틱 피드백 (가능한 경우)
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            }
        }, longPressDelay);

        // 다른 터치 이벤트 방지 - non-passive에서만 작동
        try {
            event.preventDefault();
            console.log('🔍 [VIRTUAL SCROLL TOUCH] preventDefault 성공 (Touch Start)');
        } catch (error) {
            console.error('🔍 [VIRTUAL SCROLL TOUCH] preventDefault 실패 (Touch Start):', error);
        }
    }

    function handleTouchMove(event: TouchEvent) {
        console.log('🔍 [VIRTUAL SCROLL TOUCH] Touch move 이벤트 발생');
        
        if (!touchDragData) return;

        const touch = event.touches[0];
        const moveThreshold = 10; // 픽셀 단위 이동 임계값

        // 터치 위치 업데이트
        touchDragData.currentX = touch.clientX;
        touchDragData.currentY = touch.clientY;

        // 이동 거리 계산
        const deltaX = Math.abs(touch.clientX - touchDragData.startX);
        const deltaY = Math.abs(touch.clientY - touchDragData.startY);

        // 이동 임계값을 초과하면 길게 터치 타이머 취소
        if ((deltaX > moveThreshold || deltaY > moveThreshold) && longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = undefined;
        }

        // 드래그 중이면 미리보기 위치 업데이트
        if (touchDragData.isDragging) {
            updateTouchPreview(touch.clientX, touch.clientY);
            
            // 자동 스크롤 처리
            handleTouchAutoScroll(touch.clientY);
            
            // 콜백 호출
            onTouchDragMove?.(touchDragData.data, touch.clientX, touch.clientY);
            
            console.log('🔍 [VIRTUAL SCROLL TOUCH] 드래그 중 - 미리보기 업데이트 완료');
        }

        // 브라우저 기본 터치 동작 방지 - non-passive에서만 작동
        try {
            event.preventDefault();
            console.log('🔍 [VIRTUAL SCROLL TOUCH] preventDefault 성공 (Touch Move)');
        } catch (error) {
            console.error('🔍 [VIRTUAL SCROLL TOUCH] preventDefault 실패 (Touch Move):', error);
        }
    }

    function handleTouchEnd(event: TouchEvent) {
        console.log('🔍 [VIRTUAL SCROLL TOUCH] Touch end 이벤트 발생');
        
        if (!touchDragData) return;

        // 길게 터치 타이머 정리
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = undefined;
        }

        if (touchDragData.isDragging) {
            // 드롭 처리
            const touch = event.changedTouches[0];
            handleTouchDrop(touch.clientX, touch.clientY);
            console.log('🔍 [VIRTUAL SCROLL TOUCH] 터치 드롭 처리 완료');
        }

        // 터치 드래그 상태 정리
        cleanupTouchDrag();
        
        try {
            event.preventDefault();
            console.log('🔍 [VIRTUAL SCROLL TOUCH] preventDefault 성공 (Touch End)');
        } catch (error) {
            console.error('🔍 [VIRTUAL SCROLL TOUCH] preventDefault 실패 (Touch End):', error);
        }
    }

    function handleTouchCancel(event: TouchEvent) {
        console.log('🔍 [VIRTUAL SCROLL TOUCH] Touch cancel 이벤트 발생');
        
        // 길게 터치 타이머 정리
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = undefined;
        }

        // 터치 드래그 상태 정리
        cleanupTouchDrag();
        
        try {
            event.preventDefault();
            console.log('🔍 [VIRTUAL SCROLL TOUCH] preventDefault 성공 (Touch Cancel)');
        } catch (error) {
            console.error('🔍 [VIRTUAL SCROLL TOUCH] preventDefault 실패 (Touch Cancel):', error);
        }
    }

    // 터치 드래그 시작
    function startTouchDrag() {
        if (!touchDragData) return;

        touchDragData.isDragging = true;
        isDragging = true;
        touchScrollDisabled = true;

        // 드래그 미리보기 생성
        createTouchPreview();
        
        // 콜백 호출
        onTouchDragStart?.(touchDragData.data, touchDragData.element);
    }

    // 터치 드래그 미리보기 생성
    function createTouchPreview() {
        if (!touchDragData || touchPreviewElement) return;

        const originalElement = touchDragData.element;
        const clone = originalElement.cloneNode(true) as HTMLElement;
        
        // 미리보기 스타일 설정
        clone.style.position = 'fixed';
        clone.style.zIndex = '9999';
        clone.style.pointerEvents = 'none';
        clone.style.opacity = '0.8';
        clone.style.transform = 'scale(1.05)';
        clone.style.transition = 'none';
        clone.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        clone.style.border = '2px solid rgba(59, 130, 246, 0.5)';
        clone.style.borderRadius = '8px';
        clone.classList.add('touch-drag-preview');
        
        // 초기 위치 설정
        updateTouchPreviewPosition(clone, touchDragData.currentX, touchDragData.currentY);
        
        // DOM에 추가
        document.body.appendChild(clone);
        touchPreviewElement = clone;
    }

    // 터치 미리보기 위치 업데이트
    function updateTouchPreview(x: number, y: number) {
        if (touchPreviewElement) {
            updateTouchPreviewPosition(touchPreviewElement, x, y);
        }
    }

    function updateTouchPreviewPosition(element: HTMLElement, x: number, y: number) {
        const rect = element.getBoundingClientRect();
        element.style.left = `${x - rect.width / 2}px`;
        element.style.top = `${y - rect.height / 2}px`;
    }

    // 터치 자동 스크롤 처리
    function handleTouchAutoScroll(clientY: number) {
        if (!allowDragScroll || !containerElement) return;

        const rect = containerElement.getBoundingClientRect();
        const relativeY = clientY - rect.top;
        const scrollSpeed = 5;

        // 자동 스크롤 영역 체크
        if (relativeY < dragScrollZone) {
            // 위로 스크롤
            containerElement.scrollTop = Math.max(0, containerElement.scrollTop - scrollSpeed);
        } else if (relativeY > containerHeight - dragScrollZone) {
            // 아래로 스크롤
            const maxScroll = totalHeight - containerHeight;
            containerElement.scrollTop = Math.min(maxScroll, containerElement.scrollTop + scrollSpeed);
        }
    }

    // 터치 드롭 처리
    function handleTouchDrop(x: number, y: number) {
        if (!touchDragData) return;

        // elementFromPoint로 드롭 대상 찾기
        const elementsBelow = document.elementsFromPoint(x, y);
        let dropTarget: HTMLElement | null = null;
        let dropData: any = null;

        // 드롭 가능한 요소 찾기 (spacer 또는 다른 드래그 가능 요소)
        for (const element of elementsBelow) {
            const htmlElement = element as HTMLElement;
            
            // 자신은 제외
            if (htmlElement === touchDragData.element || htmlElement === touchPreviewElement) {
                continue;
            }

            // 스페이서 또는 가상 스크롤 아이템 찾기
            if (htmlElement.classList.contains('virtual-scroll-item') ||
                htmlElement.dataset.index !== undefined ||
                htmlElement.dataset.virtualIndex !== undefined) {
                dropTarget = htmlElement;
                // 데이터 추출 로직 (Sidebar.svelte의 패턴 참조)
                const index = htmlElement.dataset.index;
                const virtualIndex = htmlElement.dataset.virtualIndex;
                if (index !== undefined) {
                    dropData = { index: parseInt(index) };
                }
                break;
            }
        }

        // 드롭 콜백 호출
        if (dropTarget && dropData) {
            onTouchDrop?.(touchDragData.data, dropData);
        }
    }

    // 터치 드래그 상태 정리
    function cleanupTouchDrag() {
        // 미리보기 요소 제거
        if (touchPreviewElement) {
            touchPreviewElement.remove();
            touchPreviewElement = null;
        }

        // 상태 초기화
        touchDragData = null;
        isDragging = false;
        touchScrollDisabled = false;

        // 타이머 정리
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = undefined;
        }
    }

    // Measure item heights for variable height support
    function measureItems() {
        if (!containerElement || isRecalculating) return;
        
        isRecalculating = true;
        
        const itemNodes = containerElement.querySelectorAll('.virtual-scroll-item');
        let heightsChanged = false;
        
        itemNodes.forEach((node) => {
            const element = node as HTMLElement;
            const index = parseInt(element.dataset.index || '0');
            const currentHeight = itemHeights.get(index);
            const measuredHeight = element.offsetHeight;
            
            if (currentHeight !== measuredHeight) {
                itemHeights.set(index, measuredHeight);
                heightsChanged = true;
            }
        });
        
        // Recalculate item positions if heights changed
        if (heightsChanged) {
            recalculatePositions();
        }
        
        isRecalculating = false;
    }

    // Recalculate item positions - 스크롤 리셋 방지 강화
    function recalculatePositions() {
        if (isScrolling) {
            console.log('🔧 [RECALC SKIP] 스크롤 중이므로 위치 재계산 스킵');
            return; // 스크롤 중일 때는 재계산하지 않음
        }
        
        console.log('🔧 [RECALC START] 아이템 위치 재계산 시작:', {
            itemsLength: items.length,
            currentScrollTop: containerElement?.scrollTop,
            isScrolling,
            isRecalculating
        });
        
        let currentTop = 0;
        for (let i = 0; i < items.length; i++) {
            itemTops.set(i, currentTop);
            currentTop += itemHeights.get(i) || itemHeight;
        }
        
        console.log('🔧 [RECALC END] 아이템 위치 재계산 완료:', {
            totalHeight: currentTop,
            scrollTopAfter: containerElement?.scrollTop
        });
    }

    // Preserve scroll position when items change
    function preserveScrollPosition() {
        if (containerElement) {
            preservedScrollTop = containerElement.scrollTop;
            preservedItemHeights = new Map(itemHeights);
        }
    }

    // Restore scroll position after items change
    function restoreScrollPosition() {
        if (preservedScrollTop !== null && containerElement) {
            // 유효한 기존 측정값들을 복원
            for (const [index, height] of preservedItemHeights) {
                if (index < items.length) {
                    itemHeights.set(index, height);
                }
            }
            
            // 위치 재계산
            recalculatePositions();
            
            // 스크롤 위치 복원
            requestAnimationFrame(() => {
                if (containerElement && preservedScrollTop !== null) {
                    containerElement.scrollTop = preservedScrollTop;
                    scrollTop = preservedScrollTop;
                }
            });
            
            preservedScrollTop = null;
        }
    }

    // Items change detection - 단순화된 버전 (성능 문제 해결)
    $effect(() => {
        // 단순한 items 변경 감지만 수행 - 스크롤 위치 조작 제거
        if (items.length !== previousItems.length) {
            // 아이템 수가 변경된 경우에만 높이 정보 초기화
            itemHeights.clear();
            itemTops.clear();
            
            // 안전한 방식으로 previousItems 업데이트
            untrack(() => {
                previousItems = [...items];
            });
        }
    });

    // Safe effect - maintain basic functionality
    $effect(() => {
        if (visibleItems.length > 0 && !isRecalculating) {
            // DOM 업데이트 후 높이 측정
            requestAnimationFrame(() => {
                measureItems();
            });
        }
    });

    // Container height change handling - 스크롤 리셋 방지 개선
    $effect(() => {
        if (containerElement && containerHeight > 0) {
            const currentScroll = containerElement.scrollTop;
            const isUserScrolling = isScrolling; // 사용자가 스크롤 중인지 확인
            
            requestAnimationFrame(() => {
                if (!isRecalculating && !isUserScrolling) {
                    console.log('🔧 [CONTAINER HEIGHT] 컨테이너 높이 변경으로 measureItems 실행:', {
                        currentScroll,
                        containerHeight,
                        isScrolling: isUserScrolling
                    });
                    measureItems();
                }
                
                // 🔧 사용자 스크롤 중이 아닐 때만 위치 복원
                if (containerElement && !isUserScrolling) {
                    const newScroll = containerElement.scrollTop;
                    if (Math.abs(newScroll - currentScroll) > 5) {
                        console.log('🔧 [CONTAINER HEIGHT] 스크롤 위치 복원:', {
                            previous: currentScroll,
                            current: newScroll
                        });
                        containerElement.scrollTop = currentScroll;
                    }
                }
            });
        }
    });

    // Tooltip cleanup function
    function cleanupOrphanedTooltips() {
        const tooltipElements = document.querySelectorAll('[data-tippy-root]');
        tooltipElements.forEach((tooltip) => {
            const reference = (tooltip as any)._tippy?.reference;
            if (reference && !containerElement?.contains(reference)) {
                const tippyInstance = (reference as any)._tippy;
                if (tippyInstance) {
                    tippyInstance.destroy();
                }
            }
        });
    }

    // Scroll to specific item
    function scrollToItem(index: number, alignment: 'start' | 'center' | 'end' = 'start') {
        if (!containerElement || index < 0 || index >= items.length) return;
        
        let targetScrollTop = itemTops.get(index) || 0;
        
        if (alignment === 'center') {
            const currentItemHeight = itemHeights.get(index) || itemHeight;
            targetScrollTop -= (containerHeight - currentItemHeight) / 2;
        } else if (alignment === 'end') {
            const currentItemHeight = itemHeights.get(index) || itemHeight;
            targetScrollTop -= containerHeight - currentItemHeight;
        }
        
        const totalHeightValue = totalHeight;
        targetScrollTop = Math.max(0, Math.min(targetScrollTop, totalHeightValue - containerHeight));
        containerElement.scrollTop = targetScrollTop;
    }

    // Scroll to specific offset
    function scrollToOffset(offset: number) {
        if (!containerElement) return;
        const totalHeightValue = totalHeight;
        containerElement.scrollTop = Math.max(0, Math.min(offset, totalHeightValue - containerHeight));
    }

    // Export functions for external use
    export function getScrollElement() {
        return containerElement;
    }

    export function scrollTo(indexOrOffset: number, alignment?: 'start' | 'center' | 'end') {
        if (typeof indexOrOffset === 'number' && indexOrOffset >= 0 && indexOrOffset < items.length) {
            scrollToItem(indexOrOffset, alignment);
        } else {
            scrollToOffset(indexOrOffset);
        }
    }

    export function getVisibleRange() {
        return visibleRange;
    }

    export function forceUpdate() {
        if (!isRecalculating) {
            measureItems();
        }
    }

    export function cleanupTooltips() {
        cleanupOrphanedTooltips();
    }

    // Drag state management functions
    export function setDragging(dragging: boolean) {
        isDragging = dragging;
        if (!dragging && dragAutoScrollTimer) {
            clearTimeout(dragAutoScrollTimer);
            dragAutoScrollTimer = undefined;
        }
    }

    export function getDragging() {
        return isDragging;
    }


    // 터치 드래그 관련 export 함수들
    export function getTouchDragging() {
        return touchDragData?.isDragging || false;
    }

    export function cancelTouchDrag() {
        cleanupTouchDrag();
    }

    export function setTouchDragSupport(enabled: boolean) {
        supportTouchDrag = enabled;
    }

    // 터치 이벤트 핸들러들을 외부에서 사용할 수 있도록 export
    export function getTouchHandlers() {
        return {
            handleTouchStart,
            handleTouchMove,
            handleTouchEnd,
            handleTouchCancel
        };
    }

    // Non-passive 터치 이벤트 리스너 등록을 위한 $effect
    $effect(() => {
        if (!containerElement || !supportTouchDrag) return;

        console.log('🔍 [VIRTUAL SCROLL SETUP] Non-passive 터치 이벤트 리스너 등록');

        // Non-passive 터치 이벤트 리스너 등록
        const touchStartHandler = (event: TouchEvent) => handleTouchStart(event);
        const touchMoveHandler = (event: TouchEvent) => handleTouchMove(event);
        const touchEndHandler = (event: TouchEvent) => handleTouchEnd(event);
        const touchCancelHandler = (event: TouchEvent) => handleTouchCancel(event);

        // passive: false로 명시적으로 non-passive 모드 설정
        containerElement.addEventListener('touchstart', touchStartHandler, { passive: false });
        containerElement.addEventListener('touchmove', touchMoveHandler, { passive: false });
        containerElement.addEventListener('touchend', touchEndHandler, { passive: false });
        containerElement.addEventListener('touchcancel', touchCancelHandler, { passive: false });

        console.log('🔍 [VIRTUAL SCROLL SETUP] Non-passive 터치 이벤트 리스너 등록 완료');

        // 정리 함수
        return () => {
            console.log('🔍 [VIRTUAL SCROLL SETUP] 터치 이벤트 리스너 정리');
            containerElement?.removeEventListener('touchstart', touchStartHandler);
            containerElement?.removeEventListener('touchmove', touchMoveHandler);
            containerElement?.removeEventListener('touchend', touchEndHandler);
            containerElement?.removeEventListener('touchcancel', touchCancelHandler);
        };
    });

    // Component cleanup
    $effect(() => {
        return () => {
            cleanupOrphanedTooltips();
            cleanupTouchDrag(); // 터치 드래그 상태 정리 추가
            if (scrollTimeout) clearTimeout(scrollTimeout);
            if (scrollThrottleTimer) clearTimeout(scrollThrottleTimer);
            if (dragAutoScrollTimer) clearTimeout(dragAutoScrollTimer);
        };
    });
</script>

<style>
    .virtual-scroll-container {
        /* Ensure proper scrolling behavior */
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        /* Hardware acceleration for better performance */
        transform: translateZ(0);
        will-change: scroll-position;
        /* GPU 레이어 분리로 스크롤 성능 향상 */
        contain: layout style paint;
        /* 드래그 중 텍스트 선택 방지 */
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
    }

    .virtual-scroll-container::-webkit-scrollbar {
        width: 8px;
    }

    .virtual-scroll-container::-webkit-scrollbar-track {
        background: transparent;
    }

    .virtual-scroll-container::-webkit-scrollbar-thumb {
        background-color: rgba(156, 163, 175, 0.5);
        border-radius: 4px;
    }

    .virtual-scroll-container::-webkit-scrollbar-thumb:hover {
        background-color: rgba(156, 163, 175, 0.7);
    }

    .virtual-scroll-spacer {
        /* Maintain proper layout for absolute positioning */
        min-height: 1px;
    }

    .virtual-scroll-content {
        /* Container for visible items */
        will-change: transform;
        /* GPU 가속을 위한 최적화 */
        transform: translateZ(0);
        backface-visibility: hidden;
    }

    .virtual-scroll-item {
        /* Individual item styling */
        contain: layout style paint;
        will-change: transform;
        /* 개별 아이템 GPU 레이어 분리 */
        transform: translateZ(0);
        backface-visibility: hidden;
        /* 드래그 중 부드러운 전환 */
        transition: transform 0.1s ease-out;
    }

    /* Support for drag and drop */
    .virtual-scroll-item[draggable="true"] {
        cursor: grab;
    }

    .virtual-scroll-item[draggable="true"]:active {
        cursor: grabbing;
    }

    /* Drag scroll zones visual feedback */
    .virtual-scroll-container.drag-scroll-active::before,
    .virtual-scroll-container.drag-scroll-active::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        height: var(--drag-scroll-zone, 30px);
        pointer-events: none;
        z-index: 1000;
        background: linear-gradient(to bottom, rgba(59, 130, 246, 0.1), transparent);
        opacity: 0;
        transition: opacity 0.2s ease;
    }

    .virtual-scroll-container.drag-scroll-active::before {
        top: 0;
    }

    .virtual-scroll-container.drag-scroll-active::after {
        bottom: 0;
        transform: rotate(180deg);
    }

    .virtual-scroll-container.drag-scroll-active:hover::before,
    .virtual-scroll-container.drag-scroll-active:hover::after {
        opacity: 1;
    }

    /* Support for tooltips */
    .virtual-scroll-item[data-tooltip] {
        position: relative;
    }

    /* 스크롤 중 최적화를 위한 스타일 */
    .virtual-scroll-container.scrolling .virtual-scroll-item {
        pointer-events: none;
    }

    /* 재계산 중일 때 시각적 피드백 */
    .virtual-scroll-container.recalculating {
        opacity: 0.95;
    }

    /* 터치 드래그 관련 스타일 */
    .virtual-scroll-container.touch-drag-enabled {
        touch-action: none; /* 터치 제스처 방지 */
    }

    .virtual-scroll-container.touch-dragging {
        overflow: hidden; /* 드래그 중 스크롤 방지 */
        user-select: none; /* 텍스트 선택 방지 */
    }

    /* 터치 드래그 미리보기 스타일 */
    :global(.touch-drag-preview) {
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        filter: brightness(1.1);
        transform-origin: center;
        transition: transform 0.1s ease-out, opacity 0.1s ease-out;
    }

    /* 터치 드래그 중인 원본 요소 스타일 */
    .virtual-scroll-container.touch-dragging .virtual-scroll-item {
        transition: opacity 0.2s ease-out;
    }

    /* 터치 드래그 활성화 시 아이템 호버 효과 */
    .virtual-scroll-container.touch-drag-enabled .virtual-scroll-item:active {
        background-color: rgba(59, 130, 246, 0.05);
        transform: scale(0.98);
        transition: all 0.1s ease-out;
    }

    /* 터치 드래그 활성화 표시 */
    .virtual-scroll-container.touch-drag-enabled::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: -1;
        background: linear-gradient(
            135deg,
            rgba(59, 130, 246, 0.02) 0%,
            transparent 50%,
            rgba(59, 130, 246, 0.02) 100%
        );
        opacity: 0;
        transition: opacity 0.3s ease;
    }

    .virtual-scroll-container.touch-drag-enabled:hover::after {
        opacity: 1;
    }

    /* 모바일 최적화 */
    @media (hover: none) and (pointer: coarse) {
        .virtual-scroll-container.touch-drag-enabled {
            -webkit-overflow-scrolling: auto; /* iOS 스크롤 최적화 해제 */
        }
        
        .virtual-scroll-container.touch-drag-enabled .virtual-scroll-item {
            -webkit-touch-callout: none; /* iOS 길게 누르기 메뉴 방지 */
            -webkit-user-select: none;
        }
    }

    /* 드래그 가능 영역 시각적 피드백 (디버그용) */
    .virtual-scroll-container.touch-drag-enabled.debug-mode .virtual-scroll-item {
        border: 1px dashed rgba(59, 130, 246, 0.2);
        position: relative;
    }

    .virtual-scroll-container.touch-drag-enabled.debug-mode .virtual-scroll-item::before {
        content: '👆';
        position: absolute;
        top: 2px;
        right: 2px;
        font-size: 12px;
        opacity: 0.5;
        pointer-events: none;
    }
</style>