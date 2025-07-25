<script lang="ts">
    import type { character, groupChat, Message } from 'src/ts/storage/database.svelte';
    import { mount, onDestroy, unmount } from 'svelte';
    import Chat from './Chat.svelte';
    import { getCharImage } from 'src/ts/characters';
    import { createSimpleCharacter } from 'src/ts/stores.svelte';

    const {
        messages,
        currentCharacter,
        onReroll,
        unReroll,
        currentUsername,
        userIcon,
        loadPages,
        userIconPortrait
    }:{
        messages: Message[]
        currentCharacter: character|groupChat
        onReroll: () => void
        unReroll: () => void
        currentUsername: string
        userIcon: string
        loadPages: number
        userIconPortrait?: boolean
        
    } = $props();

    let chatBody: HTMLDivElement;
    let hashes: Set<number> = new Set();
    let mountInstances: Map<number, {}> = new Map();

    //Non-cryptographic hash function to generate a unique hash for each message
    function hashCode(str:string):number {
        let hash = 0;
        for (let i = 0, len = str.length; i < len; i++) {
            let chr = str.charCodeAt(i);
            hash = (hash << 5) - hash + chr;
            hash |= 0; // Convert to 32bit integer
        }
        if(hash == 0){
            hash = 1; // Ensure hash is not zero
        }
        return hash;
    }

    const updateChatBody = () => {
        let nextHash = 0;
        let currentHashes: Set<number> = new Set();
        const charImage = getCharImage(currentCharacter.image, 'css')
        const userImage = getCharImage(userIcon, 'css')
        const simpleChar = createSimpleCharacter(currentCharacter);
        for(let i=messages.length - 1 ; i >= messages.length - loadPages; i--){
            if(i < 0) break; // Prevent out of bounds
            const message = messages[i];
            const messageLargePortrait = message.role === 'user' ? (userIconPortrait ?? false) : (currentCharacter as character).largePortrait;
            let hashd = message.data + (message.chatId ?? '') + i.toString() + messageLargePortrait.toString()
            const currentHash = hashCode(hashd);
            currentHashes.add(currentHash);
            if(!hashes.has(currentHash)){
                const b = document.createElement('div');
                b.setAttribute('x-hashed', currentHash.toString());
                b.classList.add('chat-message-container');
                const inst = mount(Chat, {
                    target: b,
                    props: {
                        message: message.data,
                        isLastMemory: false,
                        idx: i,
                        totalLength: messages.length,
                        img: message.role === 'user' ? userImage : charImage,
                        onReroll: onReroll,
                        unReroll: unReroll,
                        rerollIcon: 'dynamic',
                        character: simpleChar,
                        largePortrait: message.role === 'user' ? (userIconPortrait ?? false) : (currentCharacter as character).largePortrait,
                        messageGenerationInfo: message.generationInfo,
                        role: message.role,
                        name: message.role === 'user' ? currentUsername : currentCharacter.name
                    },

                })
                mountInstances.set(currentHash, inst);
                const nextElement = document.querySelector(`[x-hashed="${nextHash}"]`);
                console.log('Update Log\nnew element', currentHash, 'at', nextElement);
                if(nextElement){
                    chatBody.insertBefore(b, nextElement?.nextSibling);
                }
                else{
                    chatBody.prepend(b);
                }
            }
            nextHash = currentHash;
            
        }

        //@ts-ignore since API is available in Corejs
        const toRemove:Set = hashes.difference(currentHashes);
        toRemove.forEach((hash) => {
            const inst = mountInstances.get(hash);
            if(inst){
                unmount(inst);
                mountInstances.delete(hash);
            }
            const element = chatBody.querySelector(`[x-hashed="${hash}"]`);
            if(element){
                chatBody.removeChild(element);
            }
        });

        console.log('Update Log\n',
            `Mounts: ${mountInstances.size}`,
            `Hashes: ${hashes.size}`,
            `Current Hashes: ${currentHashes.size}`,
            `Removed: ${toRemove.size}`,
            messages
        );

        hashes = currentHashes;
        
    };

    onDestroy(() => {
        console.log('Unmounting Chats');
        hashes.clear();
        mountInstances.forEach((inst) => {
            unmount(inst);
        });
        mountInstances.clear();
    })

    $effect(() => {
        console.log('Updating Chats');
        updateChatBody()
    })

</script>
<div class="flex flex-col-reverse" bind:this={chatBody}></div>