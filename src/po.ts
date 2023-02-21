import fs from 'fs'
import * as gettextParser from 'gettext-parser'
import {sortSet} from './utils'
import {GetTextTranslation, GetTextTranslations} from 'gettext-parser'

export class PoEntryBuilder {
    public msgctxt: string | null
    public msgid: string
    public plural: string | null
    public references: Set<string>
    public comments: Set<string>
    public flags: Set<string>

    constructor (msgctxt: string | null, msgid: string, {allowSpaceInId = false} = {}) {
        this.msgctxt = msgctxt || null
        if (!allowSpaceInId) {
            msgid = msgid.trim()
        }
        this.msgid = msgid
        this.plural = null
        this.references = new Set()
        this.comments = new Set()
        this.flags = new Set()
    }

    static fromPoEntry (poEntry: GetTextTranslation): PoEntryBuilder {
        const builder = new PoEntryBuilder(poEntry.msgctxt || null, poEntry.msgid)
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

    setPlural (plural: string | null): this {
        if (this.plural && this.plural !== plural) {
            throw new Error(`overwriting plural from ${this.plural} to ${plural}`)
        }
        this.plural = plural
        return this
    }

    addReference (filename: string, line: number | string | null = null): this {
        if (line == null) {
            this.references.add(filename)
        } else {
            this.references.add(filename + ':' + line.toString())
        }
        return this
    }

    addComment (comment: string): this {
        this.comments.add(comment)
        return this
    }

    addFlag (flag: string): this {
        this.flags.add(flag)
        return this
    }

    toPoEntry (): GetTextTranslation {
        const poEntry: GetTextTranslation = {
            msgid: this.msgid,
            msgstr: []
        }

        if (this.msgctxt) {
            poEntry.msgctxt = this.msgctxt
        }

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

export function setPoEntryFlag(poEntry: GetTextTranslation, flag: string) {
    if (!poEntry.comments) {
        poEntry.comments = {}
    }
    poEntry.comments.flag = flag
}

export function removePoEntryFlag(poEntry: GetTextTranslation) {
    if (!poEntry.comments) {
        return
    }
    delete poEntry.comments.flag
}

export function getPoEntryFlag(poEntry: GetTextTranslation) {
    if (!poEntry.comments) {
        return null
    }
    return poEntry.comments.flag || null
}

export function findPoEntry(po: GetTextTranslations, msgctxt: string | null, msgid: string | null = null): GetTextTranslation | null {
    if (msgctxt == null) {
        msgctxt = ''
    }
    if (msgid == null) {
        msgid = ''
    }
    if (!po.translations.hasOwnProperty(msgctxt)) {
        return null
    }
    if (!msgctxt) {
        return po.translations[msgctxt][msgid] || null
    }
    if (po.translations[msgctxt].hasOwnProperty(msgid)) {
        return po.translations[msgctxt][msgid]
    }
    const contextMsgIds = Object.keys(po.translations[msgctxt])
    if (contextMsgIds.length > 1) {
        throw new Error(`[findPoEntry] multiple msgid in msgctxt ${msgctxt}`)
    }
    if (contextMsgIds.length === 0) {
        return null
    }
    return po.translations[msgctxt][contextMsgIds[0]] || null
}

export function setPoEntry(po: GetTextTranslations, poEntry: GetTextTranslation) {
    const oldPoEntry = findPoEntry(po, poEntry.msgctxt ?? null, poEntry.msgid)
    const msgctxt = poEntry.msgctxt || ''
    if (oldPoEntry) {
        if (oldPoEntry.msgid !== poEntry.msgid) {
            delete po.translations[msgctxt][oldPoEntry.msgid]
        }
    }
    if (!po.translations.hasOwnProperty(msgctxt)) {
        po.translations[msgctxt] = {}
    }
    po.translations[msgctxt][poEntry.msgid] = poEntry
}

export function readPoFile (poPath: string): GetTextTranslations {
    const poInput = fs.readFileSync(poPath)
    return gettextParser.po.parse(poInput, 'UTF-8')
}

export function writePoFile (poPath: string, po: GetTextTranslations) {
    const output = gettextParser.po.compile(po)
    fs.writeFileSync(poPath, output)
}

export function* getPoEntries(po: GetTextTranslations): Generator<GetTextTranslation, void> {
    for (const [msgctxt, poEntries] of Object.entries(po.translations)) {
        for (const [msgid, poEntry] of Object.entries(poEntries)) {
            if (!msgctxt && !msgid) {
                continue
            }
            yield poEntry
        }
    }
}

export function* getPoEntriesFromFile(poPath: string): Generator<GetTextTranslation, void> {
    yield* getPoEntries(readPoFile(poPath))
}

export function checkPoEntrySpecs(poEntry: GetTextTranslation, specs: string[]): boolean {
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

type PoJson = {[key: string]: string} | {[key: string]: PoJson}

export function exportPoToJson (poPath: string, {keySeparator = '.'} = {}): PoJson {
    const json: PoJson = {}
    const po = readPoFile(poPath)
    for (const poEntry of getPoEntries(po)) {
        if (poEntry.msgctxt) {
            throw new Error('[exportPoToJson] po entry with msgctxt not supported yet')
        }

        if (poEntry.msgid && poEntry.msgstr[0]) {
            const keys = keySeparator ? poEntry.msgid.split(keySeparator) : [poEntry.msgid]
            const lastKey = keys.pop() as string

            let obj = json
            for (const key of keys) {
                if (!obj.hasOwnProperty(key)) {
                    obj[key] = {}
                }
                obj = obj[key] as {[key: string]: PoJson}
            }
            obj[lastKey] = poEntry.msgstr[0]
        }
    }
    return json
}
