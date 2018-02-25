#!/usr/bin/env node

import program from 'commander'
import jsonfile from 'jsonfile'
import {getDomainConfig} from './utils'
import {updatePo} from './common'
import shell from 'shelljs'
import {syncPoToGoogleDocs} from './google-docs-syncer'
import os from 'os'
import path from 'path'

async function run () {
    let cmd = null
    program.version('0.1')
        .description('번역 추출, 동기화 툴')
        .option('-r, --rcfile [rcfile]', '설정 파일 지정, 기본값은 .l10nrc')
        .option('-d, --domains [domains]', '적용할 도메인 지정, 없으면 설정 파일에 있는 모든 도메인 (콤마로 여러 도메인 나열 가능)', val => val.split(','))
        .on('--help', () => {
            console.info(`

  설정 파일 항목:

    [도메인]
      domains.[domain]           번역 파일을 생성하는 단위
      domains.[domain].type      도메인의 번역을 다루는 종류, 지원: vue-gettext
      domains.[domain].tag       구글 시트 동기화시 tag 항목으로 들어갈 값
      domains.[domain].locales   번역할 로케일 목록
      domains.[domain].i18n-dir  pot 파일과 po 파일을 저장할 위치
        
    [vue-gettext 항목]
      domains.[domain].src-dirs     번역을 추출할 .vue, .js 파일이 있는 소스 위치 목록
      domains.[domain].target-path  번역 결과를 저장할 위치
      
    [i18next 항목]
      domains.[domain].src-dirs    번역을 추출할 .js 파일이 있는 소스 위치 목록
      domains.[domain].keywords    번역 함수 이름 목록
      domains.[domain].target-dir  번역 결과를 저장할 위치
      
    [구글 문서 동기화]
      google-docs.doc-name            동기화에 사용할 구글 문서 이름
      google-docs.sheet-name          동기화에 사용할 구글 문서 내 시트 이름
      google-docs.client-secret-path  구글 문서 동기화 API 호출시 사용할 secret 파일 위치`)
        })

    program.command('update')
        .description('로컬 번역 업데이트')
        .action(c => {cmd = c})

    program.command('upload')
        .description('로컬 소스 변경사항을 Google Docs 에 업로드 (로컬 번역 파일은 건드리지 않음)')
        .action(c => {cmd = c})

    program.command('sync')
        .description('로컬 소스와 Google Docs 간 싱크')
        .action(c => {cmd = c})

    program.command('_extractPot')
        .description('[고급] 소스에서 번역 추출하여 POT 파일 작성')
        .action(c => {cmd = c})

    program.command('_updatePo')
        .description('[고급] POT 파일에서 PO 파일 업데이트')
        .action(c => {cmd = c})

    program.command('_apply')
        .description('[고급] PO 파일에서 번역 에셋 작성')
        .action(c => {cmd = c})

    program.command('_sync')
        .description('[고급] PO 파일 Google Docs 싱크')
        .action(c => {cmd = c})

    program.parse(process.argv)

    if (!cmd) {
        program.help()
    }

    const cmdName = cmd._name
    const rc = jsonfile.readFileSync(program.rcfile || '.l10nrc')

    const domainNames = program.domains || Object.keys(rc.domains)
    for (const domainName of domainNames) {
        const type = getDomainConfig(rc, domainName, 'type')
        const domainModule = getDomainModule(type)

        console.info(`[l10n:${domainName}] [${cmdName}] start`)
        switch (cmdName) {
            case '_extractPot': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')

                const potPath = path.join(i18nDir, domainName, 'template.pot')

                await domainModule.extractPot(rc, domainName, potPath)
                break
            }

            case '_updatePo': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')
                const locales = getDomainConfig(rc, domainName, 'locales')

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await updatePo(domainName, potPath, poDir, locales)
                break
            }

            case '_apply': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')

                const poDir = path.join(i18nDir, domainName)

                await domainModule.apply(rc, domainName, poDir)
                break
            }

            case '_sync': {
                const tag = getDomainConfig(rc, domainName, 'tag')
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')

                const poDir = path.join(i18nDir, domainName)

                await syncPoToGoogleDocs(rc, domainName, tag, poDir)
                break
            }

            case 'update': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')
                const locales = getDomainConfig(rc, domainName, 'locales')

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await domainModule.extractPot(rc, domainName, potPath)
                await updatePo(domainName, potPath, poDir, locales)
                await domainModule.apply(rc, domainName, poDir)
                break
            }

            case 'upload': {
                const locales = getDomainConfig(rc, domainName, 'locales')
                const tag = getDomainConfig(rc, domainName, 'tag')

                const tempDir = path.join(os.tmpdir(), domainName)
                const potPath = path.join(tempDir, 'template.pot')
                const poDir = tempDir

                console.info(`[l10n:${domainName}] [${cmdName}] temp dir: '${tempDir}'`)
                shell.rm('-rf', tempDir)
                await domainModule.extractPot(rc, domainName, potPath)
                await updatePo(domainName, potPath, poDir, locales)
                await syncPoToGoogleDocs(rc, domainName, tag, poDir)
                shell.rm('-rf', tempDir)
                break
            }

            case 'sync': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')
                const locales = getDomainConfig(rc, domainName, 'locales')
                const tag = getDomainConfig(rc, domainName, 'tag')

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await domainModule.extractPot(rc, domainName, potPath)
                await updatePo(domainName, potPath, poDir, locales)
                await syncPoToGoogleDocs(rc, domainName, tag, poDir)
                await updatePo(domainName, potPath, poDir, locales)
                await domainModule.apply(rc, domainName, poDir)
                break
            }

            default:
                throw new Error(`unknown sub-command: ${cmdName}`)
        }
        console.info(`[l10n:${domainName}] [${cmdName}] done`)
    }
}

function getDomainModule (type) {
    switch (type) {
        case 'vue-gettext':
            return require('./domain/vue-gettext')
        case 'i18next':
            return require('./domain/i18next')
        case 'vt':
            return require('./domain/vt')
        case 'python':
            return require('./domain/python')
        case 'cordova':
            return require('./domain/cordova')
        default:
            throw new Error(`unknown domain type: ${type}`)
    }
}

run().catch(err => {
    if (err) {
        console.error(err)
    }
    process.exit(1)
})
