import log from 'npmlog'
import {findPoEntry, getPoEntries, getPoEntryFlag, removePoEntryFlag, setPoEntryFlag} from '../po.js'
import {type DomainConfig, type L10nConfig} from '../config.js'
import {type GetTextTranslation, type GetTextTranslations} from 'gettext-parser'
import {
    type CreateKeyData,
    type Key,
    LokaliseApi,
    type SupportedPlatforms,
    type TranslationData,
    type UpdateKeyDataWithId
} from '@lokalise/node-api'
import {chunk} from 'lodash-es'

export async function syncPoToLokalise (config: L10nConfig, domainConfig: DomainConfig, tag: string, pot: GetTextTranslations, poData: {[locale: string]: GetTextTranslations}) {
    const lokaliseConfig = config.getLokaliseConfig()
    const lokaliseApi = new LokaliseApi({apiKey: lokaliseConfig.getToken()})
    const projectId = lokaliseConfig.getProjectId()
    const platform = domainConfig.getLokalisePlatform()

    const listedKeys = await listLokaliseKeys(lokaliseApi, projectId)
    const listedKeyMap: {[keyName: string]: Key} = {}
    for (const key of listedKeys) {
        const keyPlatform = key.key_name[platform]
        if (keyPlatform) {
            listedKeyMap[keyPlatform] = key
        }
    }
    const {creatingKeyMap, updatingKeyMap} = updateKeyData(platform, tag, pot, poData, listedKeyMap)
    updatePoData(tag, pot, poData, listedKeyMap)
    await uploadToLokalise(lokaliseApi, projectId, tag, creatingKeyMap, updatingKeyMap)
}

async function listLokaliseKeys(lokaliseApi: LokaliseApi, projectId: string) {
    log.info('listLokaliseKeys', 'listing keys')

    const keys: Key[] = []
    let page = 1
    while (true) {
        const pagedKeys = await lokaliseApi.keys().list({
            project_id: projectId,
            include_translations: 1,
            limit: 500,
            page: page
            // filter_platforms: 'web'
            // filter_tags: tag,
        })
        log.info('listLokaliseKeys', 'paged keys', pagedKeys)
        keys.push(...pagedKeys.items)
        if (!pagedKeys.hasNextPage()) {
            break
        }
        page += 1
    }
    log.info('listLokaliseKeys', 'total listed key count', keys.length)
    return keys
}

function createUpdateKeyData(platform: SupportedPlatforms, tag: string, key: Key, potEntry: GetTextTranslation): UpdateKeyDataWithId {
    return {
        key_id: key.key_id,
        key_name: potEntry.msgid,
        platforms: [...new Set([...key.platforms, platform])],
        tags: [tag],
        merge_tags: true,
        context: potEntry.msgctxt
    }
}

function createNewKeyData(platform: SupportedPlatforms, tag: string, potEntry: GetTextTranslation): CreateKeyData {
    return {
        key_name: potEntry.msgid,
        platforms: [platform],
        tags: [tag],
        context: potEntry.msgctxt
    }
}

function appendTranslation(key: CreateKeyData | UpdateKeyDataWithId, translation: TranslationData) {
    if (key.translations == null) {
        key.translations = [translation]
    } else {
        key.translations.push(translation)
    }
}

function keyHasTranslation(key: Key | CreateKeyData, locale: string): boolean {
    if (key.translations == null) {
        return false
    }
    return key.translations.some(tr => tr.language_iso == locale)
}

function createTranslationData(locale: string, msgstr: string): TranslationData {
    return {
        language_iso: locale,
        translation: msgstr,
        is_unverified: true
    }
}

function updateKeyData(
    platform: SupportedPlatforms,
    tag: string,
    pot: GetTextTranslations,
    poData: {[locale: string]: GetTextTranslations},
    listedKeyMap: {[keyName: string]: Key}
): {
    creatingKeyMap: {[keyName: string]: CreateKeyData},
    updatingKeyMap: {[keyName: string]: UpdateKeyDataWithId}
} {
    // 새로 만들 키
    const creatingKeyMap: {[keyName: string]: CreateKeyData} = {}
    // 기존 키에서 업데이트할 부분
    const updatingKeyMap: {[keyName: string]: UpdateKeyDataWithId} = {}

    for (const potEntry of getPoEntries(pot)) {
        // 로컬에서 추출한 pot 에서 (pot에는 번역은 없고 msgid만 있음)
        const entryId = potEntry.msgid
        const key = listedKeyMap[entryId]
        if (key != null) {
            // 기존 키는 있는데
            if (!key.tags.includes(tag) || !key.platforms.includes(platform)) {
                // 태그가 없으면 업데이트
                updatingKeyMap[entryId] = createUpdateKeyData(platform, tag, key, potEntry)
            }
        } else {
            // 기존 키 자체가 없으면 새로 키 만들기
            creatingKeyMap[entryId] = createNewKeyData(platform, tag, potEntry)
        }
    }

    for (const [locale, po] of Object.entries(poData)) {
        // console.log('update sheet locale', locale)
        for (const poEntry of getPoEntries(po)) {
            // 로케일별 po 에서 (po에는 번역도 있음)
            const entryId = poEntry.msgid
            // console.log('update sheet entry id', entryId)
            // console.log('matched entry (locale)', locale)
            // console.log('po entry', poEntry)

            const key = listedKeyMap[entryId]
            if (key != null) {
                // 기존 키는 있는데
                if (poEntry.msgstr[0] && !keyHasTranslation(key, locale)) {
                    // 기존 키에 로컬 번역은 있는데, lokalise 에 번역이 있는 경우 unverified 상태로 넣어줌
                    let updatingKey = updatingKeyMap[entryId]
                    if (updatingKey == null) {
                        updatingKey = createUpdateKeyData(platform, tag, key, poEntry)
                        updatingKeyMap[entryId] = updatingKey
                    }
                    appendTranslation(updatingKey, createTranslationData(locale, poEntry.msgstr[0]))
                }
            } else {
                const creatingKey = creatingKeyMap[entryId]
                if (creatingKey != null) {
                    // 새로 만들 키에 번역 추가 (unverified)
                    if (poEntry.msgstr[0] && !keyHasTranslation(creatingKey, locale)) {
                        appendTranslation(creatingKey, createTranslationData(locale, poEntry.msgstr[0]))
                    }
                }
            }
        }
    }
    // console.log('updated sheet data', sheetData)
    return {creatingKeyMap, updatingKeyMap}
}

function updatePoData(
    tag: string,
    pot: GetTextTranslations,
    poData: {[locale: string]: GetTextTranslations},
    listedKeyMap: {[keyName: string]: Key}
) {
    for (const [keyName, key] of Object.entries(listedKeyMap)) {
        for (const tr of key.translations) {
            const locale = tr.language_iso
            // lokalise 에 있는 번역에 대해서
            if (poData[locale] != null) {
                // 해당 언어 번역이 있는 경우
                const po = poData[locale]
                const poEntries = []
                if (key.context) {
                    const poEntry = findPoEntry(po, key.context, keyName)
                    if (poEntry) {
                        poEntries.push(poEntry)
                    }
                }
                const poEntry = findPoEntry(po, null, keyName)
                if (poEntry) {
                    poEntries.push(poEntry)
                }

                for (const poEntry of poEntries) {
                    // console.log('updating po, sheet entry', sheetEntry)
                    // console.log('updating po, po', po)
                    const entryId = poEntry.msgid
                    const flag = getPoEntryFlag(poEntry)
                    // console.log('updating po, po entry', poEntry)
                    if (tr.is_unverified) {
                        if (flag != 'unverified') {
                            setPoEntryFlag(poEntry, 'unverified')
                        }
                    } else if (!tr.is_reviewed) {
                        if (flag != 'not_reviewed') {
                            setPoEntryFlag(poEntry, 'not_reviewed')
                        }
                    } else {
                        if (flag) {
                            log.notice('updatePoData', `remove mark of ${locale} of ${entryId}`)
                            removePoEntryFlag(poEntry)
                        }

                        if (tr.translation && tr.translation !== poEntry.msgstr[0]) {
                            log.notice('updatePoData', `updating value of ${entryId}: ${poEntry.msgstr[0]} -> ${tr.translation}`)
                            poEntry.msgstr = [tr.translation]
                        }
                    }
                }
            }
        }
    }
    // console.log('updated po data', JSON.stringify(poData, null, 2))
}

async function uploadToLokalise(
    lokaliseApi: LokaliseApi,
    projectId: string,
    tag:string,
    creatingKeyMap: {[keyName: string]: CreateKeyData},
    updatingKeyMap: {[keyName: string]: UpdateKeyDataWithId}
) {
    for (const keys of chunk(Object.values(creatingKeyMap), 500)) {
        await lokaliseApi.keys().create({
            keys: keys
        }, {
            project_id: projectId
        })
        log.info('listLokaliseKeys', 'created key count', keys.length)
    }

    for (const keys of chunk(Object.values(updatingKeyMap), 500)) {
        await lokaliseApi.keys().bulk_update({
            keys: keys
        }, {
            project_id: projectId
        })
        log.info('listLokaliseKeys', 'updated key count', keys.length)
    }
}
