import gettextParser from 'gettext-parser'
import glob from 'glob-promise'
import path from 'path'
import {execWithLog, requireCmd, getConfig} from './utils'
import fs from 'fs'
import readline from 'readline'
import {google} from 'googleapis'
import {OAuth2Client} from 'google-auth-library'
import jsonfile from 'jsonfile'
import {promisify} from 'util'
import opn from 'opn'

export async function syncPoToGoogleDocs (domainName, googleDocs, tag, poDir) {
    await requireCmd.pipFromGitHub('sync-po-gdoc', 'po-gdoc-syncer', 'vonvonme/po-gdoc-syncer')

    const docName = getConfig(googleDocs, 'google-docs', 'doc-name')
    const sheetName = getConfig(googleDocs, 'google-docs', 'sheet-name')
    const clientSecretPath = getConfig(googleDocs, 'google-docs', 'client-secret-path')

    await execWithLog(
        `sync-po-gdoc --src-type=po --src-dir="${poDir}" --doc="${docName}" \
            --domain="${tag}" --sheet="${sheetName}" --secret="${clientSecretPath}"`,
        `[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}]`
    )
}

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
]
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/'
const TOKEN_PATH = TOKEN_DIR + 'google-docs-syncer.json'

export async function syncContextPoToGoogleDocs (domainName, googleDocs, tag, poDir) {
    const clientSecretPath = getConfig(googleDocs, 'google-docs', 'client-secret-path')
    const docName = getConfig(googleDocs, 'google-docs', 'doc-name')
    const sheetName = getConfig(googleDocs, 'google-docs', 'sheet-name')

    const drive = promisifiedDrive(google.drive('v3'))
    const sheets = promisifySheets(google.sheets('v4'))

    const oauth2Client = await authorize(domainName, sheetName, clientSecretPath)

    const docId = await findDocumentId(drive, oauth2Client, docName)
    console.log(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] docId`, docId)

    const poPaths = await glob.promise(`${poDir}/*.po`)
    const poData = {}
    for (const poPath of poPaths) {
        const locale = path.basename(poPath, '.po')
        const input = fs.readFileSync(poPath)
        poData[locale] = gettextParser.po.parse(input).translations
    }

    const rows = await readSheet(domainName, tag, sheetName, sheets, oauth2Client, docId)
    const columnMap = getColumnMap(rows[0])
    const sheetData = createSheetData(domainName, tag, sheetName, rows, columnMap)
    updateSheetData(domainName, tag, sheetName, poData, sheetData)
    updatePoData(domainName, tag, sheetName, poData, sheetData)
    await updateSheet(domainName, tag, sheetName, rows, sheetData)
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
        q: `name = 'vonvon-translate-temp' and trashed = false`,
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
        targets: {}
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
    for (const dataRow of rows.slice(1)) {
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
            console.warn(`[l10n:${domainName}] [syncPoToGoogleDocs:${sheetName}] ignoring row ${entry.row}: no key nor source`)
        }
    }
    // console.log(JSON.stringify(sheetData, null, 2))
    return sheetData
}

function readDataRow(dataRow, columnMap) {
    const targets = {}
    for (const [locale, localeColumn] of Object.entries(columnMap.targets)) {
        targets[locale] = dataRow[localeColumn] || ''
    }

    return {
        key: ('key' in columnMap) ? (dataRow[columnMap.key] || '') : '',
        source: dataRow[columnMap.source],
        targets: targets,
        tags: new Set((dataRow[columnMap.tag] || '').split(','))
    }
}

function updateSheetData(domainName, tag, sheetName, poData, sheetData) {
    for (const [locale, po] of Object.entries(poData)) {
        for (const data of Object.values(po)) {
            const poEntry = Object.values(data)[0]
            const entryId = poEntry.msgctxt || poEntry.msgid
            if (!entryId) {
                // Ignoring po metadata entry
                continue
            }

            // console.log('matched entry (locale)', locale)
            // console.log('po entry', poEntry)
            // console.log('sheet entry', sheetEntry)

            if (!(entryId in sheetData)) {
                sheetData[entryId] = {
                    key: poEntry.msgctxt,
                    source: poEntry.msgid,
                    targets: {},
                    tags: new Set()
                }
            }

            const sheetEntry = sheetData[entryId]
            if (poEntry.msgctxt !== sheetEntry.key || poEntry.msgid !== sheetEntry.source) {
                throw new Error(`entry conflict occurred ${poEntry} vs ${sheetEntry}`)
            }

            sheetEntry.key = poEntry.msgctxt
            sheetEntry.source = poEntry.msgid

            if (!sheetEntry.targets[locale]) {
                sheetEntry.targets[locale] = poEntry.msgstr[0]
            }
        }
    }
    // console.log('updated sheet data', sheetData)
}

function updatePoData(domainName, tag, sheetName, poData, sheetData) {
    for (const [entryId, sheetEntry] of Object.entries(sheetData)) {
        for (const [locale, target] of Object.entries(sheetEntry.targets)) {
            if (locale in poData && (sheetEntry.key in poData) && (sheetEntry.source in poData[sheetEntry.key])) {
                const poEntry = poData[sheetEntry.key][sheetEntry.source]
                sheetEntry.tags.add(tag)
                if (target && target !== '$$needs translation$$') {
                    poEntry.msgstr = [target]
                }
            }
        }
    }
    // console.log('updated po data', JSON.stringify(poData, null, 2))
}

async function updateSheet(domainName, tag, sheetName, rows, sheetData) {
    throw new Error('TODO')
}

function promisifiedDrive(drive) {
    drive.files.listAsync = promisify(drive.files.list)
    return drive
}

function promisifySheets(sheets) {
    /** @property {object} spreadsheets */
    sheets.spreadsheets.values.getAsync = promisify(sheets.spreadsheets.values.get)
    return sheets
}
