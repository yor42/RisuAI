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
  
  // 🔍 MOBILE DRAG DEBUG: 모바일 환경 감지 및 진단 로그
  let isMobileEnvironment = $state(false);
  let touchSupported = $state(false);
  let dragAPISupported = $state(false);
  
  // 모바일 환경 감지 함수
  function detectMobileEnvironment() {
    isMobileEnvironment = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                         'ontouchstart' in window ||
                         navigator.maxTouchPoints > 0;
    touchSupported = 'ontouchstart' in window;
    dragAPISupported = 'ondragstart' in document.createElement('div');
    
    console.log('🔍 [MOBILE DRAG DEBUG] 환경 감지 결과:', {
      isMobileEnvironment,
      touchSupported,
      dragAPISupported,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints
    });
  }
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
    // 🔄 Mobile Drag Drop 라이브러리 import
    import { polyfill } from 'mobile-drag-drop';
    import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";
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
  
  // 아이템 높이 상수 - 실제 DOM 측정값에 맞춤
  const ITEM_HEIGHT = 56; // 아바타 + 여백 (실제 측정값)
  const SPACER_HEIGHT = 16; // 드래그 드롭용 빈 공간 (측정값과 일치)
  
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
            console.log('🔄 [VIRTUAL ITEMS] 폴더 열림 감지:', {
              folderId: char.id,
              folderName: char.name,
              folderItemCount: char.folder.length
            });
            
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
      
      // VirtualItems 생성 완료 시 디버깅 정보
      const totalHeight = items.reduce((sum, item) => sum + item.height, 0);
      const itemTypes = items.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('🔄 [VIRTUAL ITEMS] 생성 완료:', {
        totalItems: items.length,
        totalHeight,
        itemTypes,
        openFolders: openFolders.slice(), // 현재 열린 폴더들
        charImagesLength: charImages.length
      });
      
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
        // 폴더 안전성 체크 추가
        if(!folder || !folder.data || !Array.isArray(folder.data)) {
          console.warn('🔄 [FOLDER ERROR] 유효하지 않은 폴더 데이터:', folder);
          continue;
        }
        
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
    console.log('🔄 [INSERTER DEBUG] inserter 함수 호출:', {
      mainIndex,
      targetIndex,
      characterOrderLength: DBState.db.characterOrder.length,
      characterOrder: DBState.db.characterOrder.map((item, idx) => ({
        index: idx,
        type: typeof item,
        id: typeof item === 'string' ? item : item?.id,
        isFolder: typeof item !== 'string'
      }))
    });
    
    if(mainIndex.index === targetIndex.index && mainIndex.folder === targetIndex.folder){
      console.log('🔄 [INSERTER DEBUG] 동일한 위치로 이동 시도, 무시됨');
      return
    }
    let db = DBState.db
    let mainFolderIndex = mainIndex.folder ? getFolderIndex(mainIndex.folder) : null
    let targetFolderIndex = targetIndex.folder ? getFolderIndex(targetIndex.folder) : null
    let mainFolderId = mainIndex.folder ? (db.characterOrder[mainFolderIndex] as folder).id : ''
    let movingFolder:folder|false = false
    let mainId = ''
    
    console.log('🔄 [INSERTER DEBUG] 폴더 인덱스 정보:', {
      mainFolderIndex,
      targetFolderIndex,
      mainFolderId
    });
    
    if(mainIndex.folder){
      console.log('🔄 [INSERTER DEBUG] 폴더 내부 아이템 이동 처리');
      if(mainFolderIndex === -1 || mainFolderIndex >= db.characterOrder.length) {
        console.error('🔄 [INSERTER ERROR] 유효하지 않은 메인 폴더 인덱스:', mainFolderIndex);
        return;
      }
      const folder = db.characterOrder[mainFolderIndex] as folder;
      if(!folder || !folder.data || mainIndex.index >= folder.data.length) {
        console.error('🔄 [INSERTER ERROR] 유효하지 않은 폴더 아이템 인덱스:', {
          folder,
          folderDataLength: folder?.data?.length,
          requestedIndex: mainIndex.index
        });
        return;
      }
      mainId = folder.data[mainIndex.index];
    }
    else{
      console.log('🔄 [INSERTER DEBUG] 일반 아이템 이동 처리');
      if(mainIndex.index < 0 || mainIndex.index >= db.characterOrder.length) {
        console.error('🔄 [INSERTER ERROR] 유효하지 않은 메인 인덱스:', {
          mainIndex: mainIndex.index,
          characterOrderLength: db.characterOrder.length
        });
        return;
      }
      
      const da = db.characterOrder[mainIndex.index]
      console.log('🔄 [INSERTER DEBUG] 메인 아이템 정보:', {
        mainIndex: mainIndex.index,
        da,
        daType: typeof da,
        daId: typeof da === 'string' ? da : da?.id
      });
      
      if(!da) {
        console.error('🔄 [INSERTER ERROR] characterOrder[mainIndex.index]가 undefined:', {
          mainIndex: mainIndex.index,
          characterOrder: db.characterOrder
        });
        return;
      }
      
      if(typeof(da) !== 'string'){
        if(!da.id) {
          console.error('🔄 [INSERTER ERROR] 폴더 객체에 id가 없음:', da);
          return;
        }
        mainId = da.id
        movingFolder = structuredClone($state.snapshot(da))
        if(targetIndex.folder){
          console.log('🔄 [INSERTER DEBUG] 폴더를 다른 폴더로 이동 불가, 무시됨');
          return
        }
      }
      else{
        mainId = da
      }
    }
    
    console.log('🔄 [INSERTER DEBUG] 이동할 아이템 ID:', mainId);
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
    console.log('🔄 [FOLDER INDEX DEBUG] getFolderIndex 호출:', {
      searchId: id,
      characterOrderLength: DBState.db.characterOrder.length,
      characterOrder: DBState.db.characterOrder.map((item, idx) => ({
        index: idx,
        item,
        type: typeof item,
        id: item && typeof item !== 'string' ? item.id : 'N/A',
        isUndefined: item === undefined,
        isNull: item === null
      }))
    });
    
    for(let i=0;i<DBState.db.characterOrder.length;i++){
      const data = DBState.db.characterOrder[i]
      
      // 안전성 검사: data가 존재하고 유효한지 확인
      if(!data) {
        console.warn('🔄 [FOLDER INDEX DEBUG] characterOrder[' + i + ']가 undefined/null:', data);
        continue;
      }
      
      if(typeof(data) !== 'string' && data.id === id){
        console.log('🔄 [FOLDER INDEX DEBUG] 폴더 인덱스 찾음:', {
          index: i,
          folderId: data.id,
          searchId: id
        });
        return i
      }
    }
    
    console.warn('🔄 [FOLDER INDEX DEBUG] 폴더 인덱스를 찾을 수 없음:', {
      searchId: id,
      availableFolders: DBState.db.characterOrder.filter(item => item && typeof item !== 'string').map(folder => {
        const folderObj = folder as folder;
        return {
          id: folderObj.id,
          name: folderObj.name
        };
      })
    });
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
    console.log('🔍 [DRAG DIAGNOSIS] HTML5 Drag Start 이벤트 발생:', {
      isMobileEnvironment,
      touchSupported,
      dragAPISupported,
      dragIndex: ind,
      eventType: e.type,
      currentTarget: e.currentTarget.tagName,
      currentTargetClasses: e.currentTarget.className
    });
    
    // 내부 캐릭터 드래그 전용 MIME 타입 설정
    e.dataTransfer.setData('application/x-risuai-character', JSON.stringify(ind));
    e.dataTransfer.effectAllowed = 'move';
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
    
    // 🔍 [DRAG DIAGNOSIS] 아바타 요소 찾기 진단
    const avatar = e.currentTarget.querySelector('.avatar')
    const sidebarAvatar = e.currentTarget.querySelector('.sidebar-avatar')
    const avatarImg = e.currentTarget.querySelector('img')
    
    console.log('🔍 [DRAG DIAGNOSIS] 아바타 요소 검색 결과:', {
      avatar: avatar ? {tag: avatar.tagName, classes: avatar.className} : null,
      sidebarAvatar: sidebarAvatar ? {tag: sidebarAvatar.tagName, classes: sidebarAvatar.className} : null,
      avatarImg: avatarImg ? {tag: avatarImg.tagName, src: avatarImg.getAttribute('src')} : null,
      allAvatarElements: Array.from(e.currentTarget.querySelectorAll('[class*="avatar"]')).map(el => ({
        tag: el.tagName,
        classes: el.className
      }))
    });
    
    // 드래그 이미지 설정 시도 및 진단
    let dragImageSet = false;
    if(avatar){
      try {
        e.dataTransfer.setDragImage(avatar, 10, 10);
        dragImageSet = true;
        console.log('🔍 [DRAG DIAGNOSIS] 드래그 이미지 설정 성공: .avatar 요소 사용');
      } catch (error) {
        console.error('🔍 [DRAG DIAGNOSIS] 드래그 이미지 설정 실패 (.avatar):', error);
      }
    } else if(sidebarAvatar) {
      try {
        e.dataTransfer.setDragImage(sidebarAvatar, 10, 10);
        dragImageSet = true;
        console.log('🔍 [DRAG DIAGNOSIS] 드래그 이미지 설정 성공: .sidebar-avatar 요소 사용');
      } catch (error) {
        console.error('🔍 [DRAG DIAGNOSIS] 드래그 이미지 설정 실패 (.sidebar-avatar):', error);
      }
    } else if(avatarImg) {
      try {
        e.dataTransfer.setDragImage(avatarImg, 28, 28);
        dragImageSet = true;
        console.log('🔍 [DRAG DIAGNOSIS] 드래그 이미지 설정 성공: img 요소 사용');
      } catch (error) {
        console.error('🔍 [DRAG DIAGNOSIS] 드래그 이미지 설정 실패 (img):', error);
      }
    }
    
    if (!dragImageSet) {
      console.warn('🔍 [DRAG DIAGNOSIS] 드래그 이미지 설정 실패: 아바타 요소를 찾을 수 없음');
    }
    
    // 드래그 중 시각적 피드백 추가
    e.currentTarget.style.opacity = '0.7';
    console.log('🔍 [DRAG DIAGNOSIS] 드래그 시작 완료');
  }

  const avatarDragOver = (e:DragEv) => {
    console.log('🔍 [MOBILE DRAG DEBUG] HTML5 Drag Over 이벤트 발생');
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const avatarDrop = (ind: Exclude<DragData, null>, e: DragEv) => {
    console.log('🔍 [MOBILE DRAG DEBUG] HTML5 Drop 이벤트 발생:', {
      dropIndex: ind,
      currentDrag,
      isMobileEnvironment
    });
    
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
    console.log('🔍 [DRAG DIAGNOSIS] 드래그 종료 이벤트 발생');
    
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
    
    // 시각적 피드백 초기화
    e.currentTarget.style.opacity = '';
    console.log('🔍 [DRAG DIAGNOSIS] 드래그 종료 완료, 시각적 피드백 초기화');
  }

  // 전역 드래그 종료 이벤트 리스너로 안전장치 제공
  let globalDragEndCleanup: (() => void) | null = null
  
  // 터치 취소 이벤트 전역 처리를 위한 변수
  let globalTouchCancelCleanup: (() => void) | null = null

  onMount(() => {
    // 🔍 MOBILE DRAG DEBUG: 모바일 환경 감지 초기화
    detectMobileEnvironment();
    
    // 🔄 Mobile Drag Drop polyfill 초기화
    if (isMobileEnvironment || touchSupported) {
      console.log('🔄 [MOBILE DRAG SETUP] Mobile drag-drop polyfill 초기화 시작');
      
      try {
        // polyfill 활성화 - 모바일에서 HTML5 드래그 앤 드롭 지원
        polyfill({
          // 드래그 시작 시 자동으로 드래그 이미지 생성
          dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
          // 터치 홀드 지연 시간 (밀리초)
          holdToDrag: 500,
          // 드래그 중 스크롤 영역에서 자동 스크롤 활성화
          dragImageSetup: (element) => {
            // 드래그 이미지 커스터마이징
            if (element) {
              element.style.transform = 'scale(1.1)';
              element.style.opacity = '0.8';
              return element;
            }
            return element;
          }
        });
        
        console.log('🔄 [MOBILE DRAG SETUP] Mobile drag-drop polyfill 초기화 완료');
      } catch (error) {
        console.error('🔄 [MOBILE DRAG SETUP] Mobile drag-drop polyfill 초기화 실패:', error);
      }
    }
    
    const handleGlobalDragEnd = () => {
      console.log('🔍 [MOBILE DRAG DEBUG] Global drag end 이벤트 발생');
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
    
    // 전역 터치 취소 이벤트 리스너 추가
    const handleGlobalTouchCancel = (e: TouchEvent) => {
      console.log('🔄 [GLOBAL TOUCH CANCEL] 전역 터치 취소 이벤트 감지:', {
        touchCount: e.touches.length,
        changedTouchCount: e.changedTouches.length,
        isDragging,
        currentDrag,
        longPressTimer: !!longPressTimer
      });
      
      // 드래그 중이거나 롱 프레스 대기 중인 경우 상태 정리
      if (isDragging || longPressTimer || currentDrag) {
        console.log('🔄 [GLOBAL TOUCH CANCEL] 드래그 상태 강제 정리 시작');
        
        // 롱 프레스 타이머 정리
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          console.log('🔄 [GLOBAL TOUCH CANCEL] 롱 프레스 타이머 정리');
        }
        
        // 상태 초기화
        isDragging = false;
        currentDrag = null;
        
        // VirtualScroll의 setDragging 함수 호출
        if (virtualScrollRef?.setDragging) {
          virtualScrollRef.setDragging(false);
          console.log('🔄 [GLOBAL TOUCH CANCEL] VirtualScroll dragging 상태 false로 설정');
        }
        
        // 터치 드래그용 아바타 제거
        removeTouchDragAvatar();
        console.log('🔄 [GLOBAL TOUCH CANCEL] 터치 드래그 아바타 제거');
        
        // 모든 하이라이트 제거
        document.querySelectorAll('.bg-green-500').forEach(el => {
          el.classList.remove('bg-green-500');
        });
        
        // 시각적 피드백 초기화 - 모든 드래그 가능한 요소에서
        document.querySelectorAll('[role="listitem"]').forEach(element => {
          const htmlElement = element as HTMLElement;
          htmlElement.style.opacity = '';
          htmlElement.style.transform = '';
          htmlElement.style.transition = '';
          htmlElement.style.boxShadow = '';
          htmlElement.style.zIndex = '';
        });
        
        console.log('🔄 [GLOBAL TOUCH CANCEL] 전역 터치 취소 처리 완료');
      }
    };
    
    // 전역 visibility change 이벤트 리스너 (페이지 전환, 앱 전환 등)
    const handleVisibilityChange = () => {
      if (document.hidden && (isDragging || longPressTimer || currentDrag)) {
        console.log('🔄 [VISIBILITY CHANGE] 페이지 숨김 상태에서 드래그 상태 정리');
        handleGlobalTouchCancel(new TouchEvent('touchcancel', {
          touches: [],
          targetTouches: [],
          changedTouches: [],
          bubbles: true,
          cancelable: true
        }));
      }
    };
    
    document.addEventListener('touchcancel', handleGlobalTouchCancel, { passive: false });
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
    
    globalDragEndCleanup = () => {
      document.removeEventListener('dragend', handleGlobalDragEnd)
      document.removeEventListener('dragleave', handleGlobalDragLeave)
    }
    
    globalTouchCancelCleanup = () => {
      document.removeEventListener('touchcancel', handleGlobalTouchCancel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
    
    if (globalTouchCancelCleanup) {
      globalTouchCancelCleanup()
      globalTouchCancelCleanup = null
    }
  })

  const preventAll = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    return false
  }

  // 🔄 터치 드래그 콜백 함수들
  
  // 터치 데이터를 DragData 형식으로 변환
  function convertTouchDataToDragData(touchData: any): DragData {
    console.log('🔄 [TOUCH DRAG] 터치 데이터 변환:', touchData);
    
    if (!touchData) return null;
    
    // VirtualScroll의 터치 데이터에서 인덱스 추출
    if (touchData.index !== undefined) {
      return { index: touchData.index };
    }
    
    // spacer 정보가 있는 경우
    if (touchData.spacerInfo) {
      const spacerInfo = touchData.spacerInfo;
      if (spacerInfo.folderId) {
        return { index: spacerInfo.insertIndex, folder: spacerInfo.folderId };
      } else {
        return { index: spacerInfo.insertIndex };
      }
    }
    
    // folderInfo가 있는 경우 (폴더 내 아이템)
    if (touchData.folderInfo) {
      const folderInfo = touchData.folderInfo;
      return { index: folderInfo.itemIndex, folder: folderInfo.folderId };
    }
    
    return null;
  }

  // DOM 요소에서 드래그 데이터 추출 - 새로운 데이터 속성 기반
  function getTouchDataFromElement(element: HTMLElement): any {
    console.log('🔄 [TOUCH DRAG] DOM 요소에서 데이터 추출:', {
      element,
      tagName: element.tagName,
      className: element.className,
      dataset: element.dataset
    });
    
    if (!element) return null;
    
    // 새로운 data-drag-type 기반 데이터 추출
    const dragType = element.dataset.dragType;
    
    if (dragType === 'spacer') {
      const spacerIndex = element.dataset.spacerIndex;
      const spacerFolder = element.dataset.spacerFolder;
      
      console.log('🔄 [TOUCH DRAG] Spacer 데이터 추출:', {
        spacerIndex,
        spacerFolder
      });
      
      if (spacerIndex !== undefined) {
        const result = {
          spacerInfo: {
            insertIndex: parseInt(spacerIndex),
            folderId: spacerFolder && spacerFolder !== '' ? spacerFolder : undefined
          }
        };
        console.log('🔄 [TOUCH DRAG] Spacer 결과:', result);
        return result;
      }
    } else if (dragType === 'item') {
      const itemIndex = element.dataset.itemIndex;
      
      console.log('🔄 [TOUCH DRAG] Item 데이터 추출:', {
        itemIndex
      });
      
      if (itemIndex !== undefined) {
        const result = { index: parseInt(itemIndex) };
        console.log('🔄 [TOUCH DRAG] Item 결과:', result);
        return result;
      }
    } else if (dragType === 'folder-item') {
      const itemIndex = element.dataset.itemIndex;
      const folderId = element.dataset.folderId;
      
      console.log('🔄 [TOUCH DRAG] Folder-item 데이터 추출:', {
        itemIndex,
        folderId
      });
      
      if (itemIndex !== undefined && folderId) {
        const result = {
          folderInfo: {
            itemIndex: parseInt(itemIndex),
            folderId: folderId
          }
        };
        console.log('🔄 [TOUCH DRAG] Folder-item 결과:', result);
        return result;
      }
    }
    
    // 기존 방식 fallback (호환성)
    const index = element.dataset.index;
    const virtualIndex = element.dataset.virtualIndex;
    
    if (index !== undefined) {
      console.log('🔄 [TOUCH DRAG] 기존 index 방식 fallback:', index);
      return { index: parseInt(index) };
    }
    
    if (virtualIndex !== undefined) {
      console.log('🔄 [TOUCH DRAG] 기존 virtualIndex 방식 fallback:', virtualIndex);
      const virtualIdx = parseInt(virtualIndex);
      if (virtualIdx >= 0 && virtualIdx < virtualItems.length) {
        const virtualItem = virtualItems[virtualIdx];
        
        if (virtualItem.type === 'spacer' && virtualItem.spacerInfo) {
          return { spacerInfo: virtualItem.spacerInfo };
        } else if (virtualItem.type === 'folder-item' && virtualItem.folderInfo) {
          return { folderInfo: virtualItem.folderInfo };
        } else if (virtualItem.originalIndex !== undefined) {
          return { index: virtualItem.originalIndex };
        }
      }
    }
    
    console.warn('🔄 [TOUCH DRAG] 데이터 추출 실패 - 모든 방법 시도함');
    return null;
  }

  // 터치 드래그 시작 처리
  function handleTouchDragStart(data: any, element: HTMLElement) {
    console.log('🔄 [TOUCH DRAG] 터치 드래그 시작:', {
      data,
      element,
      isMobileEnvironment,
      touchSupported
    });
    
    // 터치 데이터를 DragData 형식으로 변환
    const touchData = getTouchDataFromElement(element) || data;
    const dragData = convertTouchDataToDragData(touchData);
    
    if (dragData) {
      currentDrag = dragData;
      
      // VirtualScroll의 setDragging 함수 호출
      if (virtualScrollRef?.setDragging) {
        virtualScrollRef.setDragging(true);
      }
      
      console.log('🔄 [TOUCH DRAG] currentDrag 설정:', currentDrag);
    }
  }

  // 터치 드롭 처리
  function handleTouchDrop(sourceData: any, targetData: any) {
    console.log('🔄 [TOUCH DRAG] 터치 드롭 처리:', {
      sourceData,
      targetData,
      currentDrag,
      isMobileEnvironment
    });
    
    try {
      // 소스 데이터는 currentDrag 사용, 타겟 데이터는 매개변수 사용
      let sourceDragData = currentDrag; // let으로 변경하여 수정 가능하게
      const targetDragData = convertTouchDataToDragData(targetData);
      
      console.log('🔄 [TOUCH DRAG] 드래그 데이터 변환 상세:', {
        sourceDragData,
        targetDragData,
        sourceType: sourceDragData ? (sourceDragData.folder ? 'folder-item' : 'normal-item') : 'null',
        targetType: targetData.spacerInfo ? 'spacer' : 'character'
      });
      
      if (sourceDragData && targetDragData) {
        console.log('🔄 [TOUCH DRAG] 드래그 데이터 변환 완료:', {
          source: sourceDragData,
          target: targetDragData
        });
        
        // 소스 데이터 유효성 검사 - 더 관대한 검사로 race condition 방지
        if(sourceDragData.folder) {
          const folderIndex = getFolderIndex(sourceDragData.folder);
          if(folderIndex === -1) {
            console.warn('🔄 [TOUCH DRAG WARNING] 소스 폴더를 찾을 수 없음 (이미 삭제됨):', sourceDragData.folder);
            // 폴더가 없으면 일반 아이템으로 처리 시도 - 이 경우는 드래그 취소가 더 안전
            console.warn('🔄 [TOUCH DRAG WARNING] 폴더가 삭제된 상태에서 드래그 취소');
            return;
          } else {
            const folder = DBState.db.characterOrder[folderIndex] as folder;
            if(!folder || !folder.data) {
              console.warn('🔄 [TOUCH DRAG WARNING] 폴더 데이터가 유효하지 않음:', folder);
              return;
            }
            
            // 폴더 아이템 인덱스가 범위를 벗어난 경우 - race condition 상황
            if(sourceDragData.index >= folder.data.length) {
              console.warn('🔄 [TOUCH DRAG WARNING] 폴더 아이템 인덱스 범위 초과 (동시 수정됨):', {
                requestedIndex: sourceDragData.index,
                actualLength: folder.data.length,
                folderData: folder.data
              });
              
              // 마지막 유효한 인덱스로 조정
              if(folder.data.length > 0) {
                sourceDragData = { ...sourceDragData, index: folder.data.length - 1 };
                console.log('🔄 [TOUCH DRAG FIX] 인덱스를 마지막 유효한 값으로 조정:', sourceDragData.index);
              } else {
                console.warn('🔄 [TOUCH DRAG WARNING] 폴더가 비어있음, 드래그 취소');
                return;
              }
            }
          }
        } else {
          if(sourceDragData.index < 0 || sourceDragData.index >= DBState.db.characterOrder.length) {
            console.error('🔄 [TOUCH DRAG ERROR] 유효하지 않은 소스 인덱스:', {
              sourceIndex: sourceDragData.index,
              characterOrderLength: DBState.db.characterOrder.length
            });
            return;
          }
        }
        
        // 타겟 종류에 따라 다른 동작 수행
        if (targetData.spacerInfo) {
          // Spacer로 드롭 → 캐릭터 위치 변경 (inserter 호출)
          console.log('🔄 [TOUCH DRAG] Spacer 드롭 감지 → inserter 호출:', {
            spacerInfo: targetData.spacerInfo
          });
          inserter(sourceDragData, targetDragData);
        } else {
          // Character로 드롭 → 폴더 생성 (createFolder 호출)
          console.log('🔄 [TOUCH DRAG] Character 드롭 감지 → createFolder 호출');
          createFolder(sourceDragData, targetDragData);
        }
      } else {
        console.error('🔄 [TOUCH DRAG ERROR] 드래그 데이터 변환 실패:', {
          sourceDragData,
          targetDragData
        });
      }
    } catch (error) {
      console.error('🔄 [TOUCH DRAG ERROR] 터치 드롭 실패:', error);
    } finally {
      // 드래그 상태 정리
      currentDrag = null;
      
      // VirtualScroll의 setDragging 함수 호출
      if (virtualScrollRef?.setDragging) {
        virtualScrollRef.setDragging(false);
      }
    }
  }

  // 터치 드래그 이동 처리 (옵션)
  function handleTouchDragMove(data: any, x: number, y: number) {
    // 현재는 기본 동작으로 충분 - 필요시 추가 로직 구현
    // console.log('🔄 [TOUCH DRAG] 터치 드래그 이동:', { data, x, y });
  }
  
  // 🔄 개별 요소 터치 이벤트 핸들러들
  let touchStartTime = $state(0);
  let touchStartPosition = $state({ x: 0, y: 0 });
  let touchMoveThreshold = 10; // 픽셀 단위 이동 임계값
  let longPressDelay = 500; // 롱 프레스 지연 시간 (밀리초)
  let longPressTimer: number | null = $state(null);
  let isDragging = $state(false);
  
  // 🎨 터치 드래그용 아바타 시스템
  let dragAvatar: HTMLElement | null = $state(null);
  let dragAvatarOffset = $state({ x: 0, y: 0 });
  
  // 터치 드래그용 아바타 생성 - 간소화된 안전한 버전
  function createTouchDragAvatar(sourceElement: HTMLElement, touch: Touch) {
    console.log('🎨 [TOUCH AVATAR] 아바타 생성 시작:', {
      sourceElement: sourceElement.tagName,
      sourceClass: sourceElement.className,
      touchX: touch.clientX,
      touchY: touch.clientY
    });
    
    try {
      // 기존 아바타가 있으면 제거
      removeTouchDragAvatar();
      
      // 소스 요소에서 아바타 이미지 찾기 - 더 넓은 범위로 검색
      let avatarElement: HTMLElement | null = null;
      
      // 1순위: img 태그
      const imgElement = sourceElement.querySelector('img');
      if (imgElement) {
        avatarElement = imgElement;
        console.log('🎨 [TOUCH AVATAR] IMG 요소 발견:', imgElement.src);
      }
      
      // 2순위: SidebarAvatar 컴포넌트
      if (!avatarElement) {
        const sidebarAvatarElement = sourceElement.querySelector('[class*="sidebar-avatar"]') ||
                                     sourceElement.querySelector('[class*="avatar"]');
        if (sidebarAvatarElement) {
          avatarElement = sidebarAvatarElement as HTMLElement;
          console.log('🎨 [TOUCH AVATAR] SidebarAvatar 요소 발견:', sidebarAvatarElement.className);
        }
      }
      
      // 3순위: 소스 요소 자체 사용
      if (!avatarElement) {
        avatarElement = sourceElement;
        console.log('🎨 [TOUCH AVATAR] 소스 요소 자체 사용:', sourceElement.className);
      }
      
      if (!avatarElement) {
        console.error('🎨 [TOUCH AVATAR] 아바타 요소를 찾을 수 없음');
        return;
      }
      
      // 간단한 아바타 컨테이너 생성
      dragAvatar = document.createElement('div');
      dragAvatar.className = 'touch-drag-avatar';
      
      // 기본 스타일 적용
      const avatarStyles = `
        position: fixed;
        top: 0;
        left: 0;
        width: 56px;
        height: 56px;
        pointer-events: none;
        z-index: 9999;
        opacity: 0.8;
        transform: scale(1.1);
        transition: none;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        overflow: hidden;
        background: #333;
      `;
      
      dragAvatar.style.cssText = avatarStyles;
      
      // 아바타 내용 복제 - 안전한 방식
      try {
        const clonedContent = avatarElement.cloneNode(true) as HTMLElement;
        clonedContent.style.cssText = `
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: inherit;
        `;
        dragAvatar.appendChild(clonedContent);
        console.log('🎨 [TOUCH AVATAR] 컨텐츠 복제 성공');
      } catch (cloneError) {
        console.warn('🎨 [TOUCH AVATAR] 복제 실패, 기본 아바타 사용:', cloneError);
        // 복제 실패 시 기본 아바타
        dragAvatar.innerHTML = `<div style="width:100%;height:100%;background:#666;border-radius:inherit;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">📱</div>`;
      }
      
      // 터치 위치에서 오프셋 계산
      dragAvatarOffset = { x: 28, y: 28 }; // 56px / 2
      
      // DOM에 추가
      document.body.appendChild(dragAvatar);
      console.log('🎨 [TOUCH AVATAR] DOM에 추가 완료');
      
      // 초기 위치 설정
      updateTouchDragAvatarPosition(touch.clientX, touch.clientY);
      
      console.log('🎨 [TOUCH AVATAR] 아바타 생성 완료:', {
        avatar: dragAvatar.className,
        offset: dragAvatarOffset,
        position: { x: touch.clientX, y: touch.clientY }
      });
      
    } catch (error) {
      console.error('🎨 [TOUCH AVATAR] 아바타 생성 중 오류:', error);
      removeTouchDragAvatar(); // 실패 시 정리
    }
  }
  
  // 터치 드래그용 아바타 위치 업데이트
  function updateTouchDragAvatarPosition(x: number, y: number) {
    if (!dragAvatar) return;
    
    const finalX = x - dragAvatarOffset.x;
    const finalY = y - dragAvatarOffset.y;
    
    dragAvatar.style.transform = `translate(${finalX}px, ${finalY}px) scale(1.1)`;
  }
  
  // 터치 드래그용 아바타 제거
  function removeTouchDragAvatar() {
    if (dragAvatar) {
      console.log('🎨 [TOUCH AVATAR] 아바타 제거');
      try {
        document.body.removeChild(dragAvatar);
      } catch (error) {
        console.warn('🎨 [TOUCH AVATAR] 아바타 제거 실패 (이미 제거됨):', error);
      }
      dragAvatar = null;
    }
  }
  
  // 터치 시작 이벤트 처리
  function handleElementTouchStart(e: TouchEvent, dragData: DragData) {
    console.log('🔄 [ELEMENT TOUCH] 터치 시작:', {
      dragData,
      touchCount: e.touches.length,
      isMobileEnvironment,
      touchSupported
    });
    
    if (e.touches.length !== 1) return; // 단일 터치만 처리
    
    const touch = e.touches[0];
    touchStartTime = Date.now();
    touchStartPosition = { x: touch.clientX, y: touch.clientY };
    isDragging = false;
    
    // ⚡ 중요: 비동기 콜백에서 사용하기 위해 target을 미리 저장
    const savedTarget = e.currentTarget as HTMLElement;
    
    console.log('🔄 [ELEMENT TOUCH] target 저장:', {
      savedTarget: savedTarget?.tagName,
      savedTargetClass: savedTarget?.className
    });
    
    // 롱 프레스 타이머 설정
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
    
    longPressTimer = window.setTimeout(() => {
      console.log('🔄 [ELEMENT TOUCH] 롱 프레스 감지, 드래그 시작');
      
      // 햅틱 피드백 (모바일에서)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      
      // 드래그 시작
      currentDrag = dragData;
      isDragging = true;
      
      // VirtualScroll의 setDragging 함수 호출
      if (virtualScrollRef?.setDragging) {
        virtualScrollRef.setDragging(true);
      }
      
      // 시각적 피드백 강화 - 드래그 중인 요소 스타일링 (데스크톱과 동일)
      if (savedTarget) {
        savedTarget.style.opacity = '0.7'; // 데스크톱과 동일한 값
        savedTarget.style.transform = 'scale(1.05)';
        savedTarget.style.transition = 'all 0.2s ease';
        savedTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        savedTarget.style.zIndex = '1000';
        
        console.log('🔄 [ELEMENT TOUCH] 시각적 피드백 적용 완료');
      }
      
      // 🎨 터치 드래그용 아바타 생성 - 데스크톱과 동일한 방식
      if (savedTarget) {
        // 현재 터치 위치로 아바타 생성 (touchStartPosition 사용)
        const avatarTouch: Touch = {
          clientX: touchStartPosition.x,
          clientY: touchStartPosition.y,
          identifier: 0,
          pageX: touchStartPosition.x,
          pageY: touchStartPosition.y,
          screenX: touchStartPosition.x,
          screenY: touchStartPosition.y,
          target: savedTarget,
          force: 1,
          radiusX: 0,
          radiusY: 0,
          rotationAngle: 0
        } as Touch;
        
        createTouchDragAvatar(savedTarget, avatarTouch);
        console.log('🎨 [TOUCH AVATAR] 아바타 생성 시도:', {
          target: savedTarget.tagName,
          touchPosition: touchStartPosition
        });
      } else {
        console.error('🔄 [ELEMENT TOUCH] savedTarget이 null/undefined');
      }
      
      longPressTimer = null;
    }, longPressDelay);
  }
  
  // 터치 이동 이벤트 처리
  function handleElementTouchMove(e: TouchEvent) {
    console.log('🔄 [ELEMENT TOUCH] 터치 이동 이벤트 발생:', {
      touchCount: e.touches.length,
      isDragging,
      longPressTimer: !!longPressTimer
    });
    
    if (e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosition.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosition.y);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    console.log('🔄 [ELEMENT TOUCH] 이동 거리:', {
      deltaX,
      deltaY,
      distance,
      threshold: touchMoveThreshold
    });
    
    // 이동 거리가 임계값을 초과하면 롱 프레스 취소
    if (distance > touchMoveThreshold && longPressTimer) {
      console.log('🔄 [ELEMENT TOUCH] 이동 거리 초과, 롱 프레스 취소');
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    
    // 드래그 중인 경우 스크롤 방지 및 시각적 피드백
    if (isDragging) {
      console.log('🔄 [ELEMENT TOUCH] 드래그 중, 피드백 업데이트 시작');
      e.preventDefault();
      
      // 🎨 터치 드래그용 아바타 위치 업데이트
      updateTouchDragAvatarPosition(touch.clientX, touch.clientY);
      
      // 드래그 위치에 따른 시각적 피드백 - 기존 bg-green-500 클래스 재활용
      const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      if (elementBelow) {
        // 이전 하이라이트 제거 (데스크톱과 동일한 클래스 사용)
        document.querySelectorAll('.bg-green-500').forEach(el => {
          el.classList.remove('bg-green-500');
        });
        
        // 드롭 가능한 요소 하이라이트 (spacer 요소를 우선적으로 찾기)
        const dropTarget = elementBelow.closest('[role="listitem"]');
        if (dropTarget && dropTarget !== e.currentTarget) {
          // spacer 요소인 경우 하이라이트 (데스크톱과 동일한 로직)
          if (dropTarget.hasAttribute('data-spacer-index')) {
            dropTarget.classList.add('bg-green-500');
          }
        }
      }
      
      // VirtualScroll의 드래그 오토 스크롤 처리 - MouseEvent 형태로 변환
      console.log('🔄 [ELEMENT TOUCH] 자동 스크롤 체크:', {
        hasVirtualScrollRef: !!virtualScrollRef,
        hasHandleDragAutoScroll: !!(virtualScrollRef?.handleDragAutoScroll),
        virtualScrollRefType: typeof virtualScrollRef,
        virtualScrollRefKeys: virtualScrollRef ? Object.getOwnPropertyNames(virtualScrollRef) : 'null',
        touchY: touch.clientY
      });
      
      // VirtualScroll의 handleDragAutoScroll 함수 시도
      if (virtualScrollRef?.handleDragAutoScroll) {
        const mouseEventLike = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          target: e.target,
          currentTarget: e.currentTarget,
          preventDefault: () => {},
          stopPropagation: () => {},
          type: 'mousemove'
        } as MouseEvent;
        
        console.log('🔄 [ELEMENT TOUCH] VirtualScroll handleDragAutoScroll 호출 시도');
        try {
          virtualScrollRef.handleDragAutoScroll(mouseEventLike);
          console.log('🔄 [ELEMENT TOUCH] VirtualScroll handleDragAutoScroll 호출 성공');
        } catch (autoScrollError) {
          console.error('🔄 [ELEMENT TOUCH] VirtualScroll handleDragAutoScroll 호출 실패:', autoScrollError);
        }
      }
      
      // 강제로 자동 스크롤 시도 - VirtualScroll의 내부 로직 대신 직접 구현 (백업)
      if (virtualScrollRef?.getScrollElement) {
        const scrollElement = virtualScrollRef.getScrollElement();
        console.log('🔄 [ELEMENT TOUCH] 스크롤 요소 확인:', {
          hasScrollElement: !!scrollElement,
          scrollTop: scrollElement?.scrollTop,
          scrollHeight: scrollElement?.scrollHeight,
          clientHeight: scrollElement?.clientHeight
        });
        
        if (scrollElement) {
          const rect = scrollElement.getBoundingClientRect();
          const relativeY = touch.clientY - rect.top;
          const scrollSpeed = 5;
          const scrollZone = 30; // dragScrollZone과 동일
          
          console.log('🔄 [ELEMENT TOUCH] 스크롤 영역 계산:', {
            relativeY,
            scrollZone,
            containerHeight: rect.height,
            isTopZone: relativeY < scrollZone,
            isBottomZone: relativeY > rect.height - scrollZone,
            touchClientY: touch.clientY,
            rectTop: rect.top,
            rectBottom: rect.bottom
          });
          
          // 스크롤 가능 여부 및 경계 조건 확인
          const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
          const currentScrollTop = scrollElement.scrollTop;
          const canScrollUp = currentScrollTop > 0;
          const canScrollDown = currentScrollTop < maxScroll;
          
          console.log('🔄 [ELEMENT TOUCH] 스크롤 상태 확인:', {
            relativeY,
            scrollZone,
            containerHeight: rect.height,
            currentScrollTop,
            maxScroll,
            scrollHeight: scrollElement.scrollHeight,
            clientHeight: scrollElement.clientHeight,
            canScrollUp,
            canScrollDown,
            isInTopZone: relativeY < scrollZone && relativeY >= 0,
            isInBottomZone: relativeY > rect.height - scrollZone && relativeY <= rect.height
          });
          
          // 경계 조건과 스크롤 가능 여부를 모두 확인한 자동 스크롤
          if (relativeY < scrollZone && relativeY >= 0 && canScrollUp) {
            // 위로 스크롤 (스크롤이 가능한 경우에만)
            const oldScrollTop = scrollElement.scrollTop;
            const newScrollTop = Math.max(0, scrollElement.scrollTop - scrollSpeed);
            scrollElement.scrollTop = newScrollTop;
            
            // 실제 스크롤이 발생했는지 확인
            const actualScrollTop = scrollElement.scrollTop;
            const scrollChanged = oldScrollTop !== actualScrollTop;
            
            console.log('🔄 [ELEMENT TOUCH] 위로 스크롤 실행:', {
              oldScrollTop,
              newScrollTop,
              actualScrollTop,
              scrollChanged,
              reachedTop: actualScrollTop === 0
            });
            
            // 스크롤이 더 이상 변경되지 않으면 경고
            if (!scrollChanged) {
              console.warn('🔄 [ELEMENT TOUCH] 위로 스크롤 더 이상 불가능 - 최상단 도달');
            }
          } else if (relativeY > rect.height - scrollZone && relativeY <= rect.height && canScrollDown) {
            // 아래로 스크롤 (스크롤이 가능한 경우에만)
            const oldScrollTop = scrollElement.scrollTop;
            const newScrollTop = Math.min(maxScroll, scrollElement.scrollTop + scrollSpeed);
            scrollElement.scrollTop = newScrollTop;
            
            // 실제 스크롤이 발생했는지 확인
            const actualScrollTop = scrollElement.scrollTop;
            const scrollChanged = oldScrollTop !== actualScrollTop;
            
            console.log('🔄 [ELEMENT TOUCH] 아래로 스크롤 실행:', {
              oldScrollTop,
              newScrollTop,
              actualScrollTop,
              maxScroll,
              scrollChanged,
              reachedBottom: actualScrollTop >= maxScroll
            });
            
            // 스크롤이 더 이상 변경되지 않으면 경고
            if (!scrollChanged) {
              console.warn('🔄 [ELEMENT TOUCH] 아래로 스크롤 더 이상 불가능 - 최하단 도달');
            }
          } else {
            let skipReason = '';
            if (relativeY < scrollZone && relativeY >= 0 && !canScrollUp) {
              skipReason = '위로 스크롤 불가능 (최상단 도달)';
            } else if (relativeY > rect.height - scrollZone && relativeY <= rect.height && !canScrollDown) {
              skipReason = '아래로 스크롤 불가능 (최하단 도달)';
            } else {
              skipReason = '스크롤 영역 밖';
            }
            
            console.log('🔄 [ELEMENT TOUCH] 스크롤 스킵:', {
              reason: skipReason,
              relativeY,
              topZone: scrollZone,
              bottomZone: rect.height - scrollZone,
              isInTopZone: relativeY < scrollZone,
              isInBottomZone: relativeY > rect.height - scrollZone,
              canScrollUp,
              canScrollDown
            });
          }
        }
      } else {
        console.warn('🔄 [ELEMENT TOUCH] getScrollElement 함수가 없음');
      }
    } else {
      console.log('🔄 [ELEMENT TOUCH] 드래그 중이 아님, 자동 스크롤 스킵');
    }
  }
  
  // 터치 종료 이벤트 처리
  function handleElementTouchEnd(e: TouchEvent) {
    console.log('🔄 [ELEMENT TOUCH] 터치 종료:', {
      isDragging,
      currentDrag,
      touchDuration: Date.now() - touchStartTime
    });
    
    // 롱 프레스 타이머 정리
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    
    // 드래그 중이었다면 드롭 처리
    if (isDragging && currentDrag) {
      // 터치 위치에서 요소 찾기
      const touch = e.changedTouches[0];
      console.log('🔄 [ELEMENT TOUCH] 터치 종료 위치:', {
        x: touch.clientX,
        y: touch.clientY
      });
      
      const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      console.log('🔄 [ELEMENT TOUCH] 터치 위치의 요소:', {
        element: elementBelow,
        tagName: elementBelow?.tagName,
        className: elementBelow?.className,
        role: elementBelow?.getAttribute('role')
      });
      
      if (elementBelow) {
        // 첫 번째 시도: 정확한 드롭 대상 찾기
        let dropTarget = elementBelow.closest('[role="listitem"]');
        
        // virtual-scroll-spacer인 경우 특별 처리
        if (!dropTarget && elementBelow.classList.contains('virtual-scroll-spacer')) {
          console.log('🔄 [ELEMENT TOUCH] virtual-scroll-spacer 감지, 가장 가까운 listitem 찾기');
          
          // 터치 위치와 가장 가까운 listitem 찾기
          const allListItems = document.querySelectorAll('[role="listitem"]');
          let closestItem: Element | null = null;
          let closestDistance = Infinity;
          
          Array.from(allListItems).forEach(item => {
            const bounds = item.getBoundingClientRect();
            const itemCenterY = bounds.top + bounds.height / 2;
            const distance = Math.abs(touch.clientY - itemCenterY);
            
            if (distance < closestDistance) {
              closestDistance = distance;
              closestItem = item;
            }
          });
          
          dropTarget = closestItem;
          console.log('🔄 [ELEMENT TOUCH] 가장 가까운 listitem:', {
            dropTarget,
            distance: closestDistance,
            bounds: dropTarget?.getBoundingClientRect()
          });
        }
        
        console.log('🔄 [ELEMENT TOUCH] 드롭 대상 검색:', {
          dropTarget,
          dropTargetTag: dropTarget?.tagName,
          dropTargetClass: dropTarget?.className,
          dropTargetRole: dropTarget?.getAttribute('role')
        });
        
        if (dropTarget) {
          const dropData = getTouchDataFromElement(dropTarget as HTMLElement);
          console.log('🔄 [ELEMENT TOUCH] 드롭 데이터 추출:', dropData);
          
          if (dropData) {
            console.log('🔄 [ELEMENT TOUCH] 드롭 대상 발견, 드롭 처리 시작:', {
              source: currentDrag,
              target: dropData
            });
            handleTouchDrop(currentDrag, dropData);
          } else {
            console.warn('🔄 [ELEMENT TOUCH] 드롭 데이터 추출 실패');
          }
        } else {
          console.warn('🔄 [ELEMENT TOUCH] 드롭 대상을 찾을 수 없음');
          
          // 디버깅용: 모든 listitem 요소들과 그 위치 정보
          const allListItems = document.querySelectorAll('[role="listitem"]');
          console.log('🔄 [ELEMENT TOUCH] 전체 listitem 요소들:', Array.from(allListItems).map(item => ({
            element: item,
            tagName: item.tagName,
            className: item.className,
            bounds: item.getBoundingClientRect()
          })));
        }
      } else {
        console.warn('🔄 [ELEMENT TOUCH] 터치 위치에 요소가 없음');
      }
    }
    
    // 상태 초기화
    isDragging = false;
    currentDrag = null;
    
    // VirtualScroll의 setDragging 함수 호출
    if (virtualScrollRef?.setDragging) {
      virtualScrollRef.setDragging(false);
    }
    
    // 🎨 터치 드래그용 아바타 제거
    removeTouchDragAvatar();
    
    // 시각적 피드백 초기화
    const target = e.currentTarget as HTMLElement;
    if (target) {
      target.style.opacity = '';
      target.style.transform = '';
      target.style.transition = '';
      target.style.boxShadow = '';
      target.style.zIndex = '';
    }
    
    // 모든 하이라이트 제거 (데스크톱과 동일한 클래스)
    document.querySelectorAll('.bg-green-500').forEach(el => {
      el.classList.remove('bg-green-500');
    });
  }
  
  // 터치 취소 이벤트 처리
  function handleElementTouchCancel(e: TouchEvent) {
    console.log('🔄 [ELEMENT TOUCH] 터치 취소 이벤트 발생:', {
      touchCount: e.touches.length,
      changedTouchCount: e.changedTouches.length,
      isDragging,
      currentDrag,
      longPressTimer: !!longPressTimer,
      target: e.target,
      currentTarget: e.currentTarget
    });
    
    // 롱 프레스 타이머 정리
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    
    // 상태 초기화
    isDragging = false;
    currentDrag = null;
    
    // VirtualScroll의 setDragging 함수 호출
    if (virtualScrollRef?.setDragging) {
      virtualScrollRef.setDragging(false);
    }
    
    // 🎨 터치 드래그용 아바타 제거
    removeTouchDragAvatar();
    
    // 시각적 피드백 초기화
    const target = e.currentTarget as HTMLElement;
    if (target) {
      target.style.opacity = '';
      target.style.transform = '';
      target.style.transition = '';
      target.style.boxShadow = '';
      target.style.zIndex = '';
    }
    
    // 모든 하이라이트 제거 (데스크톱과 동일한 클래스)
    document.querySelectorAll('.bg-green-500').forEach(el => {
      el.classList.remove('bg-green-500');
    });
  }
  
  // 🔄 Non-passive 터치 이벤트 등록을 위한 action
  function setupTouchEvents(element: HTMLElement, dragData: DragData) {
    const touchStartHandler = (e: TouchEvent) => handleElementTouchStart(e, dragData);
    const touchMoveHandler = (e: TouchEvent) => handleElementTouchMove(e);
    const touchEndHandler = (e: TouchEvent) => handleElementTouchEnd(e);
    const touchCancelHandler = (e: TouchEvent) => handleElementTouchCancel(e);
    
    // Non-passive로 이벤트 리스너 등록
    element.addEventListener('touchstart', touchStartHandler, { passive: false });
    element.addEventListener('touchmove', touchMoveHandler, { passive: false });
    element.addEventListener('touchend', touchEndHandler, { passive: false });
    element.addEventListener('touchcancel', touchCancelHandler, { passive: false });
    
    return {
      destroy() {
        element.removeEventListener('touchstart', touchStartHandler);
        element.removeEventListener('touchmove', touchMoveHandler);
        element.removeEventListener('touchend', touchEndHandler);
        element.removeEventListener('touchcancel', touchCancelHandler);
      }
    };
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
      supportTouchDrag={false}
    >
      {#snippet children(item: VirtualScrollItem, index: number)}
        {#if item.type === 'spacer'}
          <div
            class="h-4 min-h-4 w-14"
            role="listitem"
            data-drag-type="spacer"
            data-spacer-index={item.spacerInfo?.insertIndex ?? 0}
            data-spacer-folder={item.spacerInfo?.folderId ?? ''}
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
          data-drag-type="item"
          data-item-index={ind}
          draggable="true"
          ondragstart={(e) => {avatarDragStart({index: ind}, e)}}
          ondragend={(e) => {avatarDragEnd(e)}}
          ondragover={avatarDragOver}
          ondrop={(e) => {avatarDrop({index: ind}, e)}}
          ondragenter={preventAll}
          use:setupTouchEvents={{index: ind}}
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
                    
                    console.log('🔄 [FOLDER TOGGLE] 폴더 상태 변경 시작:', {
                      folderId: char.id,
                      folderName: char.name,
                      wasOpen,
                      isDragging,
                      currentDrag
                    });
                    
                    // 드래그 중일 때 폴더 상태 변경 방지
                    if (isDragging || currentDrag) {
                      console.warn('🔄 [FOLDER TOGGLE] 드래그 중에는 폴더 상태 변경 불가');
                      return;
                    }
                    
                    if(wasOpen){
                      const removeIndex = openFolders.indexOf(char.id);
                      openFolders.splice(removeIndex, 1)
                    }
                    else{
                      openFolders.push(char.id)
                    }
                    openFolders = openFolders;
                    
                    // 폴더 상태 변경 후 VirtualScroll 강제 업데이트
                    console.log('🔄 [FOLDER TOGGLE] VirtualScroll 강제 업데이트 시작');
                    console.log('🔍 [FOLDER TOGGLE DEBUG] virtualScrollRef:', virtualScrollRef);
                    console.log('🔍 [FOLDER TOGGLE DEBUG] virtualScrollRef 타입:', typeof virtualScrollRef);
                    console.log('🔍 [FOLDER TOGGLE DEBUG] forceUpdate 함수 존재:', !!virtualScrollRef?.forceUpdate);
                    console.log('🔍 [FOLDER TOGGLE DEBUG] virtualScrollRef 키들:', virtualScrollRef ? Object.getOwnPropertyNames(virtualScrollRef) : 'null');
                    
                    if (virtualScrollRef?.forceUpdate) {
                      try {
                        virtualScrollRef.forceUpdate();
                        console.log('🔄 [FOLDER TOGGLE] VirtualScroll forceUpdate 완료');
                      } catch (error) {
                        console.error('🚨 [FOLDER TOGGLE] forceUpdate 호출 실패:', error);
                      }
                    } else {
                      console.warn('🚨 [FOLDER TOGGLE] VirtualScroll 컴포넌트 또는 forceUpdate 함수 없음');
                    }
                    
                    // 약간의 지연 후 추가 업데이트 (DOM 렌더링 완료 대기)
                    setTimeout(() => {
                      if (virtualScrollRef?.forceUpdate) {
                        virtualScrollRef.forceUpdate();
                        console.log('🔄 [FOLDER TOGGLE] VirtualScroll 지연 업데이트 완료');
                      }
                      
                      // 스크롤 컨테이너 높이 정보 확인
                      const scrollElement = virtualScrollRef?.getScrollElement?.();
                      if (scrollElement) {
                        // VirtualScroll의 실제 totalHeight 값 확인 (내부 state)
                        const spacerElement = scrollElement.querySelector('.virtual-scroll-spacer');
                        const actualVirtualScrollHeight = spacerElement ? parseInt(spacerElement.style.height) : 0;
                        
                        // 실제 렌더링된 요소들의 높이 측정
                        const renderedItems = scrollElement.querySelectorAll('.virtual-scroll-item');
                        const itemHeights: number[] = [];
                        const spacerHeights: number[] = [];
                        
                        renderedItems.forEach((item, idx) => {
                          const element = item as HTMLElement;
                          const height = element.offsetHeight;
                          const role = element.getAttribute('role');
                          const dragType = element.dataset.dragType;
                          
                          if (dragType === 'spacer') {
                            spacerHeights.push(height);
                          } else {
                            itemHeights.push(height);
                          }
                        });
                        
                        const avgItemHeight = itemHeights.length > 0 ? itemHeights.reduce((a, b) => a + b, 0) / itemHeights.length : 0;
                        const avgSpacerHeight = spacerHeights.length > 0 ? spacerHeights.reduce((a, b) => a + b, 0) / spacerHeights.length : 0;
                        
                        console.log('🔍 [DOM HEIGHT MEASUREMENT] 실제 렌더링된 요소 높이 측정:', {
                          currentItemHeight: ITEM_HEIGHT,
                          currentSpacerHeight: SPACER_HEIGHT,
                          measuredItemHeights: itemHeights,
                          measuredSpacerHeights: spacerHeights,
                          avgItemHeight: Math.round(avgItemHeight),
                          avgSpacerHeight: Math.round(avgSpacerHeight),
                          renderedItemCount: renderedItems.length,
                          heightDifference: actualVirtualScrollHeight - virtualItems.reduce((sum, item) => sum + item.height, 0)
                        });
                        
                        console.log('🔍 [SCROLL HEIGHT DEBUG] 스크롤 컨테이너 높이 정보:', {
                          scrollHeight: scrollElement.scrollHeight,
                          clientHeight: scrollElement.clientHeight,
                          offsetHeight: scrollElement.offsetHeight,
                          scrollTop: scrollElement.scrollTop,
                          maxScroll: scrollElement.scrollHeight - scrollElement.clientHeight,
                          virtualItemsLength: virtualItems.length,
                          expectedTotalHeight: virtualItems.reduce((sum, item) => sum + item.height, 0),
                          actualVirtualScrollHeight: actualVirtualScrollHeight,
                          spacerElementStyle: spacerElement ? spacerElement.style.height : 'not found',
                          heightDifference: scrollElement.scrollHeight - virtualItems.reduce((sum, item) => sum + item.height, 0)
                        });
                      }
                    }, 100);
                  }
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    if(char.type === "normal"){
                      changeChar(char.index, {reseter});
                    } else if(char.type === "folder"){
                      const wasOpen = openFolders.includes(char.id);
                      
                      console.log('🔄 [FOLDER TOGGLE KEYBOARD] 키보드로 폴더 상태 변경:', {
                        folderId: char.id,
                        wasOpen,
                        isDragging,
                        currentDrag
                      });
                      
                      // 드래그 중일 때 폴더 상태 변경 방지
                      if (isDragging || currentDrag) {
                        console.warn('🔄 [FOLDER TOGGLE KEYBOARD] 드래그 중에는 폴더 상태 변경 불가');
                        return;
                      }
                      
                      if(wasOpen){
                        openFolders.splice(openFolders.indexOf(char.id), 1)
                      }
                      else{
                        openFolders.push(char.id)
                      }
                      openFolders = openFolders;
                      
                      // VirtualScroll 강제 업데이트
                      console.log('🔍 [FOLDER TOGGLE KEYBOARD DEBUG] virtualScrollRef:', virtualScrollRef);
                      console.log('🔍 [FOLDER TOGGLE KEYBOARD DEBUG] forceUpdate 함수 존재:', !!virtualScrollRef?.forceUpdate);
                      
                      if (virtualScrollRef?.forceUpdate) {
                        try {
                          virtualScrollRef.forceUpdate();
                          console.log('🔄 [FOLDER TOGGLE KEYBOARD] VirtualScroll forceUpdate 완료');
                        } catch (error) {
                          console.error('🚨 [FOLDER TOGGLE KEYBOARD] forceUpdate 호출 실패:', error);
                        }
                      } else {
                        console.warn('🚨 [FOLDER TOGGLE KEYBOARD] VirtualScroll 컴포넌트 또는 forceUpdate 함수 없음');
                      }
                      
                      setTimeout(() => {
                        if (virtualScrollRef?.forceUpdate) {
                          virtualScrollRef.forceUpdate();
                          console.log('🔄 [FOLDER TOGGLE KEYBOARD] VirtualScroll 지연 업데이트 완료');
                        }
                      }, 100);
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
              data-drag-type="folder-item"
              data-item-index={folderInfo.itemIndex}
              data-folder-id={folderInfo.folderId}
              draggable="true"
              ondragstart={(e) => {avatarDragStart({index: folderInfo.itemIndex, folder: folderInfo.folderId}, e)}}
              ondragend={(e) => {avatarDragEnd(e)}}
              ondragover={avatarDragOver}
              ondrop={(e) => {avatarDrop({index: folderInfo.itemIndex, folder: folderInfo.folderId}, e)}}
              ondragenter={preventAll}
              use:setupTouchEvents={{index: folderInfo.itemIndex, folder: folderInfo.folderId}}
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
