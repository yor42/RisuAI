<script lang="ts">
  import { OctagonAlert, SaveIcon } from "@lucide/svelte";
  import { alertMd, alertNormal } from "src/ts/alert";
  import { saving } from "src/ts/globalApi.svelte";
  import { AccountWarning } from "src/ts/storage/accountStorage";
  import { DBState, savingStoppedReason, frozenSaveKeysStore } from "src/ts/stores.svelte";
  import { language } from "src/lang";

  function savingStoppedMessage(reason: string){
    if(reason === 'node-conflict'){
      return language.savingStoppedNodeConflictMessage
    }
    if(reason === 'account-conflict'){
      return language.savingStoppedAccountConflictMessage
    }
    return language.savingStoppedStayMessage
  }

</script>

{#if $savingStoppedReason}
  <button class="absolute top-3 right-3 z-10 text-white bg-red-800 hover:bg-red-600 p-2 rounded-sm" onclick={() =>{
      alertNormal(savingStoppedMessage($savingStoppedReason))
  }}>
      <OctagonAlert size={24} />
  </button>
{:else if $frozenSaveKeysStore.length > 0}
  <button class="absolute top-3 right-3 z-10 text-white bg-red-800 hover:bg-red-600 p-2 rounded-sm" onclick={() =>{
      const groups = $frozenSaveKeysStore.map((k) => k.names.join(' and ')).join('; ')
      alertNormal(language.duplicateChaIdSavePausedMessage(groups))
  }}>
      <OctagonAlert size={24} />
  </button>
{:else if DBState?.db?.showSavingIcon && saving.state}
  <div
    class="absolute top-3 right-3 z-10 text-white p-2 rounded-sm bg-linear-to-br from-blue-500 to-purple-800 saving-animation pointer-events-none opacity-15"
  >
    <SaveIcon size={24} />
  </div>
{:else if $AccountWarning}
  <button class="absolute top-3 right-3 z-10 text-white bg-red-800 hover:bg-red-600 p-2 rounded-sm" onclick={() =>{
      alertMd($AccountWarning)
      $AccountWarning = ''
  }}>
      <OctagonAlert size={24} />
  </button>
{/if}