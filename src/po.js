import fs from 'fs'
import gettextParser from 'gettext-parser'

export function setPoEntryFlag(poEntry, flag) {
    if (!('comments' in poEntry)) {
        poEntry.comments = {}
    }
    poEntry.comments.flag = flag
}

export function removePoEntryFlag(poEntry) {
    if (!('comments' in poEntry)) {
        return
    }
    delete poEntry.comments.flag
}

export function getPoEntryFlag(poEntry) {
    if (!('comments' in poEntry)) {
        return null
    }
    return poEntry.comments.flag || null
}

export function forPoEntries(po, callback) {
    for (const [msgctxt, poEntries] of Object.entries(po.translations)) {
        for (const [msgid, poEntry] of Object.entries(poEntries)) {
            if (msgctxt === '' && msgid === '') {
                continue
            }

            callback(poEntry)
        }
    }
}

function checkPoEntrySpecs(poEntry, specs) {
    return specs.every(spec => {
        const positive = !spec.startsWith('!')
        if (!positive) {
            spec = spec.substr(1)
        }

        if (spec === 'total') {
            return positive
        } else if (spec === 'untranslated') {
            if (!poEntry.msgstr[0]) {
                return positive
            } else {
                return !positive
            }
        } else if (spec === 'translated') {
            if (poEntry.msgstr[0]) {
                return positive
            } else {
                return !positive
            }
        } else {
            if (spec === getPoEntryFlag(poEntry)) {
                return positive
            } else {
                return !positive
            }
        }
    })
}

export function countPoEntries (poPath, specs) {
    const poInput = fs.readFileSync(poPath)
    const po = gettextParser.po.parse(poInput, 'UTF-8')
    let count = 0
    forPoEntries(po, poEntry => {
        if (checkPoEntrySpecs(poEntry, specs)) {
            count++
        }
    })
    return count
}

export function getPoEntries (poPath, specs) {
    const poInput = fs.readFileSync(poPath)
    const po = gettextParser.po.parse(poInput, 'UTF-8')
    const poEntries = []
    forPoEntries(po, poEntry => {
        if (checkPoEntrySpecs(poEntry, specs)) {
            poEntries.push(poEntry)
        }
    })
    return poEntries
}
