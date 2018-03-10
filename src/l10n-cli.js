#!/usr/bin/env node

import pkg from '../package'
import program from 'commander'
import jsonfile from 'jsonfile'
import findRoot from 'find-root'
import log from 'npmlog'
import {countPoEntries, getPoEntryFlag, getPoEntries} from './po'
import {getTempDir} from './utils'
import {mergeFallbackLocale, updatePo} from './common'
import * as shell from 'shelljs'
import {syncPoToGoogleDocs} from './google-docs-syncer'
import path from 'path'
import {Config} from './config'
import {extractPot} from './extractor'
import {compileAll} from './compiler'

async function run () {
    process.chdir(findRoot(process.cwd()))

    let cmd = null
    program.version(pkg.version)
        .description(pkg.description)
        .option('-r, --rcfile [rcfile]', '설정 파일 지정, 기본값은 .l10nrc')
        .option('-d, --domains [domains]', '적용할 도메인 지정, 없으면 설정 파일에 있는 모든 도메인 (콤마로 여러 도메인 나열 가능)', val => val.split(','))
        .option('-v, --verbose', 'log verbose')
        .option('-q, --quiet', '조용히')
        .on('--help', () => {
            console.info(`

  설정 파일 항목:

    [도메인]
      domains.[domain]                  번역 파일을 생성하는 단위
      domains.[domain].tag              구글 시트 동기화시 tag 항목으로 들어갈 값
      domains.[domain].locales          번역할 로케일 목록
      domains.[domain].fallback-locale  번역이 없을 경우 참조할 로케일 (옵션)
      domains.[domain].i18n-dir         pot 파일과 po 파일을 저장할 위치
      domains.[domain].src-dirs         번역을 추출할 소스 디렉토리 목록
      domains.[domain].src-patterns     번역을 추출할 소스의 glob 패턴 목록
      
    [extractor]
      domains.[domain].type      extractor 종류 (vue-gettext, i18next, vt, python, angular-gettext, cordova)
      domains.[domain].keywords  번역에 사용하는 함수 이름 목록 (i18next, vt, python)

    [compiler]
      domains.[domain].outputs[n].type         compiler 종류 (mo, json, json-dir, angular-gettext, cordova)
      domains.[domain].outputs[n].target-path  번역 결과를 저장할 파일 이름 (json)
      domains.[domain].outputs[n].target-dir   번역 결과를 로케일 별 파일로 저장할 위치 (mo, json-dir, angular-gettext, cordova)
      domains.[domain].outputs[n].use-locale-key  결과에 locale 키를 사용할지 결정 (json-dir)
      domains.[domain].outputs[n].base-locale  번역 id로 사용할 로케일 (cordova)
      
      domains.[domain].outputs 가 없을 경우 domains.[domain] 영역에서 compiler 설정 가져옴
      이 경우 extractor type에 따른 기본 compiler type:
      
      - vue-gettext: json
      - i18next: json-dir
      - vt, python: mo 
      
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

    program.command('_compile')
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

    if (program.verbose) {
        log.level = 'silly'
    } else if (program.quiet) {
        log.level = 'warn'
    }

    const rc = jsonfile.readFileSync(program.rcfile || '.l10nrc')
    const config = new Config(rc)
    const domainNames = program.domains || Object.keys(config.get('domains'))

    for (const domainName of domainNames) {
        const domainConfig = config.getSubConfig(['domains', domainName])

        log.heading = `[${domainName}] ${cmdName}`
        switch (cmdName) {
            case '_extractPot': {
                const i18nDir = cmd.potdir || domainConfig.get('i18n-dir')
                const potPath = path.join(i18nDir, domainName, 'template.pot')

                await extractPot(domainName, domainConfig, potPath)
                break
            }

            case '_updatePo': {
                const i18nDir = domainConfig.get('i18n-dir')
                const locales = cmd.locales ? cmd.locales.split(',') : domainConfig.get('locales')

                const potPath = path.join(cmd.potdir || i18nDir, domainName, 'template.pot')
                const fromPoDir = path.join(i18nDir, domainName)
                const poDir = path.join(cmd.podir || i18nDir, domainName)

                updatePo(potPath, fromPoDir, poDir, locales)
                break
            }

            case '_count': {
                const i18nDir = domainConfig.get('i18n-dir')
                const locales = cmd.locales ? cmd.locales.split(',') : domainConfig.get('locales')
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

                const i18nDir = domainConfig.get('i18n-dir')
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

            case '_compile': {
                const i18nDir = domainConfig.get('i18n-dir')
                const fallbackLocale = domainConfig.get('fallback-locale', null)

                const poDir = path.join(i18nDir, domainName)

                if (fallbackLocale != null) {
                    const tempDir = path.join(getTempDir(), domainName)
                    shell.rm('-rf', tempDir)
                    const mergedPoDir = tempDir
                    await mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir)
                    await compileAll(domainName, domainConfig, mergedPoDir)
                    shell.rm('-rf', tempDir)
                } else {
                    await compileAll(domainName, domainConfig, poDir)
                }
                break
            }

            case '_sync': {
                const tag = domainConfig.get('tag')
                const i18nDir = domainConfig.get('i18n-dir')

                const poDir = path.join(i18nDir, domainName)

                await syncPoToGoogleDocs(config, domainConfig, tag, poDir)
                break
            }

            case 'update': {
                const i18nDir = domainConfig.get('i18n-dir')
                const locales = domainConfig.get('locales')
                const fallbackLocale = domainConfig.get('fallback-locale', null)

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, poDir, poDir, locales)

                if (fallbackLocale != null) {
                    const tempDir = path.join(getTempDir(), domainName)
                    shell.rm('-rf', tempDir)
                    const mergedPoDir = tempDir
                    await mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir)
                    await compileAll(domainName, domainConfig, mergedPoDir)
                    shell.rm('-rf', tempDir)
                } else {
                    await compileAll(domainName, domainConfig, poDir)
                }
                break
            }

            case 'upload': {
                const i18nDir = domainConfig.get('i18n-dir')
                const locales = domainConfig.get('locales')
                const tag = domainConfig.get('tag')

                const fromPoDir = path.join(i18nDir, domainName)
                const tempDir = path.join(getTempDir(), domainName)
                const potPath = path.join(tempDir, 'template.pot')
                const poDir = tempDir

                log.info('l10n', `temp dir: '${tempDir}'`)
                shell.rm('-rf', tempDir)
                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, fromPoDir, poDir, locales)
                await syncPoToGoogleDocs(config, domainConfig, tag, poDir)
                shell.rm('-rf', tempDir)
                break
            }

            case 'sync': {
                const i18nDir = domainConfig.get('i18n-dir')
                const locales = domainConfig.get('locales')
                const fallbackLocale = domainConfig.get('fallback-locale', null)
                const tag = domainConfig.get('tag')

                const potPath = path.join(i18nDir, domainName, 'template.pot')
                const poDir = path.join(i18nDir, domainName)

                await extractPot(domainName, domainConfig, potPath)
                updatePo(potPath, poDir, poDir, locales)
                await syncPoToGoogleDocs(config, domainConfig, tag, poDir)
                updatePo(potPath, poDir, poDir, locales)

                if (fallbackLocale != null) {
                    const tempDir = path.join(getTempDir(), domainName)
                    shell.rm('-rf', tempDir)
                    const mergedPoDir = tempDir
                    await mergeFallbackLocale(domainName, poDir, fallbackLocale, mergedPoDir)
                    await compileAll(domainName, domainConfig, mergedPoDir)
                    shell.rm('-rf', tempDir)
                } else {
                    await compileAll(domainName, domainConfig, poDir)
                }
                break
            }

            default:
                throw new Error(`unknown sub-command: ${cmdName}`)
        }
    }
}

run().catch(err => {
    if (err) {
        log.error('l10n', err)
    }
    process.exit(1)
})
