<script lang="ts">
    import { characterFormatUpdate, getCharImage, removeChar } from "../../ts/characters";
    import { type Database } from "../../ts/storage/database.svelte";
    import { DBState } from 'src/ts/stores.svelte';
    import BarIcon from "../SideBars/BarIcon.svelte";
    import { ArrowLeft, User, Users, Inspect, TrashIcon, Undo2Icon, MessageSquareIcon, PlusIcon } from "lucide-svelte";
    import { selectedCharID } from "../../ts/stores.svelte";
    import TextInput from "../UI/GUI/TextInput.svelte";
    import Button from "../UI/GUI/Button.svelte";
    import { language } from "src/lang";
    import { parseMultilangString } from "src/ts/util";
    import { checkCharOrder } from "src/ts/globalApi.svelte";
    import VirtualScroll from "../UI/VirtualScroll.svelte";
    import { addCharacter } from "../../ts/characters";
    interface Props {
        endGrid?: any;
    }

    let { endGrid = () => {} }: Props = $props();
    let search = $state('')
    let selected = $state(3)
    
    // Virtual scrolling 설정
    const GRID_ITEM_HEIGHT = 72; // BarIcon의 높이 + 여백
    const LIST_ITEM_HEIGHT = 80; // List item의 높이 + 여백
    const SIMPLE_ITEM_HEIGHT = 80; // Simple 모드 아이템 높이 + 여백
    
    // 동적 높이 계산을 위한 state
    let containerHeight = $state(500); // 기본값
    let headerElement: HTMLDivElement | undefined = $state();
    let mainContainerElement: HTMLDivElement | undefined = $state();

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
    
    // Grid 모드를 위한 행별 그룹화 함수
    function groupCharsForGrid(chars: any[], itemsPerRow: number = 6) {
        const groups = [];
        for (let i = 0; i < chars.length; i += itemsPerRow) {
            groups.push(chars.slice(i, i + itemsPerRow));
        }
        return groups;
    }
    
    // 반응형 계산을 위한 컨테이너 너비 state
    let containerWidth = $state(0);
    let containerElement: HTMLDivElement | undefined = $state();
    
    // Virtual scroll 참조
    let gridVirtualScroll: any = $state();
    let listVirtualScroll: any = $state();
    let simpleVirtualScroll: any = $state();
    
    // 그리드 아이템 수 계산 (반응형)
    $effect(() => {
        if (containerElement) {
            const updateWidth = () => {
                containerWidth = containerElement?.clientWidth || 0;
            };
            updateWidth();
            window.addEventListener('resize', updateWidth);
            return () => window.removeEventListener('resize', updateWidth);
        }
    });
    
    // 동적 높이 계산 로직
    $effect(() => {
        const calculateHeight = () => {
            if (mainContainerElement && headerElement) {
                const mainHeight = mainContainerElement.clientHeight;
                const headerHeight = headerElement.clientHeight;
                const padding = 24; // 상하 패딩 (6 * 2 * 2 = 24px)
                const newHeight = Math.max(300, mainHeight - headerHeight - padding);
                containerHeight = newHeight;
            }
        };
        
        if (mainContainerElement && headerElement) {
            calculateHeight();
            window.addEventListener('resize', calculateHeight);
            return () => window.removeEventListener('resize', calculateHeight);
        }
    });
    
    // 한 줄에 들어갈 아이템 수 계산 (BarIcon 크기는 약 60px + gap)
    const itemsPerRow = $derived(Math.max(1, Math.floor((containerWidth || 600) / 70)));
    
    // 필터링된 캐릭터 목록 (성능 최적화를 위한 메모이제이션)
    const filteredChars = $derived(formatChars(search, DBState.db));
    const filteredTrashChars = $derived(formatChars(search, DBState.db, true));
    const gridRows = $derived(groupCharsForGrid(filteredChars, itemsPerRow));
    
    // Simple 모드용 시간 포맷터와 정렬 함수
    const agoFormatter = new Intl.RelativeTimeFormat(navigator.languages, { style: 'short' });
    
    function makeAgoText(time: number) {
        if(time === 0){
            return "Unknown";
        }
        const diff = Date.now() - time;
        if(diff < 3600000){
            const min = Math.floor(diff / 60000);
            return agoFormatter.format(-min, 'minute');
        }
        if(diff < 86400000){
            const hour = Math.floor(diff / 3600000);
            return agoFormatter.format(-hour, 'hour');
        }
        if(diff < 604800000){
            const day = Math.floor(diff / 86400000);
            return agoFormatter.format(-day, 'day');
        }
        if(diff < 2592000000){
            const week = Math.floor(diff / 604800000);
            return agoFormatter.format(-week, 'week');
        }
        if(diff < 31536000000){
            const month = Math.floor(diff / 2592000000);
            return agoFormatter.format(-month, 'month');
        }
        const year = Math.floor(diff / 31536000000);
        return agoFormatter.format(-year, 'year');
    }
    
    function sortSimpleChars(chars: any[]) {
        return chars.map((c, i) => {
            return {
                name: c.name || "Unnamed",
                image: c.image,
                chats: c.chats.length,
                i: i,
                interaction: c.lastInteraction || 0,
                agoText: makeAgoText(c.lastInteraction || 0),
            }
        }).sort((a, b) => {
            if (a.interaction === b.interaction) {
                return a.name.localeCompare(b.name);
            }
            return b.interaction - a.interaction;
        });
    }
    
    // Simple 모드용 필터링된 캐릭터 목록
    const simpleFilteredChars = $derived.by(() => {
        const allChars = DBState.db.characters.filter(c => !c.trashTime);
        const sorted = sortSimpleChars(allChars);
        return sorted.filter(char =>
            char.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
        );
    });
    
    // 검색어 변경 시 스크롤 위치 초기화
    $effect(() => {
        search; // 검색어 변경 감지
        // 스크롤 위치를 맨 위로 초기화
        if (gridVirtualScroll) {
            gridVirtualScroll.scrollTo(0);
        }
        if (listVirtualScroll) {
            listVirtualScroll.scrollTo(0);
        }
        if (simpleVirtualScroll) {
            simpleVirtualScroll.scrollTo(0);
        }
    });
</script>

<div class="h-full w-full flex justify-center">
    <div bind:this={mainContainerElement} class="h-full p-6 bg-darkbg max-w-full w-2xl flex flex-col overflow-y-auto">
        <div bind:this={headerElement} class="mx-4 mb-6 flex flex-col">
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
                    {selected === 2 ? filteredTrashChars.length : filteredChars.length} {language.character}
                </span>
            </div>
        </div>
        
        <div bind:this={containerElement} class="flex-1 min-h-0">
            {#if selected === 0}
                <!-- Grid 모드 - Virtual Scrolling 적용 -->
                <div class="w-full flex justify-center">
                    <div class="w-full max-w-4xl">
                        <VirtualScroll
                            bind:this={gridVirtualScroll}
                            items={gridRows}
                            itemHeight={GRID_ITEM_HEIGHT}
                            containerHeight={containerHeight}
                            className="grid-virtual-scroll"
                        >
                            {#snippet children(rowData, rowIndex)}
                                <div class="flex gap-2 justify-center px-4 py-2">
                                    {#each rowData as char}
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
                            {/snippet}
                        </VirtualScroll>
                    </div>
                </div>
            {:else if selected === 1}
                <!-- List 모드 - Virtual Scrolling 적용 -->
                <VirtualScroll
                    bind:this={listVirtualScroll}
                    items={filteredChars}
                    itemHeight={LIST_ITEM_HEIGHT}
                    containerHeight={containerHeight}
                    className="list-virtual-scroll"
                >
                    {#snippet children(char, index)}
                        <div class="flex p-2 border border-darkborderc rounded-md mb-2 mx-2">
                            <BarIcon onClick={() => {changeChar(char.index)}} additionalStyle={getCharImage(char.image, 'css')}></BarIcon>
                            <div class="flex-1 flex flex-col ml-2">
                                <h4 class="text-textcolor font-bold text-lg mb-1">{char.name || "Unnamed"}</h4>
                                <span class="text-textcolor2">{parseMultilangString(char.desc)['en'] || parseMultilangString(char.desc)['xx'] || 'No description'}</span>
                                <div class="flex gap-2 justify-end">
                                    <button class="hover:text-textcolor text-textcolor2" onclick={() => {
                                        changeChar(char.index)
                                    }}>
                                        <Inspect />
                                    </button>
                                    <button class="hover:text-textcolor text-textcolor2" onclick={() => {
                                        removeChar(char.index, char.name)
                                    }}>
                                        <TrashIcon />
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/snippet}
                </VirtualScroll>
            {:else if selected === 2}
                <!-- Trash 모드 - 일반 스크롤 유지 (성능 덜 중요) -->
                <div class="overflow-y-auto" style="max-height: {containerHeight}px;">
                    <span class="text-textcolor2 text-sm mb-2 block px-2">{language.trashDesc}</span>
                    {#each filteredTrashChars as char}
                        <div class="flex p-2 border border-darkborderc rounded-md mb-2 mx-2">
                            <BarIcon onClick={() => {changeChar(char.index)}} additionalStyle={getCharImage(char.image, 'css')}></BarIcon>
                            <div class="flex-1 flex flex-col ml-2">
                                <h4 class="text-textcolor font-bold text-lg mb-1">{char.name || "Unnamed"}</h4>
                                <span class="text-textcolor2">{parseMultilangString(char.desc)['en'] || parseMultilangString(char.desc)['xx'] || 'No description'}</span>
                                <div class="flex gap-2 justify-end">
                                    <button class="hover:text-textcolor text-textcolor2" onclick={() => {
                                        DBState.db.characters[char.index].trashTime = undefined
                                        checkCharOrder()
                                    }}>
                                        <Undo2Icon />
                                    </button>
                                    <button class="hover:text-textcolor text-textcolor2" onclick={() => {
                                        removeChar(char.index, char.name, 'permanent')
                                    }}>
                                        <TrashIcon />
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {:else if selected === 3}
                <!-- Simple 모드 - Virtual Scrolling 적용 -->
                <div class="relative w-full h-full">
                    <VirtualScroll
                        bind:this={simpleVirtualScroll}
                        items={simpleFilteredChars}
                        itemHeight={SIMPLE_ITEM_HEIGHT}
                        containerHeight={containerHeight}
                        className="simple-virtual-scroll"
                    >
                        {#snippet children(char, index)}
                            <button
                                class="flex p-2 gap-2 w-full hover:bg-selected transition-colors"
                                class:border-t={index !== 0}
                                class:border-t-darkborderc={index !== 0}
                                onclick={() => {
                                    changeChar(char.i)
                                    endGrid()
                                }}
                            >
                                <BarIcon additionalStyle={getCharImage(char.image, 'css')}></BarIcon>
                                <div class="flex flex-1 w-full flex-col justify-start items-start text-start">
                                    <span class="text-textcolor">{char.name}</span>
                                    <div class="text-sm text-textcolor2 flex items-center w-full flex-wrap">
                                        <span class="mr-1">{char.chats}</span>
                                        <MessageSquareIcon size={14} />
                                        <span class="mr-1 ml-1">|</span>
                                        <span>{char.agoText}</span>
                                    </div>
                                </div>
                            </button>
                        {/snippet}
                    </VirtualScroll>
                    
                    <!-- Add Character Button (gridMode prop 기능 유지) -->
                    <button
                        class="p-4 rounded-full absolute bottom-2 right-2 bg-borderc hover:bg-selected transition-colors"
                        onclick={() => {
                            addCharacter()
                        }}
                    >
                        <PlusIcon size={24} />
                    </button>
                </div>
            {/if}
        </div>
    </div>
</div>