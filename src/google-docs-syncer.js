import gettextParser from 'gettext-parser'
import glob from 'glob-promise'
import path from 'path'
import {cleanupPo} from './common'
import {getGoogleDocsConfig} from './utils'
import fs from 'fs'
import readline from 'readline'
import {google} from 'googleapis'
import {OAuth2Client} from 'google-auth-library'
import jsonfile from 'jsonfile'
import {promisify} from 'util'
import opn from 'opn'

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
]
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/'
const TOKEN_PATH = TOKEN_DIR + 'google-docs-syncer.json'

export async function syncPoToGoogleDocs (rc, domainName, tag, poDir) {
    const clientSecretPath = getGoogleDocsConfig(rc, domainName, 'client-secret-path')
    const docName = getGoogleDocsConfig(rc, domainName, 'doc-name')
    const sheetName = getGoogleDocsConfig(rc, domainName, 'sheet-name')

    const drive = promisifyDrive(google.drive('v3'))
    const sheets = promisifySheets(google.sheets('v4'))

    const oauth2Client = await authorize(domainName, sheetName, clientSecretPath)

    console.log(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] finding doc by named ${docName}...`)
    const docId = await findDocumentId(drive, oauth2Client, docName)
    console.log(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] docId`, docId)

    const poData = await readPoFiles(poDir)
    const rows = await readSheet(domainName, tag, sheetName, sheets, oauth2Client, docId)
    const columnMap = getColumnMap(rows[0])
    const sheetData = createSheetData(domainName, tag, sheetName, rows, columnMap)
    updateSheetData(domainName, tag, sheetName, poData, sheetData)
    updatePoData(domainName, tag, sheetName, poData, sheetData)

    const docActions = await updateSheet(domainName, tag, sheetName, rows, columnMap, sheetData)
    await applyDocumentActions(domainName, sheetName, sheets, oauth2Client, docId, docActions)
    writePoFiles(domainName, poDir, poData)
}

async function authorize(domainName, sheetName, clientSecretPath) {
    /**
     * @property {object} installed
     * @property {installed.string[]} redirect_uris
     */
    const credentials = jsonfile.readFileSync(clientSecretPath)
    const clientSecret = credentials.installed.client_secret
    const clientId = credentials.installed.client_id
    const redirectUrl = credentials.installed.redirect_uris[0]
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUrl)

    const token = await getToken(domainName, sheetName, oauth2Client)
    oauth2Client.setCredentials(token)
    return oauth2Client
}

async function getToken(domainName, sheetName, oauth2Client) {
    // Check if we have previously stored a token.
    try {
        return jsonfile.readFileSync(TOKEN_PATH)
    } catch (err) {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES
        })
        console.log('Authorize this app by visiting this url: ', authUrl)
        opn(authUrl)
        const code = await readAuthCode()
        const token = await oauth2Client.getToken(code).then(r => r.tokens)
        try {
            fs.mkdirSync(TOKEN_DIR)
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err
            }
        }
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token))
        console.log(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] token stored to ${TOKEN_PATH}`)
        oauth2Client.setCredentials(token)
    }
    return oauth2Client
}

function readAuthCode() {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout})
    return new Promise(resolve => {
        rl.question('Enter the code from that page here: ', code => {
            rl.close()
            resolve(code)
        })
    })
}

async function findDocumentId(drive, auth, docName) {
    const {files} = await promisify(drive.files.list)({
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

    return docIds[0]
}

async function readPoFiles(poDir) {
    const poPaths = await glob.promise(`${poDir}/*.po`)

    const poData = {}
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const input = fs.readFileSync(poPath)
        poData[locale] = gettextParser.po.parse(input, 'UTF-8')
    }
    // console.log('po data read', JSON.stringify(poData, null, 2))
    return poData
}

function writePoFiles(domainName, poDir, poData) {
    // console.log('po data to write', JSON.stringify(poData, null, 2))
    for (const [locale, po] of Object.entries(poData)) {
        const output = gettextParser.po.compile(po)
        const poPath = path.join(poDir, locale + '.po')
        fs.writeFileSync(poPath, output)
        cleanupPo(domainName, poPath)
    }
}

async function readSheet(domainName, tag, sheetName, sheets, auth, docId) {
    console.log(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] loading sheet`)
    const {values: rows} = await sheets.spreadsheets.values.getAsync({
        auth,
        spreadsheetId: docId,
        range: sheetName
    }).then(r => r.data)
    console.log(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] ... ${rows.length} rows`)
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
        if (columnName === 'key') {
            columnMap.key = index
        } else if (columnName === 'source') {
            columnMap.source = index
        } else if (columnName === 'tag') {
            columnMap.tag = index
        } else if (columnName.startsWith('target-')) {
            columnMap.targets[columnName.substr(7)] = index
        }
    }

    if (!('source' in columnMap)) {
        throw new Error(`no 'source' row in header of the sheet`)
    }

    if (Object.keys(columnMap.targets).length === 0) {
        throw new Error(`no 'target-' row in header of the sheet`)
    }

    return columnMap
}

function createSheetData(domainName, tag, sheetName, rows, columnMap) {
    const sheetData = {}
    for (const [index, dataRow] of rows.slice(1).entries()) {
        const entry = readDataRow(dataRow, columnMap)
        entry.tags.delete('')
        entry.tags.delete('OK')
        entry.tags.delete('UNUSED')
        entry.tags.delete(tag)

        if (entry.key) {
            sheetData[entry.key] = entry
        } else if (entry.source) {
            sheetData[entry.source] = entry
        } else {
            console.warn(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] ignoring row ${toRowName(index + 1)}: no key nor source`)
        }
    }
    // console.log(JSON.stringify(sheetData, null, 2))
    return sheetData
}

function readDataRow(dataRow, columnMap) {
    const targets = {}
    for (const [locale, localeColumn] of Object.entries(columnMap.targets)) {
        targets[locale] = decodeSheetText(dataRow[localeColumn])
    }

    return {
        key: ('key' in columnMap) ? decodeSheetText(dataRow[columnMap.key]) : '',
        source: decodeSheetText(dataRow[columnMap.source]),
        targets: targets,
        tags: new Set(decodeSheetText(dataRow[columnMap.tag]).split(','))
    }
}

function updateSheetData(domainName, tag, sheetName, poData, sheetData) {
    for (const [locale, po] of Object.entries(poData)) {
        // console.log('update sheet locale', locale)
        for (const poContexts of Object.values(po.translations)) {
            // console.log('update sheet contexts', Object.values(poContexts))
            for (const poEntry of Object.values(poContexts)) {
                const entryId = poEntry.msgctxt || poEntry.msgid
                // console.log('update sheet entry id', entryId)
                if (!entryId) {
                    // Ignoring po metadata entry
                    continue
                }

                // console.log('matched entry (locale)', locale)
                // console.log('po entry', poEntry)

                if (!(entryId in sheetData)) {
                    sheetData[entryId] = {
                        key: poEntry.msgctxt,
                        source: poEntry.msgid,
                        targets: {},
                        tags: new Set()
                    }
                }

                const sheetEntry = sheetData[entryId]
                if (poEntry.msgctxt !== sheetEntry.key && poEntry.msgid !== sheetEntry.source) {
                    console.warn('po entry', JSON.stringify(poEntry, null, 2))
                    console.warn('sheet entry', JSON.stringify(sheetEntry, null, 2))
                    throw new Error(`entry conflict occurred ${poEntry.msgctxt || poEntry.msgid} vs ${sheetEntry.key || sheetEntry.source}`)
                }

                sheetEntry.key = poEntry.msgctxt || ''
                sheetEntry.source = poEntry.msgid
                sheetEntry.tags.add(tag)

                if (!sheetEntry.targets[locale]) {
                    sheetEntry.targets[locale] = poEntry.msgstr[0]
                }
            }
        }
    }
    // console.log('updated sheet data', sheetData)
}

function updatePoData(domainName, tag, sheetName, poData, sheetData) {
    for (const sheetEntry of Object.values(sheetData)) {
        for (const [locale, target] of Object.entries(sheetEntry.targets)) {
            if (locale in poData) {
                const po = poData[locale].translations
                // console.log('updating po, sheet entry', sheetEntry)
                // console.log('updating po, po', po)
                if ((sheetEntry.key in po) && (sheetEntry.source in po[sheetEntry.key])) {
                    const poEntry = po[sheetEntry.key][sheetEntry.source]
                    // console.log('updating po, po entry', poEntry)
                    sheetEntry.tags.add(tag)
                    if (target && target !== '$$needs translation$$' && target !== '$$no translation$$') {
                        poEntry.msgstr = [target]
                    }
                }
            }
        }
    }
    // console.log('updated po data', JSON.stringify(poData, null, 2))
}

async function updateSheet(domainName, tag, sheetName, rows, columnMap, sheetData) {
    const docActions = []
    for (const [index, dataRow] of rows.slice(1).entries()) {
        const rowEntry = readDataRow(dataRow, columnMap)
        const entryId = rowEntry.key || rowEntry.source
        if (!entryId) {
            continue
        }

        const sheetEntry = sheetData[entryId]
        if (sheetEntry != null) {
            const tag = Array.from(rowEntry.tags).sort().join(',')
            const newTag = Array.from(sheetEntry.tags).sort().join(',') || 'UNUSED'
            if (tag !== newTag) {
                console.info(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] setting tag of ${entryId}: ${newTag}`)
                docActions.push({
                    type: 'update-cell',
                    row: index + 1,
                    column: columnMap.tag,
                    data: newTag
                })
            }

            for (const [locale, value] of Object.entries(rowEntry.targets)) {
                const newValue = sheetEntry.targets[locale]
                if (value !== newValue) {
                    console.info(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] updating value of ${locale}: ${value} -> ${newValue}`)
                    docActions.push({
                        type: 'update-cell',
                        row: index + 1,
                        column: columnMap.targets[locale],
                        data: newValue
                    })
                }
            }

            delete sheetData[entryId]
        }
    }

    for (const [entryId, sheetEntry] of Object.entries(sheetData)) {
        if (sheetEntry.key && columnMap.key == null) {
            console.warn(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] ignoring ${sheetEntry.key}: no key column`)
            continue
        }

        const row = new Array(columnMap.size).fill('')
        row[columnMap.key] = encodeSheetText(sheetEntry.key)
        row[columnMap.source] = encodeSheetText(sheetEntry.source)
        row[columnMap.tag] = encodeSheetText(Array.from(sheetEntry.tags).sort().join(',') || 'UNUSED')

        for (const [locale, value] of Object.entries(sheetEntry.targets)) {
            if (!(locale in columnMap.targets)) {
                console.warn(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] ignoring ${locale}: no column`)
                continue
            }
            row[columnMap.targets[locale]] = encodeSheetText(value)
        }
        console.warn(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] appending row of ${entryId}`)
        docActions.push({
            type: 'append-row',
            data: row
        })
    }

    // console.log('doc actions', JSON.stringify(docActions, null, 2))
    return docActions
}

async function applyDocumentActions(domainName, sheetName, sheets, auth, docId, docActions) {
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
        await sheets.spreadsheets.values.batchUpdateAsync({
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
        await sheets.spreadsheets.values.appendAsync({
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

    if (text.startsWith('+')) {
        return '\'' + text
    } else {
        return text
    }
}

function decodeSheetText(sheetText) {
    if (sheetText == null)
        return ''

    if (sheetText.startsWith('\'')) {
        const text = sheetText.substr(1)
        if (text.startsWith('+')) {
            return text
        }
    }
    return sheetText
}

function promisifyDrive(drive) {
    drive.files.listAsync = promisify(drive.files.list)
    return drive
}

function promisifySheets(sheets) {
    /** @property {object} spreadsheets */
    sheets.spreadsheets.values.getAsync = promisify(sheets.spreadsheets.values.get)
    sheets.spreadsheets.values.appendAsync = promisify(sheets.spreadsheets.values.append)
    sheets.spreadsheets.values.batchUpdateAsync = promisify(sheets.spreadsheets.values.batchUpdate)
    return sheets
}
