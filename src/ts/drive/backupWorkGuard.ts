import { alertError } from "../alert";
import { language } from "src/lang";
import { isWorkInProgress } from "../process/chatOrigin";

/**
 * Whether a backup load must not go ahead right now. A load replaces the whole
 * database under whatever is still writing into it, so it is refused while any
 * work is in progress, and the user is told to wait for that work or stop it.
 * True when the caller must stop, with the message already shown; false, and
 * silent, when nothing is running.
 */
export function refuseBackupLoadWhileBusy(): boolean {
    if(!isWorkInProgress()){
        return false
    }
    alertError(language.backupLoadWorkInProgress)
    return true
}
