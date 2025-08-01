import tippy from 'tippy.js'
import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/translucent.css';
import type { Instance } from 'tippy.js';

// WeakMap을 사용한 tooltip 인스턴스 캐싱
const tooltipCache = new WeakMap<HTMLElement, Instance>();
const observerCache = new WeakMap<HTMLElement, IntersectionObserver>();

// 성능 모니터링을 위한 카운터
let tooltipCreationCount = 0;
let tooltipDestructionCount = 0;
let intersectionObserverCount = 0;

export function tooltip(node: HTMLElement, tip: string) {
    const instance = tippy(node, {
        content: tip,
        animation: 'fade',
        arrow: true,
        theme: 'translucent',
    })
    return {
        destroy() {
            instance.destroy()
        }
    };
}

export function tooltipRight(node: HTMLElement, tip: string) {
    let instance: Instance | null = null;
    let isVisible = false;
    let isDestroyed = false;
    
    console.log('[TOOLTIP DEBUG] Setting up optimized tooltip for:', {
        element: node.tagName,
        content: tip,
        classList: Array.from(node.classList),
        offsetParent: node.offsetParent?.tagName,
        boundingRect: node.getBoundingClientRect(),
        timestamp: Date.now()
    });
    
    const createTooltip = () => {
        if (!instance && tip && !isDestroyed) {
            tooltipCreationCount++;
            console.log('[TOOLTIP PERF] Creating tooltip instance #', tooltipCreationCount, {
                element: node.tagName,
                content: tip,
                totalActive: tooltipCreationCount - tooltipDestructionCount,
                timestamp: Date.now()
            });
            
            instance = tippy(node, {
                content: tip,
                animation: 'fade',
                arrow: true,
                placement: 'right',
                theme: 'translucent',
                hideOnClick: false,
                trigger: 'mouseenter focus',
                onShow() {
                    isVisible = true;
                    console.log('[TOOLTIP DEBUG] Showing tooltip:', {
                        content: instance?.props.content,
                        element: node.tagName,
                        elementRect: node.getBoundingClientRect(),
                        isVirtualScrollItem: node.closest('.virtual-scroll-item') !== null,
                        virtualScrollContainer: node.closest('.virtual-scroll-container')?.getBoundingClientRect(),
                        timestamp: Date.now()
                    });
                },
                onHide() {
                    isVisible = false;
                    console.log('[TOOLTIP DEBUG] Hiding tooltip:', {
                        content: instance?.props.content,
                        element: node.tagName,
                        timestamp: Date.now()
                    });
                },
                onDestroy() {
                    console.log('[TOOLTIP DEBUG] Destroying tooltip instance:', {
                        content: instance?.props.content,
                        element: node.tagName,
                        timestamp: Date.now()
                    });
                }
            });
            
            // 캐시에 저장
            tooltipCache.set(node, instance);
        }
    };
    
    // Intersection Observer로 가시성 체크 후 생성
    const observer = new IntersectionObserver((entries) => {
        const [entry] = entries;
        
        if (entry.isIntersecting) {
            // 요소가 보이면 tooltip 생성
            createTooltip();
        } else if (instance && !isVisible) {
            // 보이지 않고 툴팁도 표시되지 않을 때만 제거
            console.log('[TOOLTIP PERF] Destroying off-screen tooltip:', {
                element: node.tagName,
                content: tip,
                wasVisible: isVisible,
                timestamp: Date.now()
            });
            
            instance.destroy();
            instance = null;
            tooltipDestructionCount++;
            tooltipCache.delete(node);
        }
    }, {
        root: null,
        rootMargin: '50px', // 50px 여유를 두어 미리 생성
        threshold: 0
    });
    
    intersectionObserverCount++;
    observer.observe(node);
    observerCache.set(node, observer);
    
    console.log('[TOOLTIP PERF] Observer setup complete:', {
        totalObservers: intersectionObserverCount,
        element: node.tagName,
        timestamp: Date.now()
    });
    
    return {
        update(newTip: string) {
            tip = newTip;
            if (instance) {
                instance.setContent(newTip);
                console.log('[TOOLTIP DEBUG] Updated tooltip content:', {
                    oldContent: tip,
                    newContent: newTip,
                    element: node.tagName,
                    timestamp: Date.now()
                });
            }
        },
        destroy() {
            isDestroyed = true;
            
            console.log('[TOOLTIP DEBUG] Calling destroy for tooltip:', {
                content: tip,
                element: node.tagName,
                hadInstance: !!instance,
                timestamp: Date.now()
            });
            
            // Observer 정리
            const cachedObserver = observerCache.get(node);
            if (cachedObserver) {
                cachedObserver.disconnect();
                observerCache.delete(node);
                intersectionObserverCount--;
            }
            
            // Instance 정리
            if (instance) {
                instance.destroy();
                instance = null;
                tooltipDestructionCount++;
                tooltipCache.delete(node);
            }
            
            console.log('[TOOLTIP PERF] Cleanup complete:', {
                totalCreated: tooltipCreationCount,
                totalDestroyed: tooltipDestructionCount,
                activeTooltips: tooltipCreationCount - tooltipDestructionCount,
                activeObservers: intersectionObserverCount,
                timestamp: Date.now()
            });
        }
    };
}

// 성능 모니터링 함수 (개발 환경용)
export function getTooltipStats() {
    return {
        created: tooltipCreationCount,
        destroyed: tooltipDestructionCount,
        active: tooltipCreationCount - tooltipDestructionCount,
        activeObservers: intersectionObserverCount,
        cacheSize: 0 // WeakMap은 size를 지원하지 않음
    };
}

// 전체 tooltip 정리 함수 (필요시 사용)
export function cleanupAllTooltips() {
    console.log('[TOOLTIP CLEANUP] Cleaning up all tooltips:', getTooltipStats());
    
    // 이 함수는 WeakMap의 특성상 직접적인 정리가 어려우므로
    // 가비지 컬렉션에 의존합니다.
    tooltipCreationCount = 0;
    tooltipDestructionCount = 0;
    intersectionObserverCount = 0;
}