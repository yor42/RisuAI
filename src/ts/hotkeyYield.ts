// Native activation targets for a bare Space keydown.
const SPACE_ACTIVATED_TAGS = ['BUTTON', 'SELECT', 'SUMMARY']

function isSpaceActivatedControl(el: Element): boolean {
    return SPACE_ACTIVATED_TAGS.includes(el.tagName)
}

function isEnterActivatedControl(el: Element): boolean {
    if(isSpaceActivatedControl(el)){
        return true
    }
    // Links activate on Enter, not Space. Space on a link natively scrolls
    // the page, so that case is left out of isSpaceActivatedControl.
    return el.tagName === 'A' && el.hasAttribute('href')
}

export function defaultIsKeyboardFocused(el: Element): boolean {
    try {
        return el.matches(':focus-visible')
    }
    catch {
        return false
    }
}

// True when a bare Space or Enter keydown should be left alone because
// `el` is a control that natively activates on that key and currently
// holds keyboard focus (not just mouse-click focus). Callers should skip
// their own key-matching logic for this keydown when this returns true.
export function shouldYieldToFocusedControl(
    ev: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
    el: Element | null,
    isKeyboardFocused: (el: Element) => boolean = defaultIsKeyboardFocused,
): boolean {
    if(ev.ctrlKey || ev.altKey || ev.shiftKey || ev.metaKey){
        return false
    }
    if(!el){
        return false
    }

    let isActivationKey: boolean
    if(ev.key === ' '){
        isActivationKey = isSpaceActivatedControl(el)
    }
    else if(ev.key === 'Enter'){
        isActivationKey = isEnterActivatedControl(el)
    }
    else{
        isActivationKey = false
    }

    if(!isActivationKey){
        return false
    }

    return isKeyboardFocused(el)
}
