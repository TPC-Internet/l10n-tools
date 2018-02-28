# l10n-tools
Localization tools

```text
  Usage: l10n-cli [options] [command]

  번역 추출, 동기화 툴


  Options:

    -V, --version            output the version number
    -r, --rcfile [rcfile]    설정 파일 지정, 기본값은 .l10nrc
    -d, --domains [domains]  적용할 도메인 지정, 없으면 설정 파일에 있는 모든 도메인 (콤마로 여러 도메인 나열 가능)
    -q, --quiet              조용히
    -h, --help               output usage information


  Commands:

    update                 로컬 번역 업데이트
    upload                 로컬 소스 변경사항을 Google Docs 에 업로드 (로컬 번역 파일은 건드리지 않음)
    sync                   로컬 소스와 Google Docs 간 싱크
    _extractPot [options]  [고급] 소스에서 번역 추출하여 pot 파일 작성
    _updatePo [options]    [고급] pot 파일에서 po 파일 업데이트
    _count [options]       [고급] 번역 항목 갯수 세기
    _cat [options]         [고급] 번역 항목 표시
    _apply                 [고급] PO 파일에서 번역 에셋 작성
    _sync                  [고급] PO 파일 Google Docs 싱크


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
      google-docs.client-secret-path           구글 문서 동기화 API 호출시 사용할 secret 파일 위치
```