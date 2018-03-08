#!/usr/bin/env node

import program from 'commander'
import jsonfile from 'jsonfile'
import findRoot from 'find-root'
import log from 'npmlog'
import {countPoEntries, getPoEntryFlag, getPoEntries} from './po'
import {getDomainConfig, getTempDir} from './utils'
import {mergeFallbackLocale, updatePo} from './common'
import shell from 'shelljs'
import {syncPoToGoogleDocs} from './google-docs-syncer'
import path from 'path'

async function run () {
    process.chdir(findRoot(process.cwd()))

    let cmd = null
    program.version('0.1')
        .description('번역 추출, 동기화 툴')
        .option('-r, --rcfile [rcfile]', '설정 파일 지정, 기본값은 .l10nrc')
        .option('-d, --domains [domains]', '적용할 도메인 지정, 없으면 설정 파일에 있는 모든 도메인 (콤마로 여러 도메인 나열 가능)', val => val.split(','))
        .option('-q, --quiet', '조용히')
        .on('--help', () => {
            console.info(`

  설정 파일 항목:

    [도메인]
      domains.[domain]                  번역 파일을 생성하는 단위
      domains.[domain].type             도메인의 번역을 다루는 종류,
                                        지원: vue-gettext, i18next, vt, python, angular-gettext, cordova
      domains.[domain].tag              구글 시트 동기화시 tag 항목으로 들어갈 값
      domains.[domain].locales          번역할 로케일 목록
      domains.[domain].fallback-locale  번역이 없을 경우 참조할 로케일 (옵션)
      domains.[domain].i18n-dir         pot 파일과 po 파일을 저장할 위치
      domains.[domain].src-dirs         번역을 추출할 소스 디렉토리 목록
      domains.[domain].src-patterns     번역을 추출할 소스의 glob 패턴 목록
      
    [vue-gettext 항목]
      domains.[domain].target-path  번역 결과를 저장할 위치
      
    [i18next 항목]
      domains.[domain].keywords    번역 함수 이름 목록
      domains.[domain].target-dir  번역 결과를 저장할 위치
      
    [vt 항목]
      domains.[domain].keywords    번역 함수 이름 목록
      domains.[domain].target-dir  번역 결과를 저장할 위치
      
    [python 항목]
      domains.[domain].keywords    번역 함수 이름 목록
      domains.[domain].target-dir  번역 결과를 저장할 위치
      
    [angular-gettext 항목]
      domains.[domain].target-dir     번역 결과를 json 형식으로 저장할 위치
      domains.[domain].js-target-dir  번역 결과를 javascript 형식으로 저장할 위치
      
    [cordova 항목]
      domains.[domain].base-locale  번역 id로 사용할 로케일
      domains.[domain].target-dir   번역 결과를 저장할 위치
      
    [구글 문서 동기화]
      google-docs.doc-name                     동기화에 사용할 구글 문서 이름
      google-docs.sheet-name                   동기화에 사용할 구글 문서 내 시트 이름
      domains.[domain].google-docs.sheet-name  도메인 별로 동기화에 사용할 구글 문서 내 시트 이름
      google-docs.client-secret-path           구글 문서 동기화 API 호출시 사용할 secret 파일 위치`)
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
        .description('[고급] 소스에서 번역 추출하여 pot 파일 작성')
        .option('--potdir [potdir]', '설정한 위치에 pot 파일 추출')
        .action(c => {cmd = c})

    program.command('_updatePo')
        .description('[고급] pot 파일에서 po 파일 업데이트')
        .option('-l, --locales [locales]', '설정한 로케일만 업데이트 (콤마로 나열 가능)')
        .option('--potdir [potdir]', '설정한 위치에 있는 pot 파일에서 추출')
        .option('--podir [podir]', '설정한 위치에 업데이트된 po 파일 저장')
        .action(c => {cmd = c})

    program.command('_count')
        .description('[고급] 번역 항목 갯수 세기')
        .option('--podir [podir]', '설정한 위치에 있는 po 항목 세기')
        .option('-l, --locales [locales]', '갯수를 셀 로케일 (콤마로 나열 가능)')
        .option('-s, --spec [spec]', '어떤 것을 셀지 지정 (필수, 콤마로 나열하면 모든 조건 체크, !로 시작하면 반대) 지원: total,translated,untranslated,<flag>')
        .action(c => {cmd = c})

    program.command('_cat')
        .description('[고급] 번역 항목 표시')
        .option('--podir [podir]', '설정한 위치에 있는 po 항목 표시')
        .option('-l, --locale [locale]', '표시할 로케일 (필수)')
        .option('-s, --spec [spec]', '어떤 것을 표시할지 지정 (필수, 콤마로 나열하면 모든 조건 체크, !로 시작하면 반대) 지원: total,translated,untranslated,<flag>')
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
    log.heading = cmdName

    if (program.quiet) {
        log.level = 'warn'
    }

    const rc = jsonfile.readFileSync(program.rcfile || '.l10nrc')
    const domainNames = program.domains || Object.keys(rc.domains)

    for (const domainName of domainNames) {
        const type = getDomainConfig(rc, domainName, 'type')
        const domainModule = getDomainModule(type)

        log.heading = `[${domainName}] ${cmdName}`
        switch (cmdName) {
            case '_extractPot': {
                const i18nDir = cmd.potdir || getDomainConfig(rc, domainName, 'i18n-dir')
                const potPath = path.join(i18nDir, domainName, 'template.pot')

                await domainModule.extractPot(rc, domainName, potPath)
                break
            }

            case '_updatePo': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')
                const locales = cmd.locales ? cmd.locales.split(',') : getDomainConfig(rc, domainName, 'locales')

                const potPath = path.join(cmd.potdir || i18nDir, domainName, 'template.pot')
                const fromPoDir = path.join(i18nDir, domainName)
                const poDir = path.join(cmd.podir || i18nDir, domainName)

                updatePo(domainName, potPath, fromPoDir, poDir, locales)
                break
            }

            case '_count': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')
                const locales = cmd.locales ? cmd.locales.split(',') : getDomainConfig(rc, domainName, 'locales')
                const specs = cmd.spec ? cmd.spec.split(',') : ['total']

                const poDir = path.join(cmd.podir || i18nDir, domainName)
                const counts = locales.map(locale => {
                    const poPath = path.join(poDir, locale + '.po')
                    return locale + ':' + countPoEntries(poPath, specs)
                })
                process.stdout.write(`${domainName},${counts.join(',')}\n`)
                break
            }

            case '_cat': {
                if (!cmd.locale) {
                    cmd.help()
                }

                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')
                const locale = cmd.locale
                const specs = cmd.spec ? cmd.spec.split(',') : ['total']

                const poDir = path.join(cmd.podir || i18nDir, domainName)
                const poPath = path.join(poDir, locale + '.po')

                const poEntries = getPoEntries(poPath, specs)

                for (const poEntry of poEntries) {
                    const flag = getPoEntryFlag(poEntry)
                    if (flag) {
                        process.stdout.write(`#, ${flag}\n`)
                    }
                    if (poEntry.msgctxt) {
                        process.stdout.write(`msgctxt "${poEntry.msgctxt.replace(/\n/g, '\\n')}"\n`)
                    }
                    process.stdout.write(`msgid   "${poEntry.msgid.replace(/\n/g, '\\n')}"\n`)
                    process.stdout.write(`msgstr  "${poEntry.msgstr[0].replace(/\n/g, '\\n')}"\n\n`)
                }
                break
            }

            case '_apply': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')
                const fallbackLocale = getDomainConfig(rc, domainName, 'fallback-locale', null)

                const poDir = path.join(i18nDir, domainName)

                if (fallbackLocale != null) {
                    const tempDir = path.join(getTempDir(), domainName)
                    shell.rm('-rf', tempDir)
                    const mergedPoDir = tempDir
                    await mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir)
                    await domainModule.apply(rc, domainName, mergedPoDir)
                    shell.rm('-rf', tempDir)
                } else {
                    await domainModule.apply(rc, domainName, poDir)
                }
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
                const fallbackLocale = getDomainConfig(rc, domainName, 'fallback-locale', null)

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await domainModule.extractPot(rc, domainName, potPath)
                updatePo(domainName, potPath, poDir, poDir, locales)

                if (fallbackLocale != null) {
                    const tempDir = path.join(getTempDir(), domainName)
                    shell.rm('-rf', tempDir)
                    const mergedPoDir = tempDir
                    await mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir)
                    await domainModule.apply(rc, domainName, mergedPoDir)
                    shell.rm('-rf', tempDir)
                } else {
                    await domainModule.apply(rc, domainName, poDir)
                }
                break
            }

            case 'upload': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')
                const locales = getDomainConfig(rc, domainName, 'locales')
                const tag = getDomainConfig(rc, domainName, 'tag')

                const fromPoDir = path.join(i18nDir, domainName)
                const tempDir = path.join(getTempDir(), domainName)
                const potPath = path.join(tempDir, 'template.pot')
                const poDir = tempDir

                log.info('l10n', `temp dir: '${tempDir}'`)
                shell.rm('-rf', tempDir)
                await domainModule.extractPot(rc, domainName, potPath)
                updatePo(domainName, potPath, fromPoDir, poDir, locales)
                await syncPoToGoogleDocs(rc, domainName, tag, poDir)
                shell.rm('-rf', tempDir)
                break
            }

            case 'sync': {
                const i18nDir = getDomainConfig(rc, domainName, 'i18n-dir')
                const locales = getDomainConfig(rc, domainName, 'locales')
                const fallbackLocale = getDomainConfig(rc, domainName, 'fallback-locale', null)
                const tag = getDomainConfig(rc, domainName, 'tag')

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await domainModule.extractPot(rc, domainName, potPath)
                updatePo(domainName, potPath, poDir, poDir, locales)
                await syncPoToGoogleDocs(rc, domainName, tag, poDir)
                updatePo(domainName, potPath, poDir, poDir, locales)

                if (fallbackLocale != null) {
                    const tempDir = path.join(getTempDir(), domainName)
                    shell.rm('-rf', tempDir)
                    const mergedPoDir = tempDir
                    await mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir)
                    await domainModule.apply(rc, domainName, mergedPoDir)
                    shell.rm('-rf', tempDir)
                } else {
                    await domainModule.apply(rc, domainName, poDir)
                }
                break
            }

            default:
                throw new Error(`unknown sub-command: ${cmdName}`)
        }
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
        case 'angular-gettext':
            return require('./domain/angular-gettext')
        case 'cordova':
            return require('./domain/cordova')
        default:
            throw new Error(`unknown domain type: ${type}`)
    }
}

run().catch(err => {
    if (err) {
        log.error('l10n', err)
    }
    process.exit(1)
})
