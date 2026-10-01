<script lang="ts">
    import { language } from "src/lang";
    import { openURL } from "src/ts/globalApi.svelte";
    import { FORK_PRIVACY_POLICY_URL, FORK_TERMS_OF_SERVICE_URL } from "src/ts/forkLegalLinks";
</script>

<!-- mt-auto keeps the footer at the bottom of a short menu; in a long menu it follows the last entry and scrolls with it. The footer never sets the sidebar's width in any language: w-0 min-w-full gives it no intrinsic width, so it wraps within the width the menu entries set. -->
<nav class="mt-auto pt-4 w-0 min-w-full flex flex-wrap gap-x-4 gap-y-1 text-xs text-textcolor2 rs-setting-legal-links" aria-label={language.forkLegalLinksLabel}>
    <button type="button" class="hover:text-textcolor focus-visible:text-textcolor underline underline-offset-2"
        onclick={() => {
            openURL(FORK_TERMS_OF_SERVICE_URL)
        }}>{language.forkTermsOfService}</button>
    <button type="button" class="hover:text-textcolor focus-visible:text-textcolor underline underline-offset-2"
        onclick={() => {
            openURL(FORK_PRIVACY_POLICY_URL)
        }}>{language.forkPrivacyPolicy}</button>
</nav>
