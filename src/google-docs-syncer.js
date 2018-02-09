import {execWithLog, requireCmd, getConfig} from './utils'

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
