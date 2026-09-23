<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import Hub from "./Realm/RealmMain.svelte";
    import { OpenRealmStore, RealmInitialOpenChar } from "src/ts/stores.svelte";
    import { ArrowLeft, ArrowRight, Compass, FolderCodeIcon, GlobeIcon, MailIcon, Send } from "@lucide/svelte";
    import { getVersionString, openURL } from "src/ts/globalApi.svelte";
    import { language } from "src/lang";
    import { getRisuHub, type hubType } from "src/ts/characterCards";
    import { handleHubHtmlClick, sanitizeHubHtml } from "src/ts/hubHtml";
    import RealmPreviewRow from "./Realm/RealmPreviewRow.svelte";
    import Title from "./Title.svelte";

    type RelatedLink = {
      title: string;
      description: string;
      href: string;
      logoIcon: "source" | "globe" | "mail" | "paper-airplane";
    };

    const relatedLinkIconClass =
      "h-40 w-40 md:h-44 md:w-44 origin-right -rotate-12 opacity-[0.12] transition-all duration-500 group-hover:scale-105 group-hover:opacity-[0.22]";

    const relatedLinks: RelatedLink[] = [
      {
        title: language.homeLinkDiscordTitle,
        description: language.homeLinkDiscordDescription,
        href: "https://discord.gg/Exy3NrqkGm",
        logoIcon: "paper-airplane"
      },
      {
        title: language.homeLinkWebsiteTitle,
        description: language.homeLinkWebsiteDescription,
        href: "https://risuai.net",
        logoIcon: "globe"
      },
      {
        title: language.homeLinkGithubTitle,
        description: language.homeLinkGithubDescription,
        href: "https://github.com/kwaroran/RisuAI",
        logoIcon: "source"
      },
      {
        title: language.homeLinkEmailTitle,
        description: language.homeLinkEmailDescription,
        href: "mailto:support@risuai.net",
        logoIcon: "mail"
      }
    ];

    // Five-state model replacing the old `{#await}` — offline/pending/
    // failed/empty/populated, the card list, the announcement string, and
    // a load function the Retry control below calls — so failure reads as
    // distinguishable from empty (`MC-056`), pending is visibly announced
    // (`MC-057`), and offline gets its own inert control (`MC-060`).
    type HubPreviewStatus = 'offline' | 'pending' | 'failed' | 'empty' | 'populated';

    let hubStatus: HubPreviewStatus = $state('pending');
    let hubCards: hubType[] = $state([]);
    let hubAnnouncement = $state('');

    // Monotonic generation counter: guards every state write below (offline,
    // pending, success and failure alike) so a superseded request's late
    // resolution can never stomp a newer request's result.
    let hubGeneration = 0;

    async function loadHubPreview() {
      // Captured, then written before the request-issuing await below:
      // nothing else can run between the increment and this write (both
      // happen synchronously), so it is always the newest generation at
      // the moment it is written.
      const generation = ++hubGeneration;
      hubStatus = 'pending';

      // `getRisuHub` itself classifies "offline" (checked before any fetch
      // is issued) alongside every other failure reason.
      const result = await getRisuHub({
        search: '',
        page: 0,
        nsfw: false,
        sort: 'recommended'
      });

      if (generation !== hubGeneration) {
        return;
      }

      if (result.ok !== true) {
        hubStatus = result.reason === 'offline' ? 'offline' : 'failed';
        return;
      }

      // Only ever assign non-empty announcements: this reproduces the old
      // module-global cache's "keep the previous value" behaviour now that
      // the value lives in per-consumer $state instead.
      if (result.additionalHTML) {
        hubAnnouncement = result.additionalHTML;
      }
      hubCards = result.cards;
      hubStatus = result.cards.length > 0 ? 'populated' : 'empty';
    }

    // `DBState.db` is reassigned wholesale on backup restore, account sync,
    // Kei restore, plugin setDatabase and many command.ts paths. An effect
    // that reads `DBState.db.hideRealm` directly would depend on the
    // container and refetch on every one of those reassignments even when
    // hideRealm itself didn't change. Deriving the boolean first means the
    // effect depends on the value: Svelte 5 doesn't propagate a $derived
    // recompute that lands on the same value, so a DBState.db swap that
    // leaves hideRealm alone no longer triggers a refetch.
    const realmHidden = $derived(DBState.db.hideRealm);

    $effect(() => {
      if (!realmHidden) {
        loadHubPreview();
      }
    });

    // Recover automatically: leave the offline state and reload as soon as
    // the browser reports connectivity again, instead of stranding the
    // user until they find the (inert, in that state) retry control. Also
    // checked against `realmHidden`: without it, a whole-`DBState.db` swap
    // (plugin setDatabase, account sync, backup restore, the command.ts
    // paths named in the comment above) that turns hideRealm on while this
    // component stays mounted would still let a later `online` event fetch
    // the hub for a user who opted out, since `hubStatus` is never reset by
    // that swap on its own.
    $effect(() => {
      function handleOnline() {
        if (hubStatus === 'offline' && !realmHidden) {
          loadHubPreview();
        }
      }
      window.addEventListener('online', handleOnline);
      return () => window.removeEventListener('online', handleOnline);
    });

    // Delegated click target for the card's browse action: a click
    // anywhere on the card that did not originate inside the scrollable
    // entries list opens RisuRealm, using
    // the same delegated `closest` check hubHtml.ts's handleHubHtmlClick
    // uses, against a stable hook on the list container, so it keeps
    // working if the rows are restructured. The Retry controls in the
    // non-populated states below stop their own click's propagation so
    // this handler doesn't also fire on top of them — retrying is not
    // "browse", and the offline control must stay fully inert.
    function handleCardClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-realm-preview-list]')) {
        return;
      }
      $OpenRealmStore = true;
    }
</script>
<div class="h-full w-full flex flex-col overflow-y-auto items-center">
    {#if !$OpenRealmStore}
      <Title />
      <h3 class="text-textcolor2 mt-1">{language.homeVersion} {getVersionString()}</h3>
    {/if}
    <div class="w-full flex p-4 flex-col text-textcolor max-w-4xl">
      {#if !$OpenRealmStore}
        <div class="grid w-full grid-cols-1 gap-4 p-2 md:grid-cols-2 lg:grid-cols-3">
          {#each relatedLinks as relatedLink}
            <button class="group relative flex min-h-[140px] flex-col justify-center overflow-hidden rounded-2xl border border-borderc/10 bg-darkbg p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-borderc/30 hover:bg-selected/50 hover:shadow-xl hover:shadow-darkbg/50" onclick={() => {
              openURL(relatedLink.href)
            }}>
              <div class="relative z-10 w-[68%] sm:w-[70%]">
                  <h2 class="text-2xl font-bold tracking-tight text-textcolor">{relatedLink.title}</h2>
                  <span class="mt-2 block text-base leading-relaxed text-textcolor2">
                    {relatedLink.description}
                  </span>
              </div>

              <div aria-hidden="true" class="pointer-events-none absolute -right-12 top-1/2 -translate-y-1/2 text-textcolor">
                  {#if relatedLink.logoIcon === "globe"}
                    <GlobeIcon class={relatedLinkIconClass} strokeWidth={1} />
                  {:else if relatedLink.logoIcon === "mail"}
                    <MailIcon class={relatedLinkIconClass} strokeWidth={1} />
                  {:else if relatedLink.logoIcon === "paper-airplane"}
                    <Send class={relatedLinkIconClass} strokeWidth={1} />
                  {:else if relatedLink.logoIcon === "source"}
                    <FolderCodeIcon class={relatedLinkIconClass} strokeWidth={1} />
                  {/if}
              </div>
            </button>
          {/each}
          {#if !realmHidden}
            <!--
              Fifth grid child, last in DOM order: on mobile every link card
              stacks above it, so the realm preview can no longer push
              Related Links below the fold; on desktop it sits beside and
              below the link cards.

              lg:col-span-1 is load-bearing, not redundant: both the md: and
              lg: breakpoints are live at >=1024px, and md:col-span-2 emits
              the `grid-column` shorthand (sets both start and end) while
              lg:col-start-3 is a longhand that only overrides the start.
              Without an lg: span reset, the end stays `span 2` and the card
              spills into a fabricated fourth column track. Verified by
              compiling this exact class list through the repo's own
              tailwindcss build rather than assumed.

              This div is deliberately not a <button>: realmDirectOpen is a
              persisted setting whose help text promises that clicking a
              character in the preview opens that character, and this file
              is the only reader of it. A single wrapping <button> would
              silently disable that setting (interactive children inside a
              button are invalid) while the setting kept appearing in
              Advanced Settings, so the preview rows and the offline/failed
              Retry controls below stay their own buttons.

              The card itself is still the browse target: a click anywhere
              on it that isn't the scrollable entries list, or one of the
              Retry controls (which
              stop their own click's propagation to keep their own
              meaning), opens RisuRealm — see handleCardClick above — and
              the hover lift, brighter-on-hover background and decorative
              icon mirror the other Related Links cards' treatment so the
              whole card reads as clickable. A click handler on a div is
              mouse-only, so the title below is its own focusable button
              carrying the browse label, keeping a keyboard path into the
              same action.
            -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!--
              The ceiling belongs on the scrollable list, not the card: capping
              the list at a fixed height keeps the card's own intrinsic height
              (padding + header + description + that constant list height)
              the same whether hubStatus is pending or populated, which is
              what actually stops MC-053's layout shift on fetch resolution.
              The card itself carries no unqualified max-height, so it stays
              an ordinary grid item and stretches to fill its grid area
              instead of falling short of it. min-h-0 on the list is still
              required: without it the flex item refuses to shrink below its
              own content and overflow-y-auto never engages.

              lg:min-h-[380px] is not cosmetic. The list's cap grows to
              lg:max-h-[200px] below (see that comment), and the card's
              required height must stay under whatever height is actually
              available at each breakpoint or the fetch-time shift comes
              back — a bigger cap needs a bigger floor to still fit inside.
              At lg the grid area is driven by the neighbouring link cards'
              wrapped descriptions and comfortably clears 380px in current
              measurements; below lg the card is a full-width single-row
              item sitting at the plain 296px floor, so it keeps the smaller
              cap instead of forcing a tall solid block onto tablet widths.
            -->
            <div
              class="group relative flex min-h-[296px] lg:min-h-[380px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-borderc/10 bg-primary-500 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary-300 hover:bg-primary-400 hover:shadow-xl hover:shadow-darkbg/50 md:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:row-span-2"
              onclick={handleCardClick}
            >
              <div class="relative z-10 mb-2 flex flex-col">
                <button
                  class="w-fit border-0 bg-transparent p-0 text-left text-2xl font-bold tracking-tight text-textcolor hover:underline"
                  aria-label={language.hubBrowseMore}
                  onclick={() => {
                    $OpenRealmStore = true
                  }}
                >{language.hub}</button>
                <span class="mt-1 block text-base leading-relaxed text-textcolor/80">{language.hubDescription}</span>
              </div>
              {#if hubStatus === 'populated'}
                <!--
                  The dark backing panel is a separate wrapper around the
                  scroller, not merged onto it, because the panel's own
                  padding would otherwise eat into the fixed max-h budget
                  below and shrink the visible rows. The panel is sized to
                  its content (no grow), so it hugs the scrollable area
                  itself rather than stretching to fill the rest of the card
                  — the leftover space below it, where the decorative
                  compass icon bleeds, is left as plain card background.
                  Keeping the cap, min-h-0 and overflow-y-auto together on
                  the inner scroller is what holds the card's intrinsic
                  height constant across hubStatus states — the panel is
                  purely a background, not a layout change.
                  data-realm-preview-list stays on the outer panel so
                  handleCardClick's delegated closest() check bails on
                  clicks anywhere in the panel's padding too, not just on
                  the rows themselves.

                  max-h-[150px] lg:max-h-[200px]: a single cap across every
                  width does not work. The cap and the card's lg:min-h-[380px]
                  above move together — the cap must stay small enough that
                  the card's required height (padding + header + description
                  + this cap) never exceeds the height actually available at
                  that breakpoint, or the card grows past its floor and
                  MC-053's fetch-time shift comes straight back. 150 clears
                  the smaller-breakpoint floor of 296; 200 needs the taller
                  380 floor at lg to still clear the available grid area.
                  Raising either number without raising its partner
                  reintroduces the shift — verify both again with real
                  measurements before changing either.
                -->
                <div class="relative z-10 rounded-lg bg-black/30 p-2" data-realm-preview-list>
                  <div class="flex min-h-0 max-h-[150px] lg:max-h-[200px] flex-col gap-1 overflow-y-auto">
                    <!-- Clamped to 10, not the full page of results: every
                         row is its own button in the tab order, and a page
                         of hub results is dozens of cards. The clamp bounds
                         keyboard cost while this scrollable frame still
                         gives browsing value. -->
                    {#each hubCards.slice(0, 10) as chara}
                        <RealmPreviewRow onClick={() => {
                          $OpenRealmStore = true
                          if(DBState.db.realmDirectOpen){
                              $RealmInitialOpenChar = chara
                          }
                        }} chara={chara} />
                    {/each}
                  </div>
                </div>
              {:else}
                <!-- All non-populated messages (pending/failed/empty/offline)
                     share one announced region, so a screen reader hears the
                     transition between them, including into and out of
                     offline. -->
                <div role="status" aria-live="polite" class="relative z-10 flex grow flex-col items-center justify-center gap-2 text-center text-textcolor/80">
                  {#if hubStatus === 'pending'}
                    <div class="h-8 w-8 rounded-full border-2 border-textcolor border-t-transparent animate-spin"></div>
                    <span>{language.loading}...</span>
                  {:else if hubStatus === 'offline'}
                    <span>{language.hubOffline}</span>
                    <button
                      aria-disabled="true"
                      class="cursor-not-allowed opacity-50"
                      onclick={(event) => { event.stopPropagation(); }}
                    >{language.hubRetry}</button>
                  {:else if hubStatus === 'failed'}
                    <span>{language.hubLoadFailed}</span>
                    <button class="transition-all duration-300 hover:-translate-y-1" onclick={(event) => { event.stopPropagation(); loadHubPreview(); }}>{language.hubRetry}</button>
                  {:else if hubStatus === 'empty'}
                    <span>{language.hubEmpty}</span>
                  {/if}
                </div>
              {/if}
              <div aria-hidden="true" class="pointer-events-none absolute -bottom-10 -right-10 text-textcolor">
                <Compass class={relatedLinkIconClass} strokeWidth={1} />
              </div>
            </div>
          {/if}
      </div>
      {#if hubAnnouncement && !realmHidden}
        <!--
          Gated on realmHidden, not just a non-empty string: this banner is
          realm-server content too, so hideRealm hides the whole realm
          widget, announcement included, rather than leaving server-supplied
          HTML on screen after the user opts out.

          This wrapper and the heading below it are new decoration around
          the sanitized sink, not a change to it: the content is HTML from
          upstream's realm server, rendered unlabelled it could be misread
          as a first-party message, so the heading names the source. The
          container borrows the link cards' shape (rounded-2xl, border,
          bg-darkbg, padding) so it reads as a deliberate element, but
          carries no hover lift and is not itself clickable — only the
          links the sanitizer allows inside it are, through the existing
          delegated handler.
        -->
        <div class="mt-4 rounded-2xl border border-borderc/10 bg-darkbg p-6">
          <h2 class="mb-2 text-base font-bold tracking-tight text-textcolor">{language.hubAnnouncementTitle}</h2>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- A keyboard Enter on a focused anchor dispatches a bubbling click, so this delegated handler already covers keyboard activation; see hubHtml.ts. -->
          <div onclick={handleHubHtmlClick}>
            {@html sanitizeHubHtml(hubAnnouncement)}
          </div>
        </div>
      {/if}

      {:else}
        <div class="flex items-center mt-4">
          <button class="mr-2 text-textcolor2 hover:text-green-500" onclick={() => ($OpenRealmStore = false)}>
            <ArrowLeft/>
          </button>
        </div>
        <Hub />
      {/if}
  </div>
</div>
