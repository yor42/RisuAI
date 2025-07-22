export function preLoadCheck(){
    const searchParams = new URLSearchParams(location.search);

    //@ts-ignore
    const isTauri = !!window.__TAURI_INTERNALS__
    //@ts-ignore
    const isNodeServer = !!globalThis.__NODE__
    
    // Check if running on mobile platform (Tauri Android or legacy Capacitor)
    const isMobile = isTauri && (
        /Android/i.test(navigator.userAgent) ||
        /iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
    
    // Keep isCapacitor for backward compatibility, now represents mobile platform
    const isCapacitor = isMobile;

    const isWeb = !isTauri && !isNodeServer && location.hostname === 'risuai.xyz' && !isCapacitor;
    
    
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
            e.preventDefault()
            //legacy browser
            e.returnValue = true
        })
    }
    
    return true;
}