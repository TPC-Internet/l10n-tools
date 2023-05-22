import log from 'npmlog'
import {findPoEntry, getPoEntries, getPoEntryFlag, removePoEntryFlag, setPoEntryFlag} from '../po.js'
import {type DomainConfig, type L10nConfig, LokaliseConfig} from '../config.js'
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
import PQueue from 'p-queue';
import {addContext, containsContext, getContexts, removeContext} from './lokalise-context.js';
import {addToArraySet, removeFromArraySet} from '../utils.js';

export async function syncPoToLokalise (config: L10nConfig, domainConfig: DomainConfig, tag: string, pot: GetTextTranslations, poData: {[locale: string]: GetTextTranslations}, drySync: boolean) {
    const lokaliseConfig = config.getLokaliseConfig()
    const lokaliseApi = new LokaliseApi({apiKey: lokaliseConfig.getToken()})
    const projectId = lokaliseConfig.getProjectId()
    const platform = domainConfig.getLokalisePlatform()

    // 1. Lokalise 에서 키 읽어오기
    const listedKeys = await listLokaliseKeys(lokaliseApi, projectId, lokaliseConfig)
    const listedKeyMap: {[keyName: string]: Key} = {}
    for (const key of listedKeys) {
        const keyPlatform = key.key_name[platform]
        if (keyPlatform) {
            listedKeyMap[decodeKeyName(keyPlatform)] = key
        }
    }
    // 2. 로컬 번역과 비교하여 Lokalise 에 업로드할 데이터 만들기
    const {creatingKeyMap, updatingKeyMap} = updateKeyData(platform, tag, pot, poData, listedKeyMap)
    // 3. 로컬 번역 업데이트
    updatePoData(tag, lokaliseConfig, pot, poData, listedKeyMap)
    // 4. 2에서 준비한 데이터 Lokalise 에 업로드
    await uploadToLokalise(lokaliseApi, projectId, tag, lokaliseConfig, creatingKeyMap, updatingKeyMap, drySync)
}

async function listLokaliseKeys(lokaliseApi: LokaliseApi, projectId: string, config: LokaliseConfig) {
    log.info('lokaliseApi', 'listing keys')
    const invertedSyncMap = config.getLocaleSyncMap(true)

    const totalCount = await getTotalKeyCount(lokaliseApi, projectId)
    const numPages = Math.ceil(totalCount / 500)

    const queue = new PQueue({interval: 500, intervalCap: 1})
    const chunkPromises: Promise<Key[]>[] = []
    for (let page = 1; page <= numPages; page++) {
        chunkPromises.push(queue.add(async () => {
            try {
                log.info('lokaliseApi', `fetched key (page ${page}) started`)
                const pagedKeys = await lokaliseApi.keys().list({
                    project_id: projectId,
                    include_translations: 1,
                    limit: 500,
                    page: page
                })
                log.info('lokaliseApi', `fetched key (page ${page}) done`, pagedKeys.items.length)
                return pagedKeys.items.map(key => reverseLocaleSyncMap(key, invertedSyncMap))
            } catch (err) {
                log.error('lokaliseApi', 'fetching keys failed', err)
                throw err
            }
        }, {throwOnTimeout: true}))
    }
    const chunks = await Promise.all(chunkPromises)
    return chunks.flat()
}

async function getTotalKeyCount(lokaliseApi: LokaliseApi, projectId: string): Promise<number> {
    try {
        const pagedKeys = await lokaliseApi.keys().list({
            project_id: projectId,
            limit: 1,
            page: 1
        })
        log.info('lokaliseApi', 'fetched key count', pagedKeys.totalResults)
        return pagedKeys.totalResults
    } catch (err) {
        log.error('lokaliseApi', 'fetching key count failed', err)
        throw err
    }
}

function reverseLocaleSyncMap(key: Key, invertedSyncMap: {[locale: string]: string} | undefined): Key {
    if (invertedSyncMap == null) {
        return key
    }
    return {
        ...key,
        translations: key.translations.map(tr => ({
            ...tr,
            language_iso: invertedSyncMap[tr.language_iso] ?? tr.language_iso
        }))
    }
}

function createUpdateKeyDataByAdding(platform: SupportedPlatforms, tag: string, key: Key | UpdateKeyDataWithId, potEntry: GetTextTranslation): UpdateKeyDataWithId {
    return {
        key_id: key.key_id,
        key_name: encodeKeyName(potEntry.msgid),
        platforms: addToArraySet(key.platforms ?? [], platform),
        tags: addToArraySet(key.tags ?? [], tag),
        context: addContext(key.context, tag, potEntry.msgctxt)
    }
}

function encodeKeyName(keyName: string): string {
    if (/^\s/.test(keyName)) {
        keyName = 'BEG:' + keyName
    }
    if (/\s$/.test(keyName)) {
        keyName = keyName + ':END'
    }
    return keyName
}

function decodeKeyName(encodedKeyName: string): string {
    return encodedKeyName
        .replace(/^BEG:/, '')
        .replace(/:END$/, '')
}

function createUpdateKeyDataByRemoving(platform: SupportedPlatforms, tag: string, key: Key | UpdateKeyDataWithId, keyName: string, msgctxt: string | null): UpdateKeyDataWithId {
    const context = removeContext(key.context, tag, msgctxt)
    if (getContexts(context, tag, false).length == 0) {
        return {
            key_id: key.key_id,
            key_name: encodeKeyName(keyName),
            tags: removeFromArraySet(key.tags ?? [], tag),
            context: context
        }
    } else {
        return {
            key_id: key.key_id,
            key_name: encodeKeyName(keyName),
            platforms: addToArraySet(key.platforms ?? [], platform),
            tags: addToArraySet(key.tags ?? [], tag),
            context: context
        }
    }
}

function createNewKeyData(platform: SupportedPlatforms, tag: string, potEntry: GetTextTranslation): CreateKeyData {
    return {
        key_name: encodeKeyName(potEntry.msgid),
        platforms: [platform],
        tags: [tag],
        context: addContext(undefined, tag, potEntry.msgctxt)
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

    for (const keyName of Object.keys(listedKeyMap)) {
        const key = updatingKeyMap[keyName] ?? listedKeyMap[keyName]
        if (!key.tags?.includes(tag)) {
            continue
        }
        for (const msgctxt of getContexts(key.context, tag, true)) {
            const potEntry = findPoEntry(pot, msgctxt, keyName)
            if (potEntry == null) {
                updatingKeyMap[keyName] = createUpdateKeyDataByRemoving(platform, tag, key, keyName, msgctxt)
            }
        }
    }

    for (const potEntry of getPoEntries(pot)) {
        // 로컬에서 추출한 pot 에서 (pot 에는 번역은 없고 msgid 만 있음)
        const entryId = potEntry.msgid
        const key = updatingKeyMap[entryId] ?? listedKeyMap[entryId]
        if (key != null) {
            // 기존 키는 있는데
            if (!key.tags?.includes(tag) || !key.platforms?.includes(platform) || !containsContext(key.context, tag, potEntry.msgctxt)) {
                // 태그, 플랫폼, context 가 없으면 업데이트
                updatingKeyMap[entryId] = createUpdateKeyDataByAdding(platform, tag, key, potEntry)
            }
        } else {
            // 기존 키 자체가 없으면 새로 키 만들기
            creatingKeyMap[entryId] = createNewKeyData(platform, tag, potEntry)
        }
    }

    for (const [locale, po] of Object.entries(poData)) {
        // console.log('update sheet locale', locale)
        for (const poEntry of getPoEntries(po)) {
            // 로케일별 po 에서 (po 에는 번역도 있음)
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
                        updatingKey = createUpdateKeyDataByAdding(platform, tag, key, poEntry)
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
    config: LokaliseConfig,
    pot: GetTextTranslations,
    poData: {[locale: string]: GetTextTranslations},
    listedKeyMap: {[keyName: string]: Key}
) {
    const skipUnverified = config.skipUnverified()
    const skipNotReviewed = config.skipNotReviewed()
    for (const [keyName, key] of Object.entries(listedKeyMap)) {
        for (const tr of key.translations) {
            const locale = tr.language_iso
            // lokalise 에 있는 번역에 대해서
            if (poData[locale] != null) {
                // 해당 언어 번역이 있는 경우
                const po = poData[locale]
                const poEntries = []
                for (const msgctxt of getContexts(key.context, tag, true)) {
                    const poEntry = findPoEntry(po, msgctxt, keyName)
                    if (poEntry) {
                        poEntries.push(poEntry)
                    }
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
                            log.notice('updatePoData', `remove all flags of ${locale} of ${entryId}`)
                            removePoEntryFlag(poEntry)
                        }
                    }

                    if (skipNotReviewed && !tr.is_reviewed) {
                        log.info('updatePoData', `skipping not reviewed: ${locale} of ${entryId}`)
                        continue
                    }
                    if (skipUnverified && tr.is_unverified) {
                        log.info('updatePoData', `skipping unverified: ${locale} of ${entryId}`)
                        continue
                    }
                    if (tr.translation && tr.translation !== poEntry.msgstr[0]) {
                        log.notice('updatePoData', `updating ${locale} value of ${entryId}: ${poEntry.msgstr[0]} -> ${tr.translation}`)
                        poEntry.msgstr = [tr.translation]
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
    config: LokaliseConfig,
    creatingKeyMap: {[keyName: string]: CreateKeyData},
    updatingKeyMap: {[keyName: string]: UpdateKeyDataWithId},
    drySync: boolean
) {
    const localeSyncMap = config.getLocaleSyncMap(false)
    for (let keys of chunk(Object.values(creatingKeyMap), 500)) {
        try {
            keys = keys.map(key => applyLocaleSyncMap(key, localeSyncMap))
            if (drySync) {
                log.notice('drySync', 'create keys', JSON.stringify(keys, undefined, 2))
            } else {
                await lokaliseApi.keys().create({
                    keys: keys
                }, {
                    project_id: projectId
                })
            }
            log.info('lokaliseApi', 'created key count', keys.length)
        } catch (err) {
            log.error('lokaliseApi', 'creating keys failed', err)
            throw err
        }
    }

    for (let keys of chunk(Object.values(updatingKeyMap), 500)) {
        try {
            keys = keys.map(key => applyLocaleSyncMap(key, localeSyncMap))
            if (drySync) {
                log.notice('drySync', 'updating keys', JSON.stringify(keys, undefined, 2))
            } else {
                await lokaliseApi.keys().bulk_update({
                    keys: keys
                }, {
                    project_id: projectId
                })
            }
            log.info('lokaliseApi', 'updated key count', keys.length)
        } catch (err) {
            log.error('lokaliseApi', 'updating keys failed', err)
            throw err
        }
    }
}

function applyLocaleSyncMap<T extends CreateKeyData | UpdateKeyDataWithId>(
    key: T,
    localeSyncMap: {[locale: string]: string} | undefined
): T {
    if (key.translations == null || localeSyncMap == null) {
        return key
    }
    return {
        ...key,
        translations: key.translations.map(tr => {
            if (!tr.language_iso) {
                return tr
            }
            return {
                ...tr,
                language_iso: localeSyncMap[tr.language_iso] ?? tr.language_iso
            }
        })
    }
}
