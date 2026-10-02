<script lang="ts">
	import AlertInertScope from "./AlertInertScope.svelte";
	interface Props {
		children?: import('svelte').Snippet;
	}
	const { children }: Props = $props();
</script>

<AlertInertScope>
	{#if children}
		{@render children()}
	{:else}
		<div class="empty-portal"></div>
	{/if}
</AlertInertScope>