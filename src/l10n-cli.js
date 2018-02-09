#!/usr/bin/env node

import parseArgs from 'minimist'
import jsonfile from 'jsonfile'

async function run () {
    const {
        _: [cmd],
        f: rcFile,
        d: domainOption = ''} = parseArgs(process.argv.slice(2))

    const rc = jsonfile.readFileSync(rcFile || '.l10nrc')

    if (!cmd) {
        throw new Error(`no sub-command`)
    }

    const domainNames = domainOption ? domainOption.split(',') : Object.keys(rc.domains)
    for (const domainName of domainNames) {
        const domain = rc['domains'][domainName]
        const googleDocs = rc['google-docs']

        switch (domain.type) {
            case 'vue-gettext':
                await require('./vue-gettext')(cmd, domainName, domain, googleDocs)
                break
            default: {
                throw new Error(`unknown domain type '${domain.type}'`)
            }
        }
    }
}

function usage () {
    console.info(`\
Usage: l10n [-f RCFILE] [-d DOMAIN] update
       l10n [-f RCFILE] [-d DOMAIN] upload
       l10n [-f RCFILE] [-d DOMAIN] sync
       
    -f RCFILE: 설정 파일 지정, 없으면 '.l10nrc'
    -d DOMAIN: 적용할 도메인 지정, 없으면 설정 파일에 있는 모든 도메인 (콤마로 여러 도메인 나열 가능)

Sub-command

    update: 로컬 번역 업데이트
    upload: 로컬 소스 변경사항을 Google Docs 에 업로드 (로컬 번역 파일은 건드리지 않음)
    sync: 로컬 소스와 Google Docs 간 싱크, 주의: 처음 동기화시 시트의 모든 열을 지워놓는것이 좋음
    
RC File 항목

 [도메인]
    domains.[domain]: 번역 파일을 생성하는 단위
    domains.[domain].type: 도메인의 번역을 다루는 종류, 지원: vue-gettext
    domains.[domain].tag: 구글 시트 동기화시 tag 항목으로 들어갈 값
    domains.[domain].locales: 번역할 로케일 목록
    domains.[domain].i18n-dir: pot 파일과 po 파일을 저장할 위치
    
 [vue-gettext 항목]
    domains.[domain].src-dirs: (vue-gettext) 번역을 추출할 .vue, .js 파일이 있는 소스 위치 목록
    domains.[domain].target-path: (vue-gettext) 번역 결과를 저장할 위치
  
 [구글 문서 동기화]
    google-docs.doc-name: 동기화에 사용할 구글 문서 이름
    google-docs.sheet-name: 동기화에 사용할 구글 문서 내 시트 이름
    google-docs.client-secret-path: 구글 문서 동기화 API 호출시 사용할 secret 파일 위치
`)
}

run().catch(err => {
    usage()
    if (err) {
        console.error(err)
    }
    process.exit(1)
})
