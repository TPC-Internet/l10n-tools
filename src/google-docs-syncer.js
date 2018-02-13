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
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive'
]
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/'
const TOKEN_PATH = TOKEN_DIR + 'google-docs-syncer.json'

export async function syncContextPoToGoogleDocs (domainName, googleDocs, tag, poDir) {
    const clientSecretPath = getConfig(googleDocs, 'google-docs', 'client-secret-path')
    const docName = getConfig(googleDocs, 'google-docs', 'doc-name')
    const sheetName = getConfig(googleDocs, 'google-docs', 'sheet-name')

    const drive = google.drive('v3')
    const sheets = google.sheets('v4')

    const oauth2Client = await authorize(clientSecretPath)

    const spreadSheetId = await findSpreadSheetId(drive, oauth2Client, docName)

    // await readSheets(sheets, oauth2Client, sheetName)


    await listMajors(oauth2Client, sheetName)
}

async function authorize(clientSecretPath) {
    /**
     * @property {object} installed
     * @property {installed.string[]} redirect_uris
     */
    const credentials = jsonfile.readFileSync(clientSecretPath)
    const clientSecret = credentials.installed.client_secret
    const clientId = credentials.installed.client_id
    const redirectUrl = credentials.installed.redirect_uris[0]
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUrl)

    // Check if we have previously stored a token.
    try {
        const token = jsonfile.readFileSync(TOKEN_PATH)
        oauth2Client.setCredentials(token)
    } catch (err) {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES
        })
        console.log('Authorize this app by visiting this url: ', authUrl)
        opn(authUrl)
        const code = await getAuthCode()
        const res = await oauth2Client.getToken(code)
        const token = res.tokens
        storeToken(token)
        oauth2Client.setCredentials(token)
    }
    return oauth2Client
}

function getAuthCode() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    return new Promise(resolve => {
        rl.question('Enter the code from that page here: ', code => {
            rl.close()
            resolve(code)
        })
    })
}

function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR)
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err
        }
    }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token))
    console.log('Token stored to ' + TOKEN_PATH)
}

async function findSpreadSheetId(drive, oauth2Client, docName) {
    const response = await promisify(drive.files.list)({
        q: `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${docName}'`,
        fields: 'files(id, name)',
        spaces: 'drive'
    }).then(res => res.data)
    console.log(response)
}

async function listMajors(authClient, sheetName) {
    /** @property {object} spreadsheets */
    const sheets = google.sheets('v4')
    try {
        const response = await promisify(sheets.spreadsheets.values.get)({
            auth: authClient,
            // spreadsheetId: '10dvnhN63phFvWkfnCfUYjdeHbeCvJOPupxQsqAWz94s',
            spreadsheetId: 'vonvon-translate-temp',
            range: `${sheetName}!A2:E`,
        }).then(res => res.data)
        const rows = response.values
        if (rows.length === 0) {
            console.log('No data found.');
        } else {
            console.log('Name, Major:');
            for (const row of rows) {
                // Print columns A and E, which correspond to indices 0 and 4.
                console.log('%s, %s', row[0], row[4]);
            }
        }
    } catch (err) {
        console.log('The API returned an error: ' + err)
    }
}
