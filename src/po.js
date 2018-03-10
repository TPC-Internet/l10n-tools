import fs from 'fs'
import gettextParser from 'gettext-parser'
import {sortSet} from './utils'

export class PoEntryBuilder {
    constructor (msgctxt, msgid) {
        this.msgctxt = msgctxt || null
        this.msgid = msgid.trim()
        this.plural = null
        this.references = new Set()
        this.comments = new Set()
        this.flags = new Set()
    }

    static fromPoEntry (poEntry) {
        const builder = new PoEntryBuilder(poEntry.msgctxt, poEntry.msgid)
        builder.plural = poEntry.msgid_plural || null
        if (poEntry.comments) {
            if (poEntry.comments.reference) {
                for (const reference of poEntry.comments.reference.split(/\r?\n|\r/)) {
                    builder.references.add(reference)
                }
            }
            if (poEntry.comments.extracted) {
                for (const comment of poEntry.comments.extracted.split(/\r?\n|\r/)) {
                    builder.comments.add(comment)
                }
            }
            if (poEntry.comments.flag) {
                for (const flag of poEntry.comments.flag.split(/\r?\n|\r/)) {
                    builder.flags.add(flag)
                }
            }
        }
        return builder
    }

    setPlural (plural) {
        if (this.plural && this.plural !== plural) {
            throw new Error(`overwriting plural from ${this.plural} to ${plural}`)
        }
        this.plural = plural
        return this
    }

    addReference (filename, line = null) {
        if (line == null) {
            this.references.add(filename)
        } else {
            this.references.add(filename + ':' + line)
        }
        return this
    }

    addComment (comment) {
        this.comments.add(comment)
        return this
    }

    addFlag (flag) {
        this.flags.add(flag)
        return this
    }

    toPoEntry () {
        const poEntry = {}

        if (this.msgctxt) {
            poEntry.msgctxt = this.msgctxt
        }

        poEntry.msgid = this.msgid

        if (this.plural) {
            poEntry.msgid_plural = this.plural
            poEntry.msgstr = ['', '']
        } else {
            poEntry.msgstr = ['']
        }

        poEntry.comments = {}

        if (this.references.size > 0) {
            poEntry.comments.reference = sortSet(this.references).join('\n')
        }

        if (this.flags.size > 0) {
            poEntry.comments.flag = sortSet(this.flags).join('\n')
        }

        if (this.comments.size > 0) {
            poEntry.comments.extracted = sortSet(this.comments).join('\n')
        }

        return poEntry
    }
}

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

export function getPoEntry(po, msgctxt, msgid) {
    if (msgctxt == null) {
        msgctxt = ''
    }
    if (!(msgctxt in po.translations)) {
        return null
    }
    return po.translations[msgctxt][msgid] || null
}

export function setPoEntry(po, poEntry) {
    const msgctxt = poEntry.msgctxt || ''
    if (!(msgctxt in po.translations)) {
        po.translations[msgctxt] = {}
    }
    po.translations[msgctxt][poEntry.msgid] = poEntry
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
