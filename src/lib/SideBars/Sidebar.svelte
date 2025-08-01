<script lang="ts">
    import {
    CharEmotion,
    DynamicGUI,
    botMakerMode,
    selectedCharID,
    settingsOpen,
    sideBarClosing,
    sideBarStore,
    OpenRealmStore,
    PlaygroundStore,

    QuickSettings

  } from "../../ts/stores.svelte";
    import { setDatabase, type folder } from "../../ts/storage/database.svelte";
    import { DBState } from 'src/ts/stores.svelte';
    import BarIcon from "./BarIcon.svelte";
    import SidebarIndicator from "./SidebarIndicator.svelte";
    import {
    ShellIcon,
    Settings,
    ListIcon,
    LayoutGridIcon,
    FolderIcon,
    FolderOpenIcon,
    HomeIcon,
    WrenchIcon,
    User2Icon,
  } from "lucide-svelte";
    import {
  addCharacter,
    changeChar,
    getCharImage,
  } from "../../ts/characters";
    import CharConfig from "./CharConfig.svelte";
    import { language } from "../../lang";
    import { onDestroy, onMount } from "svelte";
    import { isEqual } from "lodash";
    import SidebarAvatar from "./SidebarAvatar.svelte";
    import BaseRoundedButton from "../UI/BaseRoundedButton.svelte";
    import { get } from "svelte/store";
    import { getCharacterIndexObject, selectSingleFile } from "src/ts/util";
    import { v4 } from "uuid";
    import { checkCharOrder, getFileSrc, saveAsset } from "src/ts/globalApi.svelte";
    import { alertInput, alertSelect } from "src/ts/alert";
    import SideChatList from "./SideChatList.svelte";
    import { ConnectionIsHost, ConnectionOpenStore, RoomIdStore } from "src/ts/sync/multiuser";
  import { sideBarSize } from "src/ts/gui/guisize";
  import DevTool from "./DevTool.svelte";
    import QuickSettingsGui from "../Others/QuickSettingsGUI.svelte";
    import VirtualScroll from "../UI/VirtualScroll.svelte";
  let sideBarMode = $state(0);
  let editMode = $state(false);
  let menuMode = $state(0);
  let devTool = $state(false)

  function reseter() {
    menuMode = 0;
    sideBarMode = 0;
    editMode = false;
    settingsOpen.set(false);
    CharEmotion.set({});
  }

  type sortTypeNormal = { type:'normal',img: string, index: number, name:string }
  type sortType =  sortTypeNormal|{type:'folder',folder:sortTypeNormal[],id:string, name:string, color:string, img?:string}
  let charImages: sortType[] = $state([]);
  let IconRounded = $state(false)
  let openFolders:string[] = $state([])
  let currentDrag: DragData | null = $state(null)
  
  // VirtualScroll 인스턴스 참조
  let virtualScrollRef: any = $state()
  
  // 드래그 중 마우스 이벤트 처리를 위한 상태
  let dragMouseMoveHandler: ((e: MouseEvent) => void) | null = $state(null)
  
  // Virtual Scrolling 관련 타입 정의
  interface VirtualScrollItem {
    type: 'normal' | 'folder' | 'folder-item' | 'spacer';
    originalItem?: sortType | sortTypeNormal;
    originalIndex?: number;
    folderInfo?: {
      folderId: string;
      folderIndex: number;
      itemIndex: number;
    };
    spacerInfo?: {
      insertIndex: number;
      folderId?: string;
    };
    height: number;
  }
  
  // 아이템 높이 상수
  const ITEM_HEIGHT = 72; // 아바타 + 여백
  const SPACER_HEIGHT = 16; // 드래그 드롭용 빈 공간
  
  // 스크롤 컨테이너 관련
  let scrollContainer = $state<HTMLDivElement>();
  let scrollContainerHeight = $state(400);
  
  // 컨테이너 높이 자동 계산 - ResizeObserver loop 방지 개선
  $effect(() => {
    if (scrollContainer) {
      let rafId: number | null = null;
      let lastHeight = scrollContainerHeight;
      
      const updateHeight = () => {
        try {
          // null 체크 및 DOM 연결 상태 확인
          if (!scrollContainer || !scrollContainer.isConnected) {
            return;
          }
          
          const rect = scrollContainer.getBoundingClientRect();
          
          // rect 유효성 검사 - 크기가 0이면 아직 렌더링되지 않은 상태이므로 스킵
          if (!rect || rect.width <= 0 || rect.height <= 0) {
            return;
          }
          
          const newHeight = Math.max(200, rect.height - 80); // 최소 200px, 버튼 영역 제외
          
          // 높이가 실제로 변경된 경우에만 업데이트 (ResizeObserver loop 방지)
          if (Math.abs(newHeight - lastHeight) > 1) { // 1px 이상 차이날 때만 업데이트
            lastHeight = newHeight;
            scrollContainerHeight = newHeight;
          }
        } catch (error) {
          console.error('[SIDEBAR HEIGHT ERROR] updateHeight 실패:', error.message);
        }
      };
      
      // 초기 높이 설정 - requestAnimationFrame으로 지연
      requestAnimationFrame(() => {
        updateHeight();
      });
      
      const resizeObserver = new ResizeObserver((entries) => {
        try {
          // ResizeObserver loop 방지: requestAnimationFrame으로 다음 프레임에서 실행
          if (rafId) {
            cancelAnimationFrame(rafId);
          }
          
          rafId = requestAnimationFrame(() => {
            if (!entries || entries.length === 0) {
              return;
            }
            
            updateHeight();
            rafId = null;
          });
        } catch (error) {
          console.error('[SIDEBAR HEIGHT ERROR] ResizeObserver 콜백 실패:', error.message);
        }
      });
      
      try {
        resizeObserver.observe(scrollContainer);
      } catch (error) {
        console.error('[SIDEBAR HEIGHT ERROR] ResizeObserver 시작 실패:', error.message);
      }
      
      return () => {
        try {
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          resizeObserver.disconnect();
        } catch (error) {
          console.error('[SIDEBAR HEIGHT ERROR] ResizeObserver 정리 실패:', error.message);
        }
      };
    }
  });

  // 안전한 $derived.by() 방식으로 virtualItems 생성 - 증분 업데이트 없음
  let virtualItems: VirtualScrollItem[] = $derived.by(() => {
    const items: VirtualScrollItem[] = [];
    
    try {
      // 맨 위 spacer 추가
      items.push({
        type: 'spacer',
        spacerInfo: { insertIndex: 0 },
        height: SPACER_HEIGHT
      });
      
      for (let ind = 0; ind < charImages.length; ind++) {
        const char = charImages[ind];
        
        if (char.type === 'normal') {
          items.push({
            type: 'normal',
            originalItem: char,
            originalIndex: ind,
            height: ITEM_HEIGHT
          });
        } else if (char.type === 'folder') {
          items.push({
            type: 'folder',
            originalItem: char,
            originalIndex: ind,
            height: ITEM_HEIGHT
          });
          
          // 폴더가 열려있으면 내부 아이템들 추가
          if (openFolders.includes(char.id)) {
            // 폴더 내부 첫 번째 spacer
            items.push({
              type: 'spacer',
              spacerInfo: { insertIndex: 0, folderId: char.id },
              height: SPACER_HEIGHT
            });
            
            char.folder.forEach((folderChar, folderInd) => {
              items.push({
                type: 'folder-item',
                originalItem: folderChar,
                originalIndex: ind,
                folderInfo: {
                  folderId: char.id,
                  folderIndex: ind,
                  itemIndex: folderInd
                },
                height: ITEM_HEIGHT
              });
              
              // 폴더 아이템 뒤 spacer
              items.push({
                type: 'spacer',
                spacerInfo: { insertIndex: folderInd + 1, folderId: char.id },
                height: SPACER_HEIGHT
              });
            });
          }
        }
        
        // 메인 아이템 뒤 spacer
        items.push({
          type: 'spacer',
          spacerInfo: { insertIndex: ind + 1 },
          height: SPACER_HEIGHT
        });
      }
      
      return items;
    } catch (error) {
      console.error('[SIDEBAR ERROR] virtualItems 생성 실패:', error);
      // 안전장치: 최소한의 spacer만 반환
      return [{
        type: 'spacer',
        spacerInfo: { insertIndex: 0 },
        height: SPACER_HEIGHT
      }];
    }
  });
  interface Props {
    openGrid?: any;
    hidden?: boolean;
  }

  let { openGrid = () => {}, hidden = false }: Props = $props();

  sideBarClosing.set(false)

  // charImages 업데이트 함수 분리
  function updateCharImages() {
    let newCharImages: sortType[] = [];
    const idObject = getCharacterIndexObject()
    for (const id of DBState.db.characterOrder) {
      if(typeof(id) === 'string'){
        const index = idObject[id] ?? -1
        if(index !== -1){
          const cha = DBState.db.characters[index]
          newCharImages.push({
            img:cha.image ?? "",
            index:index,
            type: "normal",
            name: cha.name
          });
        }
      }
      else{
        const folder = id
        let folderCharImages: sortTypeNormal[] = []
        for(const id of folder.data){
          const index = idObject[id] ?? -1
          if(index !== -1){
            const cha = DBState.db.characters[index]
            folderCharImages.push({
              img:cha.image ?? "",
              index:index,
              type: "normal",
              name: cha.name
            });
          }
        }
        newCharImages.push({
          folder: folderCharImages,
          type: "folder",
          id: folder.id,
          name: folder.name,
          color: folder.color,
          img: folder.imgFile,
        });
      }
    }
    // 강제 업데이트 - isEqual 체크 없이 바로 반영
    charImages = newCharImages;
    
    if(IconRounded !== DBState.db.roundIcons){
      IconRounded = DBState.db.roundIcons
    }
  }

  // 자동 감지 effect
  $effect(() => {
    updateCharImages()
  })


  const inserter = (mainIndex: Exclude<DragData, null>, targetIndex: Exclude<DragData, null>) => {
    if(mainIndex.index === targetIndex.index && mainIndex.folder === targetIndex.folder){
      return
    }
    let db = DBState.db
    let mainFolderIndex = mainIndex.folder ? getFolderIndex(mainIndex.folder) : null
    let targetFolderIndex = targetIndex.folder ? getFolderIndex(targetIndex.folder) : null
    let mainFolderId = mainIndex.folder ? (db.characterOrder[mainFolderIndex] as folder).id : ''
    let movingFolder:folder|false = false
    let mainId = ''
    if(mainIndex.folder){
      mainId = (db.characterOrder[mainFolderIndex] as folder).data[mainIndex.index]
    }
    else{
      const da = db.characterOrder[mainIndex.index]
      if(typeof(da) !== 'string'){
        mainId = da.id
        movingFolder = structuredClone($state.snapshot(da))
        if(targetIndex.folder){
          return
        }
      }
      else{
        mainId = da
      }
    }
    if(targetIndex.folder){
        const folder = db.characterOrder[targetFolderIndex] as folder
        folder.data.splice(targetIndex.index,0,mainId)
        db.characterOrder[targetFolderIndex] = folder
    }
    else if(movingFolder){
        db.characterOrder.splice(targetIndex.index,0,movingFolder)
    }
    else{
        db.characterOrder.splice(targetIndex.index,0,mainId)
    }
    if(mainIndex.folder){
      mainFolderIndex = -1
      for(let i=0;i<db.characterOrder.length;i++){
        const a =db.characterOrder[i]
        if(typeof(a) !== 'string'){
          if(a.id === mainFolderId){
            mainFolderIndex = i
            break
          }
        }
      }
      if(mainFolderIndex !== -1){
        const folder:folder = db.characterOrder[mainFolderIndex] as folder
        const ind = mainIndex.index > targetIndex.index ? folder.data.lastIndexOf(mainId) : folder.data.indexOf(mainId) 
        if(ind !== -1){
          folder.data.splice(ind, 1)
        }
        db.characterOrder[mainFolderIndex] = folder
      }
      else{
        console.log('folder not found')
      }
    }
    else if(movingFolder){
      let idList:string[] = []
      for(const ord of db.characterOrder){
        idList.push(typeof(ord) === 'string' ? ord : ord.id)
      }
      const ind = mainIndex.index > targetIndex.index ? idList.lastIndexOf(mainId) : idList.indexOf(mainId) 
      if(ind !== -1){
        db.characterOrder.splice(ind, 1)
      }
    }
    else{
      const ind = mainIndex.index > targetIndex.index ? db.characterOrder.lastIndexOf(mainId) : db.characterOrder.indexOf(mainId) 
      if(ind !== -1){
        db.characterOrder.splice(ind, 1)
      }
    }

    DBState.db.characterOrder = db.characterOrder
    checkCharOrder()
    
    // 캐릭터 순서 변경 후 즉시 charImages 업데이트 강제 실행
    updateCharImages()
  }

  function getFolderIndex(id: string): number {
    for(let i=0;i<DBState.db.characterOrder.length;i++){
      const data = DBState.db.characterOrder[i]
      if(typeof(data) !== 'string' && data.id === id){
        return i
      }
    }
    return -1
  }

  const createFolder = (mainIndex: Exclude<DragData, null>, targetIndex: Exclude<DragData, null>) => {
    if(mainIndex.index === targetIndex.index && mainIndex.folder === targetIndex.folder){
      return
    }
    let db = DBState.db
    let mainFolderIndex = mainIndex.folder ? getFolderIndex(mainIndex.folder) : null
    let mainFolder = db.characterOrder[mainFolderIndex] as folder
    if(targetIndex.folder){
      return
    }
    const main = mainIndex.folder ? mainFolder.data[mainIndex.index] : db.characterOrder[mainIndex.index]
    const target = db.characterOrder[targetIndex.index]
    if(typeof(main) !== 'string'){
      return
    }
    if(typeof (target) === 'string'){
      const newFolder:folder = {
        name: "New Folder",
        data: [main, target],
        color: "",
        id: v4()
      }
      db.characterOrder[targetIndex.index] = newFolder
      if(mainIndex.folder){
        mainFolder.data.splice(mainIndex.index, 1)
        db.characterOrder[mainFolderIndex] = mainFolder
      }
      else{
        db.characterOrder.splice(mainIndex.index, 1)
      }
    }
    else{
      target.data.push(main)
      if(mainIndex.folder){
        mainFolder.data.splice(mainIndex.index, 1)
        db.characterOrder[mainFolderIndex] = mainFolder
      }
      else{
        db.characterOrder.splice(mainIndex.index, 1)
      }
    }
    setDatabase(db)
    
    // 폴더 생성 후 즉시 charImages 업데이트 강제 실행
    updateCharImages()
  }

  type DragEv = DragEvent & {
    currentTarget: EventTarget & HTMLDivElement;
  }
  type DragData = {
    index: number,
    folder?: string
  } | null
  const avatarDragStart = (ind: Exclude<DragData, null>, e: DragEv) => {
    e.dataTransfer.setData('text/plain', '');
    currentDrag = ind
    
    // VirtualScroll의 setDragging 함수 호출
    if (virtualScrollRef?.setDragging) {
      virtualScrollRef.setDragging(true);
    }
    
    // 드래그 중 마우스 이벤트 처리를 위한 핸들러 추가
    const handleDragMouseMove = (e: MouseEvent) => {
      if (virtualScrollRef?.handleDragAutoScroll) {
        virtualScrollRef.handleDragAutoScroll(e);
      }
    };
    
    dragMouseMoveHandler = handleDragMouseMove;
    document.addEventListener('mousemove', handleDragMouseMove);
    
    const avatar = e.currentTarget.querySelector('.avatar')
    if(avatar){
      e.dataTransfer.setDragImage(avatar, 10, 10);
    }
  }

  const avatarDragOver = (e:DragEv) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const avatarDrop = (ind: Exclude<DragData, null>, e: DragEv) => {
    e.preventDefault()
    
    try {
      if(currentDrag){
        createFolder(currentDrag,ind)
      }
    } catch (error) {
      console.error('[SIDEBAR ERROR] 드래그 앤 드롭 실패:', error);
    } finally {
      // 드래그 상태를 안전하게 초기화하여 스크롤 재활성화
      currentDrag = null;
      
      // VirtualScroll의 setDragging 함수 호출
      if (virtualScrollRef?.setDragging) {
        virtualScrollRef.setDragging(false);
      }
      
      // 마우스 이벤트 리스너 제거
      if (dragMouseMoveHandler) {
        document.removeEventListener('mousemove', dragMouseMoveHandler);
        dragMouseMoveHandler = null;
      }
    }
  }

  const avatarDragEnd = (e:DragEv) => {
    // 드래그 종료 시 스크롤 재활성화
    currentDrag = null;
    
    // VirtualScroll의 setDragging 함수 호출
    if (virtualScrollRef?.setDragging) {
      virtualScrollRef.setDragging(false);
    }
    
    // 마우스 이벤트 리스너 제거
    if (dragMouseMoveHandler) {
      document.removeEventListener('mousemove', dragMouseMoveHandler);
      dragMouseMoveHandler = null;
    }
  }

  // 전역 드래그 종료 이벤트 리스너로 안전장치 제공
  let globalDragEndCleanup: (() => void) | null = null

  onMount(() => {
    const handleGlobalDragEnd = () => {
      if (currentDrag !== null) {
        currentDrag = null;
        
        // VirtualScroll의 setDragging 함수 호출
        if (virtualScrollRef?.setDragging) {
          virtualScrollRef.setDragging(false);
        }
        
        // 마우스 이벤트 리스너 제거
        if (dragMouseMoveHandler) {
          document.removeEventListener('mousemove', dragMouseMoveHandler);
          dragMouseMoveHandler = null;
        }
      }
    }
    
    const handleGlobalDragLeave = (e: DragEvent) => {
      // 브라우저 창을 벗어날 때 드래그 상태 정리
      if (!e.relatedTarget) {
        currentDrag = null;
        
        // VirtualScroll의 setDragging 함수 호출
        if (virtualScrollRef?.setDragging) {
          virtualScrollRef.setDragging(false);
        }
        
        // 마우스 이벤트 리스너 제거
        if (dragMouseMoveHandler) {
          document.removeEventListener('mousemove', dragMouseMoveHandler);
          dragMouseMoveHandler = null;
        }
      }
    }

    document.addEventListener('dragend', handleGlobalDragEnd)
    document.addEventListener('dragleave', handleGlobalDragLeave)
    
    globalDragEndCleanup = () => {
      document.removeEventListener('dragend', handleGlobalDragEnd)
      document.removeEventListener('dragleave', handleGlobalDragLeave)
    }
  })

  onDestroy(() => {
    // 컴포넌트 정리 시 드래그 상태 초기화 및 이벤트 리스너 정리
    if (currentDrag !== null) {
      currentDrag = null;
      
      // VirtualScroll의 setDragging 함수 호출
      if (virtualScrollRef?.setDragging) {
        virtualScrollRef.setDragging(false);
      }
    }
    
    // 마우스 이벤트 리스너 제거
    if (dragMouseMoveHandler) {
      document.removeEventListener('mousemove', dragMouseMoveHandler);
      dragMouseMoveHandler = null;
    }
    
    if (globalDragEndCleanup) {
      globalDragEndCleanup()
      globalDragEndCleanup = null
    }
  })

  const preventAll = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    return false
  }
</script>
{#if DBState.db.menuSideBar}
<div
  class="h-full w-20 min-w-20 flex-col items-center bg-bgcolor text-textcolor shadow-lg relative rs-sidebar"
  class:editMode
  class:risu-sub-sidebar={$sideBarClosing}
  class:risu-sub-sidebar-close={$sideBarClosing}
  class:hidden={hidden}
  class:flex={!hidden}
>
<button
  class="flex items-center justify-center py-2 flex-col gap-1 w-full mt-4"
  class:text-textcolor2={!(
    $selectedCharID < 0 &&
    $PlaygroundStore === 0 &&
    !$settingsOpen
  )}
  onclick={() => {
    reseter();
    selectedCharID.set(-1)
    PlaygroundStore.set(0)
    OpenRealmStore.set(false)
  }}
>
  <HomeIcon />
  <span class="text-xs">{language.home}</span>
</button>
<button
  class="flex items-center justify-center py-2 flex-col gap-1 w-full"
  class:text-textcolor2={!$settingsOpen}
  onclick={() => {
    if ($settingsOpen) {
      reseter();
      settingsOpen.set(false);
    } else {
      reseter();
      settingsOpen.set(true);
    }
  }}
>
  <Settings />
  <span class="text-xs">{language.settings}</span>
</button>
<button
  class="flex items-center justify-center py-2 flex-col gap-1 w-full"
  class:text-textcolor2={!(
    $selectedCharID >= 0
  )}
  onclick={() => {
    reseter();
    openGrid();

  }}
>
  <User2Icon />
  <span class="text-xs">{language.character}</span>
</button>
<button
  class="flex items-center justify-center py-2 flex-col gap-1 w-full"
  class:text-textcolor2={!(
    $selectedCharID < 0 &&
    $PlaygroundStore !== 0
  )}
  onclick={() => {
    reseter();
    selectedCharID.set(-1)
    PlaygroundStore.set(1)
  }}
>
  <ShellIcon />
  <span class="text-xs">{language.playground}</span>
</button>
</div>
{:else}
<div
  class="h-full w-20 min-w-20 flex-col items-center bg-bgcolor text-textcolor shadow-lg relative rs-sidebar"
  class:editMode
  class:risu-sub-sidebar={$sideBarClosing}
  class:risu-sub-sidebar-close={$sideBarClosing}
  class:hidden={hidden}
  class:flex={!hidden}
>
  <button
    class="flex h-8 min-h-8 w-14 min-w-14 cursor-pointer text-white mt-2 items-center justify-center rounded-md bg-textcolor2 transition-colors hover:bg-green-500"
    onclick={() => {
      menuMode = 1 - menuMode;
    }}><ListIcon />
  </button>
  <div class="mt-2 border-b border-b-selected w-full relative text-white ">
    {#if menuMode === 1}
      <div class="absolute w-20 min-w-20 flex border-b-selected border-b bg-bgcolor flex-col items-center pt-2 rounded-b-md z-20 pb-2">
        <BarIcon
        onClick={() => {
          if ($settingsOpen) {
            reseter();
            settingsOpen.set(false);
          } else {
            reseter();
            settingsOpen.set(true);
          }
        }}><Settings /></BarIcon
      >
      <div class="mt-2"></div>
      <BarIcon
        onClick={() => {
          reseter();
          selectedCharID.set(-1)
          PlaygroundStore.set(0)
          OpenRealmStore.set(false)
        }}><HomeIcon /></BarIcon>
      <div class="mt-2"></div>
      <BarIcon
        onClick={() => {
          reseter()
          if($selectedCharID === -1 && $PlaygroundStore !== 0){
            PlaygroundStore.set(0)
            return
          }
          selectedCharID.set(-1)
          PlaygroundStore.set(1)
        }}
      ><ShellIcon /></BarIcon>
      <div class="mt-2"></div>
      <BarIcon
        onClick={() => {
          reseter();
          openGrid();
        }}><LayoutGridIcon /></BarIcon
      >
    </div>
    {/if}
  </div>
  <div class="flex flex-grow w-full flex-col items-center overflow-x-hidden overflow-y-hidden pr-0" bind:this={scrollContainer}>
    <VirtualScroll
      bind:this={virtualScrollRef}
      items={virtualItems}
      itemHeight={ITEM_HEIGHT}
      containerHeight={scrollContainerHeight}
      className="w-full"
      scrollDisabled={false}
      allowDragScroll={true}
      dragScrollZone={30}
    >
      {#snippet children(item: VirtualScrollItem, index: number)}
        {#if item.type === 'spacer'}
          <div
            class="h-4 min-h-4 w-14"
            role="listitem"
            ondragover={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              e.currentTarget.classList.add('bg-green-500')
            }}
            ondragleave={(e) => {
              e.currentTarget.classList.remove('bg-green-500')
            }}
            ondrop={(e) => {
              e.preventDefault()
              e.currentTarget.classList.remove('bg-green-500')
              const da = currentDrag
              if(da && item.spacerInfo){
                if(item.spacerInfo.folderId){
                  inserter(da, {index: item.spacerInfo.insertIndex, folder: item.spacerInfo.folderId})
                } else {
                  inserter(da, {index: item.spacerInfo.insertIndex})
                }
              }
            }}
            ondragenter={preventAll}
          ></div>
        {:else if item.type === 'normal' || item.type === 'folder'}
          {@const char = item.originalItem}
          {@const ind = item.originalIndex}
          <div class="group relative flex items-center px-2"
            role="listitem"
            draggable="true"
            ondragstart={(e) => {avatarDragStart({index: ind}, e)}}
            ondragend={(e) => {avatarDragEnd(e)}}
            ondragover={avatarDragOver}
            ondrop={(e) => {avatarDrop({index: ind}, e)}}
            ondragenter={preventAll}
          >
            <SidebarIndicator
              isActive={char.type === 'normal' && $selectedCharID === char.index && sideBarMode !== 1}
            />
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
                role="button" tabindex="0"
                onclick={() => {
                  if(char.type === "normal"){
                    changeChar(char.index, {reseter});
                  } else if(char.type === "folder"){
                    const wasOpen = openFolders.includes(char.id);
                    
                    if(wasOpen){
                      const removeIndex = openFolders.indexOf(char.id);
                      openFolders.splice(removeIndex, 1)
                    }
                    else{
                      openFolders.push(char.id)
                    }
                    openFolders = openFolders
                  }
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    if(char.type === "normal"){
                      changeChar(char.index, {reseter});
                    } else if(char.type === "folder"){
                      const wasOpen = openFolders.includes(char.id);
                      
                      if(wasOpen){
                        openFolders.splice(openFolders.indexOf(char.id), 1)
                      }
                      else{
                        openFolders.push(char.id)
                      }
                      openFolders = openFolders
                    }
                  }
                }}
              >
              {#if char.type === 'normal'}
                <SidebarAvatar src={char.img ? getCharImage(char.img, "plain") : "/none.webp"} size="56" rounded={IconRounded} name={char.name} />
              {:else if char.type === "folder"}
                {#key char.color}
                {#key char.name}
                  <SidebarAvatar src="slot" size="56" rounded={IconRounded} bordered name={char.name} color={char.color} backgroundimg={char.img ? getCharImage(char.img, "plain") : ""}
                  oncontextmenu={async (e) => {
                    e.preventDefault()
                    const sel = parseInt(await alertSelect([language.renameFolder,language.changeFolderColor,language.changeFolderImage,language.cancel]))
                    if(sel === 0){
                      const v = await alertInput(language.changeFolderName)
                      const db = DBState.db
                      if(v){
                        const oder = db.characterOrder[ind]
                        if(typeof(oder) === 'string'){
                          return
                        }
                        oder.name = v
                        db.characterOrder[ind] = oder
                        setDatabase(db)
                      }
                    }
                    else if(sel === 1){
                      const colors = ["red","green","blue","yellow","indigo","purple","pink","default"]
                      const sel = parseInt(await alertSelect(colors))
                      const db = DBState.db
                      const oder = db.characterOrder[ind]
                      if(typeof(oder) === 'string'){
                        return
                      }
                      oder.color = colors[sel].toLocaleLowerCase()
                      db.characterOrder[ind] = oder
                      setDatabase(db)
                    }
                    else if(sel === 2) {
                      const sel = parseInt(await alertSelect(['Reset to Default Image', 'Select Image File']))
                      const db = DBState.db
                      const oder = db.characterOrder[ind]
                      if(typeof(oder) === 'string'){
                        return
                      }

                      switch (sel) {
                        case 0:
                          oder.imgFile = null
                          oder.img = ''
                          break;
                      
                        case 1:
                          const folderImage = await selectSingleFile([
                            'png',
                            'jpg',
                            'webp',
                          ])

                          if(!folderImage) {
                            return
                          }

                          const folderImageData = await saveAsset(folderImage.data)

                          oder.imgFile = folderImageData
                          oder.img = await getFileSrc(folderImageData)
                          db.characterOrder[ind] = oder
                          setDatabase(db)
                          break;
                      }
                    }
                  }}>
                    {#if DBState.db.showFolderName}
                      <div class="h-full w-full flex justify-center items-center">
                        <span class="hyphens-auto truncate font-bold">{char.name}</span>
                      </div>
                    {:else if openFolders.includes(char.id)}
                      <FolderOpenIcon />
                    {:else}
                      <FolderIcon />
                    {/if}
                  </SidebarAvatar>
                {/key}
                {/key}
              {/if}
            </div>
          </div>
        {:else if item.type === 'folder-item'}
          {@const char2 = item.originalItem}
          {@const folderInfo = item.folderInfo}
          {@const folderChar = charImages[folderInfo.folderIndex]}
          {#if char2 && char2.type === 'normal' && folderChar && folderChar.type === 'folder'}
            <div class="group relative flex items-center px-2 z-10"
              role="listitem"
              draggable="true"
              ondragstart={(e) => {avatarDragStart({index: folderInfo.itemIndex, folder: folderInfo.folderId}, e)}}
              ondragend={(e) => {avatarDragEnd(e)}}
              ondragover={avatarDragOver}
              ondrop={(e) => {avatarDrop({index: folderInfo.itemIndex, folder: folderInfo.folderId}, e)}}
              ondragenter={preventAll}
              style="background: linear-gradient(90deg, transparent 0%, {
                folderChar.color === 'default' || folderChar.color === '' ? 'rgba(55, 65, 81, 0.2)' :
                folderChar.color === 'red' ? 'rgba(185, 28, 28, 0.2)' :
                folderChar.color === 'yellow' ? 'rgba(161, 98, 7, 0.2)' :
                folderChar.color === 'green' ? 'rgba(21, 128, 61, 0.2)' :
                folderChar.color === 'blue' ? 'rgba(29, 78, 216, 0.2)' :
                folderChar.color === 'indigo' ? 'rgba(67, 56, 202, 0.2)' :
                folderChar.color === 'purple' ? 'rgba(126, 34, 206, 0.2)' :
                folderChar.color === 'pink' ? 'rgba(190, 24, 93, 0.2)' : 'rgba(55, 65, 81, 0.2)'
              } 20%, transparent 100%); border-left: 2px solid {
                folderChar.color === 'default' || folderChar.color === '' ? 'rgb(75, 85, 99)' :
                folderChar.color === 'red' ? 'rgb(185, 28, 28)' :
                folderChar.color === 'yellow' ? 'rgb(161, 98, 7)' :
                folderChar.color === 'green' ? 'rgb(21, 128, 61)' :
                folderChar.color === 'blue' ? 'rgb(29, 78, 216)' :
                folderChar.color === 'indigo' ? 'rgb(67, 56, 202)' :
                folderChar.color === 'purple' ? 'rgb(126, 34, 206)' :
                folderChar.color === 'pink' ? 'rgb(190, 24, 93)' : 'rgb(75, 85, 99)'
              }; margin-left: 4px; border-radius: 0px 8px 8px 0px;"
            >
              <SidebarIndicator
                isActive={$selectedCharID === char2.index && sideBarMode !== 1}
              />
              <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
              <div
                  role="button" tabindex="0"
                  onclick={() => {
                    if(char2.type === "normal"){
                      changeChar(char2.index, {reseter});
                    }
                  }}
                  onkeydown={(e) => {
                    if (e.key === "Enter") {
                      if(char2.type === "normal"){
                        changeChar(char2.index, {reseter});
                      }
                    }
                  }}
                >
                <SidebarAvatar src={char2.img ? getCharImage(char2.img, "plain") : "/none.webp"} size="56" rounded={IconRounded} name={char2.name}/>
              </div>
            </div>
          {/if}
        {/if}
      {/snippet}
    </VirtualScroll>
    <div class="flex flex-col items-center space-y-2 px-2 mt-4">
      <BaseRoundedButton
        onClick={async () => {
          addCharacter({reseter})
        }}
        ><svg viewBox="0 0 24 24" width="1.2em" height="1.2em"
          ><path
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          /></svg
        ></BaseRoundedButton
      >
    </div>
  </div>
</div>
{/if}
<div
  class="setting-area h-full flex-col overflow-y-auto overflow-x-hidden bg-darkbg py-6 text-textcolor max-h-full"
  class:risu-sidebar={!$sideBarClosing}
  class:w-96={$sideBarSize === 0}
  class:w-110={$sideBarSize === 1}
  class:w-124={$sideBarSize === 2}
  class:w-138={$sideBarSize === 3}
  class:risu-sidebar-close={$sideBarClosing}
  class:min-w-96={!$DynamicGUI && $sideBarSize === 0}
  class:min-w-110={!$DynamicGUI && $sideBarSize === 1}
  class:min-w-124={!$DynamicGUI && $sideBarSize === 2}
  class:min-w-138={!$DynamicGUI && $sideBarSize === 3}
  class:px-2={$DynamicGUI}
  class:px-4={!$DynamicGUI}
  class:dynamic-sidebar={$DynamicGUI}
  class:hidden={hidden}
  class:flex={!hidden}
  onanimationend={() => {
    if($sideBarClosing){
      $sideBarClosing = false
      sideBarStore.set(false)
    }
  }}
>
  <button
    class="flex w-full justify-end text-textcolor"
    onclick={async () => {
      if($sideBarClosing){
        return
      }
      $sideBarClosing = true;
    }}
  >
    <!-- <button class="border-none bg-transparent p-0 text-textcolor"><X /></button> -->
  </button>
  {#if sideBarMode === 0}
    {#if $selectedCharID < 0 || $settingsOpen}
      <div>
        <h1 class="text-xl">Welcome to RisuAI!</h1>
        <span class="text-xs text-textcolor2">Select a bot to start chatting</span>
      </div>
    {:else if DBState.db.characters[$selectedCharID]?.chaId === '§playground'}
      <SideChatList bind:chara={ DBState.db.characters[$selectedCharID]} />
    {:else if $ConnectionOpenStore}
      <div class="flex flex-col">
        <h1 class="text-xl">{language.connectionOpen}</h1>
        <span class="text-textcolor2 mb-4">{language.connectionOpenInfo}</span>
        <div class="flex">
          <span>ID: </span>
          <span class="text-blue-600">{$RoomIdStore}</span>
        </div>
        <div>
          {#if $ConnectionIsHost}
            <span class="text-emerald-600">{language.connectionHost}</span>
          {:else}
            <span class="text-gray-500">{language.connectionGuest}</span>
          {/if}
        </div>
      </div>
    {:else}
      <div class="w-full h-8 min-h-8 border-l border-b border-r border-selected relative bottom-6 rounded-b-md flex">
        <button onclick={() => {
          devTool = false
          botMakerMode.set(false)
        }} class="flex-grow border-r border-r-selected rounded-bl-md" class:text-textcolor2={$botMakerMode || devTool}>{language.Chat}</button>
        <button onclick={() => {
          devTool = false
          botMakerMode.set(true)
        }} class="flex-grow rounded-br-md" class:text-textcolor2={!$botMakerMode || devTool}>{language.character}</button>
        {#if DBState.db.enableDevTools}
          <button onclick={() => {
            devTool = true
          }} class="border-l border-l-selected rounded-br-md px-1" class:text-textcolor2={!devTool}>
            <WrenchIcon size={18} />
          </button>
        {/if}
      </div>
      {#if QuickSettings.open}
        <QuickSettingsGui />
      {:else if devTool}
        <DevTool />
      {:else if $botMakerMode}
        <CharConfig />
      {:else}
        <SideChatList bind:chara={ DBState.db.characters[$selectedCharID]} />
      {/if}
    {/if}
  {/if}
</div>

{#if $DynamicGUI}
    <div role="button" tabindex="0" class="flex-grow h-full min-w-12" class:hidden={hidden} onclick={() => {
      if($sideBarClosing){
        return
      }
      $sideBarClosing = true;
    }}
      onkeydown={(e)=>{
        if(e.key === 'Enter'){
            e.currentTarget.click()
        }
      }}
      class:sidebar-dark-animation={!$sideBarClosing}
      class:sidebar-dark-close-animation={$sideBarClosing}>

    </div>

{/if}

<style>
  .editMode {
    min-width: 6rem;
  }
  @keyframes sidebar-transition {
    from {
      width: 0rem;
    }
    to {
      width: var(--sidebar-size);
    }
  }
  @keyframes sidebar-transition-close {
    from {
      width: var(--sidebar-size);
      right:0rem;
    }
    to {
      width: 0rem;
      right: 10rem;
    }
  }
  @keyframes sidebar-transition-non-dynamic {
    from {
      width: 0rem;
      min-width: 0rem;
    }
    to {
      width: var(--sidebar-size);
      min-width: var(--sidebar-size);
    }
  }
  @keyframes sidebar-transition-close-non-dynamic {
    from {
      width: var(--sidebar-size);
      min-width: var(--sidebar-size);
      right:0rem;
    }
    to {
      width: 0rem;
      min-width: 0rem;
      right:3rem;
    }
  }
  @keyframes sub-sidebar-transition {
    from {
      width: 0rem;
      min-width: 0rem;
    }
    to {
      width: 5rem;
      min-width: 5rem;
    }
  }
  @keyframes sub-sidebar-transition-close {
    from {
      width: 5rem;
      min-width: 5rem;
      max-width: 5rem;
      right:0rem;

    }
    to {
      width: 0rem;
      min-width: 0rem;
      max-width: 0rem;
      right: 10rem;
    }
  }
  @keyframes sidebar-dark-animation{
    from {
      background-color: rgba(0,0,0,0) !important;
    }
    to {
      background-color: rgba(0,0,0,0.5) !important;
    }
  }
  @keyframes sidebar-dark-closing-animation{
    from {
      background-color: rgba(0,0,0,0.5) !important;
    }
    to {
      background-color: rgba(0,0,0,0) !important;
    }
  }

  .risu-sidebar:not(.dynamic-sidebar) {
    animation-name: sidebar-transition-non-dynamic;
    animation-duration: var(--risu-animation-speed);
  }
  .risu-sidebar-close:not(.dynamic-sidebar) {
    animation-name: sidebar-transition-close-non-dynamic;
    animation-duration: var(--risu-animation-speed);
    position: relative;
  }
  .risu-sidebar.dynamic-sidebar {
    animation-name: sidebar-transition;
    animation-duration: var(--risu-animation-speed);
  }
  .risu-sidebar-close.dynamic-sidebar {
    animation-name: sidebar-transition-close;
    animation-duration: var(--risu-animation-speed);
    position: relative;
    right: 3rem;
  }


  .risu-sub-sidebar {
    animation-name: sub-sidebar-transition;
    animation-duration: var(--risu-animation-speed);
  }
  .risu-sub-sidebar-close {
    animation-name: sub-sidebar-transition-close;
    animation-duration: var(--risu-animation-speed);
    position: relative;
  }
  .sidebar-dark-animation{
    animation-name: sidebar-dark-transition;
    animation-duration: var(--risu-animation-speed);
    background-color: rgba(0,0,0,0.5)
  }
  .sidebar-dark-close-animation{
    animation-name: sidebar-dark-closing-transition;
    animation-duration: var(--risu-animation-speed);
    background-color: rgba(0,0,0,0)
  }
</style>
