<!-- Virtual Scrolling Component for Svelte 5 -->
<div 
    bind:this={containerElement}
    class="virtual-scroll-container {className}"
    style="height: {containerHeight}px; overflow: auto; position: relative;"
    onscroll={handleScroll}
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
    }

    let {
        items = [],
        itemHeight = 50,
        containerHeight = 400,
        overscan = 5,
        className = "",
        children,
        onScroll,
        scrollDisabled = false
    }: Props = $props();

    // Reactive state using Svelte 5 runes
    let containerElement: HTMLDivElement | undefined = $state();
    let itemElements: (HTMLDivElement | undefined)[] = $state([]);
    let scrollTop = $state(0);
    let lastScrollTop = $state(0);
    let itemHeights = $state(new Map<number, number>());
    let itemTops = $state(new Map<number, number>());
    let isScrolling = $state(false);
    let scrollTimeout: NodeJS.Timeout | undefined = $state();
    let scrollThrottleTimer: NodeJS.Timeout | undefined = $state();

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

    // Handle scroll events with throttling for 120fps performance
    function handleScroll(event: Event) {
        // 드래그 중일 때 스크롤 차단
        if (scrollDisabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        
        // 기본적인 스크롤 처리 - 성능 최적화보다 안정성 우선
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
                measureItems();
            }, 150);
            
            // Reset throttle timer
            scrollThrottleTimer = undefined;
        }, 16); // 60fps로 안정적으로 변경
    }

    // Measure item heights for variable height support
    function measureItems() {
        if (!containerElement) return;
        
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
    }

    // Recalculate item positions
    function recalculatePositions() {
        let currentTop = 0;
        for (let i = 0; i < items.length; i++) {
            itemTops.set(i, currentTop);
            currentTop += itemHeights.get(i) || itemHeight;
        }
    }

    // 안전한 effect - 기본 기능만 유지
    $effect(() => {
        if (visibleItems.length > 0) {
            // DOM 업데이트 후 높이 측정
            requestAnimationFrame(() => {
                measureItems();
            });
        }
    });

    // 아이템 배열 변경 시 초기화
    $effect(() => {
        if (items.length !== itemHeights.size) {
            itemHeights.clear();
            itemTops.clear();
            recalculatePositions();
        }
    });

    // 기본적인 tooltip 정리 함수만 유지
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
        measureItems();
    }

    export function cleanupTooltips() {
        cleanupOrphanedTooltips();
    }

    // 컴포넌트 정리 시 tooltip 정리
    $effect(() => {
        return () => {
            cleanupOrphanedTooltips();
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
    }

    /* Support for drag and drop */
    .virtual-scroll-item[draggable="true"] {
        cursor: grab;
    }

    .virtual-scroll-item[draggable="true"]:active {
        cursor: grabbing;
    }

    /* Support for tooltips */
    .virtual-scroll-item[data-tooltip] {
        position: relative;
    }
</style>