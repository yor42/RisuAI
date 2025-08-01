<!-- Virtual Scrolling Component for Svelte 5 with Enhanced Features -->
<div 
    bind:this={containerElement}
    class="virtual-scroll-container {className}"
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
        dragScrollZone = 30
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
        if (scrollDisabled && !isDragging) {
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
                // 스크롤 완료 후에만 위치 재계산 실행
                if (!isRecalculating) {
                    measureItems();
                }
            }, 150);
            
            // Reset throttle timer
            scrollThrottleTimer = undefined;
        }, 8); // 120fps for smooth scrolling
    }

    // Handle drag auto scroll
    function handleDragAutoScroll(event: MouseEvent) {
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

    // Recalculate item positions
    function recalculatePositions() {
        if (isScrolling) return; // 스크롤 중일 때는 재계산하지 않음
        
        let currentTop = 0;
        for (let i = 0; i < items.length; i++) {
            itemTops.set(i, currentTop);
            currentTop += itemHeights.get(i) || itemHeight;
        }
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

    // Container height change handling
    $effect(() => {
        if (containerElement && containerHeight > 0) {
            const currentScroll = containerElement.scrollTop;
            requestAnimationFrame(() => {
                if (!isRecalculating) {
                    measureItems();
                }
                if (containerElement) {
                    containerElement.scrollTop = currentScroll;
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

    // Component cleanup
    $effect(() => {
        return () => {
            cleanupOrphanedTooltips();
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
</style>