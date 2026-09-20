import { isWeb } from "./ts/platform";
import { isAppInitiatedReload } from "./ts/reloadGuard";

export function preLoadCheck(){
    const searchParams = new URLSearchParams(location.search);

    // Check if the user has visited the main page
    if(!isWeb) {
        localStorage.setItem('mainpage', 'visited');
    }
    else if(searchParams.has('mainpage')) {
        localStorage.setItem('mainpage', searchParams.get('mainpage'));
    }

    if(isWeb) {
        //Add beforeunload event listener to prevent the user from leaving the page
        window.addEventListener('beforeunload', (e) => {
            // App-initiated reloads (e.g. after a save conflict) must never be
            // cancellable -- code right after `location.reload()` assumes the
            // reload happens and parks itself forever waiting for it.
            if(isAppInitiatedReload()) {
                return
            }
            e.preventDefault()
            //legacy browser
            e.returnValue = true
        })
    }
    
    return true;
}