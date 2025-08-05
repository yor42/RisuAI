<script lang="ts">
    import { getCharImage } from "../../ts/characters";
    import { User, Users } from "lucide-svelte";
    import { onMount, onDestroy } from "svelte";
    
    interface Props {
        image: string;
        index: number;
        onClick: () => void;
        additionalStyle?: string;
        size?: number;
        isSelected?: boolean;
        type?: string;
    }

    let { 
        image, 
        index, 
        onClick, 
        additionalStyle = "", 
        size = 56, 
        isSelected = false, 
        type = "character" 
    }: Props = $props();

    // 상태 관리
    let isVisible = $state(false);
    let isLoading = $state(false);
    let imageStyle = $state("");
    let error = $state(false);
    let element: HTMLElement;

    // 전역 공유 Intersection Observer
    class GlobalIntersectionObserver {
        private static instance: GlobalIntersectionObserver;
        private observer: IntersectionObserver | null = null;
        private callbacks = new Map<Element, () => void>();

        static getInstance(): GlobalIntersectionObserver {
            if (!GlobalIntersectionObserver.instance) {
                GlobalIntersectionObserver.instance = new GlobalIntersectionObserver();
            }
            return GlobalIntersectionObserver.instance;
        }

        private createObserver(): IntersectionObserver {
            return new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            const callback = this.callbacks.get(entry.target);
                            if (callback) {
                                callback();
                                this.unobserve(entry.target);
                            }
                        }
                    });
                },
                {
                    rootMargin: '50px',
                    threshold: 0.1
                }
            );
        }

        observe(element: Element, callback: () => void): void {
            if (!this.observer) {
                this.observer = this.createObserver();
            }
            this.callbacks.set(element, callback);
            this.observer.observe(element);
        }

        unobserve(element: Element): void {
            if (this.observer) {
                this.observer.unobserve(element);
                this.callbacks.delete(element);
            }
        }

        disconnect(): void {
            if (this.observer) {
                this.observer.disconnect();
                this.callbacks.clear();
                this.observer = null;
            }
        }
    }

    // 배치 로딩 시스템 (성능 최적화)
    class ImageLoadQueue {
        private static instance: ImageLoadQueue;
        private queue: Array<{ priority: number; loadFunction: () => Promise<void>; resolve: () => void; reject: (err: any) => void }> = [];
        private running = 0;
        private maxConcurrent = 2; // 동시 로드 수 감소
        private isInitializing = true;

        static getInstance(): ImageLoadQueue {
            if (!ImageLoadQueue.instance) {
                ImageLoadQueue.instance = new ImageLoadQueue();
                // 초기 로딩 완료 후 점진적으로 증가
                setTimeout(() => {
                    if (ImageLoadQueue.instance) {
                        ImageLoadQueue.instance.isInitializing = false;
                        ImageLoadQueue.instance.maxConcurrent = 3;
                    }
                }, 1000);
            }
            return ImageLoadQueue.instance;
        }

        async add(loadFunction: () => Promise<void>, priority: number = 0): Promise<void> {
            return new Promise((resolve, reject) => {
                const item = {
                    priority,
                    loadFunction,
                    resolve,
                    reject
                };

                // 우선순위에 따라 정렬 삽입
                const insertIndex = this.queue.findIndex(q => q.priority < priority);
                if (insertIndex === -1) {
                    this.queue.push(item);
                } else {
                    this.queue.splice(insertIndex, 0, item);
                }

                this.processNext();
            });
        }

        private processNext(): void {
            if (this.running >= this.maxConcurrent || this.queue.length === 0) {
                return;
            }

            const nextItem = this.queue.shift();
            if (nextItem) {
                this.running++;
                
                const wrappedFunction = async () => {
                    try {
                        await nextItem.loadFunction();
                        nextItem.resolve();
                    } catch (err) {
                        nextItem.reject(err);
                    } finally {
                        this.running--;
                        // 부드러운 로딩을 위한 지연
                        if (this.isInitializing) {
                            setTimeout(() => this.processNext(), 50);
                        } else {
                            this.processNext();
                        }
                    }
                };

                wrappedFunction();
            }
        }
    }

    const globalObserver = GlobalIntersectionObserver.getInstance();
    const loadQueue = ImageLoadQueue.getInstance();

    // 이미지 로딩 함수 (우선순위 기반)
    async function loadImage(): Promise<void> {
        if (isLoading || imageStyle || !image) return;
        
        isLoading = true;
        error = false;

        try {
            // 화면 중앙에 가까운 이미지일수록 높은 우선순위
            const rect = element?.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const priority = rect ? Math.max(0, 100 - Math.abs(rect.top - viewportHeight / 2)) : 0;

            await loadQueue.add(async () => {
                const style = await getCharImage(image, 'css');
                if (style) {
                    imageStyle = style;
                }
            }, priority);
        } catch (err) {
            console.error('Failed to load image:', err);
            error = true;
        } finally {
            isLoading = false;
        }
    }

    // Intersection Observer 설정 (지연 초기화)
    function setupObserver(): void {
        if (!element) return;

        const callback = () => {
            if (!isVisible) {
                isVisible = true;
                requestAnimationFrame(() => loadImage());
            }
        };

        globalObserver.observe(element, callback);
    }

    // 라이프사이클 (초기화 지연)
    onMount(() => {
        // 초기 렌더링 후 점진적으로 Observer 설정
        const delay = Math.random() * 100; // 0-100ms 랜덤 지연
        setTimeout(() => {
            requestAnimationFrame(() => setupObserver());
        }, delay);
    });

    onDestroy(() => {
        if (element) {
            globalObserver.unobserve(element);
        }
    });

    // 선택된 상태 스타일
    const selectedStyle = $derived(isSelected ? 'background:var(--risu-theme-selected)' : '');
    const finalStyle = $derived(imageStyle || selectedStyle || additionalStyle);
</script>

<button 
    bind:this={element}
    onclick={onClick} 
    class="lazy-avatar"
    class:loading={isLoading}
    class:error={error}
    class:has-image={!!imageStyle}
    style="{finalStyle}; --size: {size}px;"
    title="Character Avatar"
>
    {#if isLoading}
        <div class="loading-spinner"></div>
    {:else if error || !image}
        {#if type === 'group'}
            <Users size={Math.floor(size * 0.4)} />
        {:else}
            <User size={Math.floor(size * 0.4)} />
        {/if}
    {:else if !imageStyle}
        <!-- 플레이스홀더 -->
        <div class="placeholder">
            {#if type === 'group'}
                <Users size={Math.floor(size * 0.4)} />
            {:else}
                <User size={Math.floor(size * 0.4)} />
            {/if}
        </div>
    {/if}
</button>

<style>
    .lazy-avatar {
        cursor: pointer;
        border-radius: 0.375rem;
        height: var(--size);
        width: var(--size);
        min-height: var(--size);
        min-width: var(--size);
        --tw-shadow-color: 0, 0, 0;
        --tw-shadow: 0 10px 15px -3px rgba(var(--tw-shadow-color), 0.1),
            0 4px 6px -2px rgba(var(--tw-shadow-color), 0.05);
        -webkit-box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000),
            var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
        box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000),
            var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);
        --tw-bg-opacity: 1;
        background-color: rgba(107, 114, 128, var(--tw-bg-opacity));
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        display: flex;
        justify-content: center;
        align-items: center;
        transition-property: background-color, border-color, color, fill, stroke, transform;
        transition-duration: 150ms;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }

    .lazy-avatar:hover {
        --tw-bg-opacity: 1;
        background-color: rgba(16, 185, 129, var(--tw-bg-opacity));
        transform: scale(1.05);
    }

    .lazy-avatar.has-image:hover {
        transform: scale(1.05);
        filter: brightness(1.1);
    }

    .loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .placeholder {
        color: rgba(255, 255, 255, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .lazy-avatar.loading {
        background-color: rgba(107, 114, 128, 0.5);
    }

    .lazy-avatar.error {
        background-color: rgba(239, 68, 68, 0.2);
        border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .lazy-avatar.error .placeholder {
        color: rgba(239, 68, 68, 0.8);
    }
</style>