export function setFlag(poEntry, flag) {
    if (!('comments' in poEntry)) {
        poEntry.comments = {}
    }
    poEntry.comments.flag = flag
}

export function removeFlag(poEntry) {
    if (!('comments' in poEntry)) {
        return
    }
    delete poEntry.comments.flag
}

export function getFlag(poEntry) {
    if (!('comments' in poEntry)) {
        return null
    }
    return poEntry.comments.flag || null
}
