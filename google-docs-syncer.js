import glob from 'glob-promise'
import http from 'http'
import httpShutdown from 'http-shutdown'
import log from 'npmlog'
import * as path from 'path'
import querystring from 'querystring'
import url from 'url'
import {cleanupPo} from './common'
import {findPoEntry, getPoEntries, getPoEntryFlag, readPoFile, removePoEntryFlag, setPoEntry, setPoEntryFlag, writePoFile} from './po'
import fs from 'fs'
import {google} from 'googleapis'
import {OAuth2Client} from 'google-auth-library'
import jsonfile from 'jsonfile'
import open from 'open'
import * as shell from 'shelljs'
import objectPath from 'object-path'

httpShutdown.extend()

function getGoogleDocsConfig (config, domainConfig, path, defaultValue = undefined) {
    return domainConfig.get(['google-docs', path], null) || config.get(['google-docs', path], defaultValue)
}

export async function syncPoToGoogleDocs (config, domainConfig, tag, potPath, poDir) {
    const docName = getGoogleDocsConfig(config, domainConfig, 'doc-name')
    const sheetName = getGoogleDocsConfig(config, domainConfig, 'sheet-name')
    const clientSecretPath = getGoogleDocsConfig(config, domainConfig, 'client-secret-path', null)
    let credentials
    if (clientSecretPath) {
        credentials = jsonfile.readFileSync(clientSecretPath)['installed']
    } else {
        credentials = {
            client_id: getGoogleDocsConfig(config, domainConfig, 'client-id'),
            client_secret: getGoogleDocsConfig(config, domainConfig, 'client-secret')
        }
    }

    const drive = google.drive('v3')
    const sheets = google.sheets('v4')

    const auth = await authorize(sheetName, credentials)

    log.info('syncPoToGoogleDocs', `finding doc by named ${docName}...`)
    const docId = await findDocumentId(drive, auth, docName)
    log.notice('syncPoToGoogleDocs', `docId: ${docId}`)

    const pot = await readPoFile(potPath)
    const poData = await readPoFiles(poDir)
    const rows = await readSheet(sheets, sheetName, auth, docId)
    const columnMap = getColumnMap(rows[0])
    const sheetData = createSheetData(tag, rows, columnMap)
    updateSheetData(tag, pot, poData, sheetData)
    updatePoData(tag, pot, poData, sheetData)

    const docActions = await updateSheet(tag, rows, columnMap, sheetData)
    await applyDocumentActions(sheetName, sheets, auth, docId, docActions)
    writePoFile(potPath, pot)
    writePoFiles(poDir, poData)
}

async function authorize(sheetName, credentials) {
    const clientSecret = credentials.client_secret
    const clientId = credentials.client_id
    const redirectUrl = 'http://localhost:8106/oauth2callback'
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUrl)

    const token = await getToken(oauth2Client)
    oauth2Client.setCredentials(token)
    return oauth2Client
}

async function getToken(oauth2Client) {
    const tokenPath = path.join(process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE, '.credentials', 'google-docs-syncer.json')

    // Check if we have previously stored a token.
    try {
        return jsonfile.readFileSync(tokenPath)
    } catch (err) {
        const code = await readAuthCode(oauth2Client)
        log.info('getToken', `code is ${code}`)
        const r = await oauth2Client.getToken(code)
        shell.mkdir('-p', path.dirname(tokenPath))
        fs.writeFileSync(tokenPath, JSON.stringify(r.tokens))
        log.info('getToken', `token stored to ${tokenPath}`)
        return r.tokens
    }
}

function readAuthCode(oauth2Client) {
    return new Promise(resolve => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
        })

        const server = http.createServer((req, res) => {
            if (req.url.indexOf('/oauth2callback') >= 0) {
                const qs = querystring.parse(url.parse(req.url).query)
                res.end('Authentication successful! Please return to the console.')
                server.shutdown()
                resolve(qs.code)
            }
        }).withShutdown()

        server.listen(8106, () => {
            open(authUrl, {wait: false})
        })
    })
}

const documentIdCache = {}

async function findDocumentId(drive, auth, docName) {
    if (!documentIdCache.hasOwnProperty(docName)) {
        const {files} = await drive.files.list({
            auth,
            q: `name = '${docName}' and trashed = false`,
            spaces: 'drive'
        }).then(r => r.data)
        const docIds = files
            .filter(f => f.mimeType === 'application/vnd.google-apps.spreadsheet')
            .map(f => f.id)

        if (docIds.length === 0) {
            throw new Error(`no document named ${docName}, check this out`)
        }

        if (docIds.length > 1) {
            throw new Error(`one or more document named ${docName}, check this out`)
        }

        documentIdCache[docName] = docIds[0]
    }
    return documentIdCache[docName]
}

async function readPoFiles(poDir) {
    const poPaths = await glob.promise(`${poDir}/*.po`)

    const poData = {}
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        poData[locale] = readPoFile(poPath)
    }
    // console.log('po data read', JSON.stringify(poData, null, 2))
    return poData
}

function writePoFiles(poDir, poData) {
    // console.log('po data to write', JSON.stringify(poData, null, 2))
    for (const [locale, po] of Object.entries(poData)) {
        const poPath = path.join(poDir, locale + '.po')
        writePoFile(poPath, po)
        cleanupPo(poPath)
    }
}

async function readSheet(sheets, sheetName, auth, docId) {
    log.info('readSheet', 'loading sheet')
    const {values: rows} = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId: docId,
        range: sheetName
    }).then(r => r.data)
    log.notice('readSheet', `... ${rows.length} rows`)
    if (rows.length === 0) {
        throw new Error(`no header row in sheet ${sheetName}`)
    }
    return rows
}

function getColumnMap(headerRow) {
    const columnMap = {
        targets: {},
        size: headerRow.length
    }
    for (const [index, columnName] of headerRow.entries()) {
        if (columnName === 'keys') {
            columnMap.keys = index
        } else if (columnName === 'source') {
            columnMap.source = index
        } else if (columnName === 'tag') {
            columnMap.tag = index
        } else if (columnName === 'ref') {
            columnMap.ref = index
        } else if (columnName.startsWith('target-')) {
            columnMap.targets[columnName.substr(7)] = index
        }
    }

    if (!columnMap.hasOwnProperty('source')) {
        throw new Error(`no 'source' row in header of the sheet`)
    }

    if (Object.keys(columnMap.targets).length === 0) {
        throw new Error(`no 'target-' row in header of the sheet`)
    }

    return columnMap
}

function createSheetData(tag, rows, columnMap) {
    const sheetData = {}
    for (const [index, dataRow] of rows.slice(1).entries()) {
        const entry = readDataRow(dataRow, columnMap)
        if (!entry.source) {
            log.warn('createSheetData', `ignoring row ${toRowName(index + 1)}: no source`)
            continue
        }

        entry.keys = entry.keys.filter(key => !key.startsWith(`${tag}:`))

        entry.tags.delete('')
        entry.tags.delete('OK')
        entry.tags.delete('UNUSED')
        entry.tags.delete(tag)

        sheetData[entry.source] = entry
    }
    // console.log(JSON.stringify(sheetData, null, 2))
    return sheetData
}

function readDataRow(dataRow, columnMap) {
    const targets = {}
    for (const [locale, localeColumn] of Object.entries(columnMap.targets)) {
        targets[locale] = decodeSheetText(dataRow[localeColumn])
    }

    let keys
    if (columnMap.hasOwnProperty('keys')) {
        keys = decodeSheetText(dataRow[columnMap.keys]).split('\n').filter(key => key)
    } else {
        keys = []
    }

    return {
        keys: keys,
        source: decodeSheetText(dataRow[columnMap.source]),
        targets: targets,
        tags: new Set(decodeSheetText(dataRow[columnMap.tag]).split(',')),
        refs: decodeSheetText(columnMap.hasOwnProperty('ref') ? dataRow[columnMap.ref] : '').split('\n').filter(ref => ref)
    }
}

function updateSheetData(tag, pot, poData, sheetData) {
    for (const potEntry of getPoEntries(pot)) {
        const entryId = potEntry.msgid
        if (!sheetData.hasOwnProperty(entryId)) {
            sheetData[entryId] = {
                keys: [],
                source: potEntry.msgid,
                targets: {},
                tags: new Set(),
                refs: []
            }
        }

        const sheetEntry = sheetData[entryId]
        if (potEntry.msgctxt) {
            sheetEntry.keys.push(`${tag}:${potEntry.msgctxt}`)
        }

        const thisRefs = objectPath.get(potEntry, 'comments.reference', '').split('\n').filter(ref => ref)
            .map(ref => `${tag}:${ref}`)
        const otherRefs = sheetEntry.refs.filter(ref => !ref.startsWith(`${tag}:`))
        sheetEntry.refs = [...otherRefs, ...thisRefs]
    }

    for (const [locale, po] of Object.entries(poData)) {
        // console.log('update sheet locale', locale)
        for (const poEntry of getPoEntries(po)) {
            const entryId = poEntry.msgid
            // console.log('update sheet entry id', entryId)
            // console.log('matched entry (locale)', locale)
            // console.log('po entry', poEntry)

            if (!sheetData.hasOwnProperty(entryId)) {
                sheetData[entryId] = {
                    keys: [],
                    source: poEntry.msgid,
                    targets: {},
                    tags: new Set(),
                    ref: ''
                }
            }

            const sheetEntry = sheetData[entryId]

            sheetEntry.tags.add(tag)

            if (!sheetEntry.targets[locale]) {
                sheetEntry.targets[locale] = poEntry.msgstr[0]
            }

            const thisRefs = objectPath.get(poEntry, 'comments.reference', '').split('\n').filter(ref => ref)
                .map(ref => `${tag}:${ref}`)
            if (thisRefs.length > 0) {
                const otherRefs = sheetEntry.refs.filter(ref => !ref.startsWith(`${tag}:`))
                sheetEntry.refs = [...otherRefs, ...thisRefs]
            }
        }
    }
    // console.log('updated sheet data', sheetData)
}

function updatePoData(tag, pot, poData, sheetData) {
    for (const sheetEntry of Object.values(sheetData)) {
        for (const [locale, target] of Object.entries(sheetEntry.targets)) {
            if (poData.hasOwnProperty(locale)) {
                const po = poData[locale]
                const poEntries = []
                for (const tagKey of sheetEntry.keys.filter(key => key.startsWith(`${tag}:`))) {
                   const key = tagKey.substr(tag.length + 1)
                    const poEntry = findPoEntry(po, key, sheetEntry.source)
                    if (poEntry) {
                        poEntries.push(poEntry)
                    }
                }
                const poEntry = findPoEntry(po, null, sheetEntry.source)
                if (poEntry) {
                    poEntries.push(poEntry)
                }

                for (const poEntry of poEntries) {
                    // console.log('updating po, sheet entry', sheetEntry)
                    // console.log('updating po, po', po)
                    const entryId = poEntry.msgid
                    const flag = getPoEntryFlag(poEntry)
                    // console.log('updating po, po entry', poEntry)
                    sheetEntry.tags.add(tag)
                    if (target === '$$no translation$$') {
                        if (flag !== 'no-translation') {
                            log.notice('updatePoData', `mark 'no-translation' flag of ${locale} of ${entryId}`)
                            setPoEntryFlag(poEntry, 'no-translation')
                        }
                    } else if (target === '$$needs translation$$') {
                        if (flag !== 'needs-translation') {
                            log.notice('updatePoData', `mark 'needs-translation' flag of ${locale} of ${entryId}`)
                            setPoEntryFlag(poEntry, 'needs-translation')
                        }
                    } else {
                        if (flag) {
                            log.notice('updatePoData', `remove mark of ${locale} of ${entryId}`)
                            removePoEntryFlag(poEntry)
                        }

                        if (target && target !== poEntry.msgstr[0]) {
                            log.notice('updatePoData', `updating value of ${entryId}: ${poEntry.msgstr[0]} -> ${target}`)
                            poEntry.msgstr = [target]
                        }
                    }
                }
            }
        }
    }
    // console.log('updated po data', JSON.stringify(poData, null, 2))
}

async function updateSheet(tag, rows, columnMap, sheetData) {
    const docActions = []
    for (const [index, dataRow] of rows.slice(1).entries()) {
        const rowEntry = readDataRow(dataRow, columnMap)
        const entryId = rowEntry.source
        if (!entryId) {
            continue
        }

        const sheetEntry = sheetData[entryId]
        if (sheetEntry != null) {
            if (columnMap.hasOwnProperty('keys')) {
                const otherKeys = rowEntry.keys.filter(key => !key.startsWith(`${tag}:`))
                const thisKeys = sheetEntry.keys.filter(key => key.startsWith(`${tag}:`))
                const newKeys = [...otherKeys, ...thisKeys].sort().join('\n')
                const oldKeys = [...rowEntry.keys].sort().join('\n')
                if (oldKeys !== newKeys) {
                    log.notice('updateSheet', `setting keys of ${entryId}: ${newKeys}`)
                    docActions.push({
                        type: 'update-cell',
                        row: index + 1,
                        column: columnMap.keys,
                        data: encodeSheetText(newKeys)
                    })
                }
            }

            const oldTag = Array.from(rowEntry.tags).sort().join(',')
            const newTag = Array.from(sheetEntry.tags).sort().join(',') || 'UNUSED'
            if (oldTag !== newTag) {
                log.notice('updateSheet', `setting tag of ${entryId}: ${newTag}`)
                docActions.push({
                    type: 'update-cell',
                    row: index + 1,
                    column: columnMap.tag,
                    data: encodeSheetText(newTag)
                })
            }

            for (const [locale, value] of Object.entries(rowEntry.targets)) {
                const newValue = sheetEntry.targets[locale]
                if (value !== newValue) {
                    log.notice('updateSheet', `updating value of ${locale}: ${value} -> ${newValue}`)
                    docActions.push({
                        type: 'update-cell',
                        row: index + 1,
                        column: columnMap.targets[locale],
                        data: encodeSheetText(newValue)
                    })
                }
            }

            if (columnMap.hasOwnProperty('ref')) {
                const otherRefs = rowEntry.refs.filter(ref => !ref.startsWith(`${tag}:`))
                const thisRefs = sheetEntry.refs.filter(ref => ref.startsWith(`${tag}:`))
                const newRef = [...otherRefs, ...thisRefs].sort().join('\n')
                const oldRef = rowEntry.refs.join('\n')
                if (oldRef !== newRef) {
                    log.notice('updateSheet', `setting ref of ${entryId}: ${newRef}`)
                    docActions.push({
                        type: 'update-cell',
                        row: index + 1,
                        column: columnMap.ref,
                        data: encodeSheetText(newRef)
                    })
                }
            }

            delete sheetData[entryId]
        }
    }

    for (const [entryId, sheetEntry] of Object.entries(sheetData)) {
        if (sheetEntry.keys.length > 0 && !columnMap.hasOwnProperty('keys')) {
            log.warn('updateSheet', `ignoring ${sheetEntry.key}: no keys column`)
            continue
        }

        const row = new Array(columnMap.size).fill('')
        if (columnMap.hasOwnProperty('keys')) {
            row[columnMap.keys] = encodeSheetText([...new Set(sheetEntry.keys)].sort().join('\n'))
        }
        row[columnMap.source] = encodeSheetText(sheetEntry.source)
        row[columnMap.tag] = encodeSheetText([...sheetEntry.tags].sort().join(',') || 'UNUSED')

        for (const [locale, value] of Object.entries(sheetEntry.targets)) {
            if (!columnMap.targets.hasOwnProperty(locale)) {
                log.warn('updateSheet', `ignoring ${locale}: no column`)
                continue
            }
            row[columnMap.targets[locale]] = encodeSheetText(value)
        }

        if (columnMap.hasOwnProperty('ref')) {
            row[columnMap.ref] = encodeSheetText(sheetEntry.refs.sort().join('\n'))
        }

        log.warn('updateSheet', `appending row of ${entryId}`)
        docActions.push({
            type: 'append-row',
            data: row
        })
    }

    // console.log('doc actions', JSON.stringify(docActions, null, 2))
    return docActions
}

async function applyDocumentActions(sheetName, sheets, auth, docId, docActions) {
    const updateData = []
    const newRows = []

    for (const action of docActions) {
        if (action.type === 'append-row') {
            newRows.push(action.data)
        } else if (action.type === 'update-cell') {
            updateData.push({
                range: `'${sheetName}'!${toCellName(action.row, action.column)}`,
                values: [[action.data]]
            })
        }
    }

    if (updateData.length > 0) {
        // console.log('update data', JSON.stringify(updateData, null, 2))
        await sheets.spreadsheets.values.batchUpdate({
            auth,
            spreadsheetId: docId,
            resource: {
                valueInputOption: 'RAW',
                data: updateData
            }
        }).then(r => r.data)
    }

    if (newRows.length > 0) {
        // console.log('new rows', JSON.stringify(newRows, null, 2))
        await sheets.spreadsheets.values.append({
            auth,
            spreadsheetId: docId,
            range: sheetName,
            valueInputOption: 'RAW',
            resource: {
                values: newRows
            }
        }).then(r => r.data)
    }
}

function toColumnName(column) {
    column += 1
    let name = ''
    while (column > 0) {
        // console.log('reminder', column, String.fromCharCode('A'.charCodeAt(0) + ((column - 1) % 26)))
        // console.log('next column', Math.floor((column - 1) / 26))
        name = String.fromCharCode('A'.charCodeAt(0) + ((column - 1) % 26)) + name
        column = Math.floor((column - 1) / 26)
    }
    return name;
}

function toRowName(row) {
    return (row + 1).toString()
}

function toCellName(row, column) {
    return toColumnName(column) + toRowName(row)
}

function encodeSheetText(text) {
    if (text == null)
        return ''
    return text
}

function decodeSheetText(sheetText) {
    if (sheetText == null)
        return ''
    return sheetText.replace(/\r\n/g, '\n')
}
