import log from 'npmlog';

type CombinedContextMap = {[tag: string]: string[]}

export function containsContext(context: string | undefined, tag: string, msgctxt: string | undefined): boolean {
    if (!msgctxt) {
        return true
    }

    if (!context) {
        return false
    }

    const contextMap = parseContext(context)
    return contextMap[tag]?.includes(msgctxt)
}

export function addContext(context: string | undefined, tag: string, msgctxt: string | undefined): string {
    const contextMap = parseContext(context)
    if (msgctxt) {
        if (!contextMap[tag]) {
            contextMap[tag] = []
        }
        if (!contextMap[tag].includes(msgctxt)) {
            contextMap[tag].push(msgctxt)
        }
    }
    return JSON.stringify(contextMap)
}

export function getContexts(context: string | undefined, tag: string, fillNull: boolean): (string | null)[] {
    const contextMap = parseContext(context)
    if (!contextMap[tag]) {
        if (fillNull) {
            return [null]
        } else {
            return []
        }
    }
    return contextMap[tag]
}

export function removeContext(context: string | undefined, tag: string, msgctxt: string | null): string {
    const contextMap = parseContext(context)
    if (msgctxt) {
        if (contextMap[tag]) {
            const index = contextMap[tag].findIndex(ctxt => ctxt == msgctxt)
            if (index >= 0) {
                contextMap[tag].splice(index, 1)
                if (contextMap[tag].length == 0) {
                    delete contextMap[tag]
                }
            }
        }
    }
    if (Object.keys(contextMap).length == 0) {
        return ''
    } else {
        return JSON.stringify(contextMap)
    }
}

function parseContext(context: string | undefined): CombinedContextMap {
    if (!context) {
        return {}
    }
    try {
        return JSON.parse(context)
    } catch (err) {
        log.warn('parseContext', 'context not recognized', context)
        return {}
    }
}
