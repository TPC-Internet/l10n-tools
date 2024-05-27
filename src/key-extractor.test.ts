import {describe, it} from 'node:test'
import {KeyExtractor} from './key-extractor.js'
import {expectKeyEntry} from "./test/utils.js";

describe('KeyExtractor', () => {
    describe('vue-i18n keywords', () => {
        it('extract', () => {
            const keywords = ['$t', 'vm.$t', 'this.$t', 'app.i18n.t', '$tc', 'vm.$tc', 'this.$tc', 'app.i18n.tc']
            for (const keyword of keywords) {
                const extractor = new KeyExtractor({keywords: [keyword]})
                for (const key of ['js', 'ts']) {
                    const module = `
                    let $t = () => {};
                    let $tc = () => {};
                    let vm = {$t: () => {}, $tc: () => {}};
                    let app = {i18n: {$t: () => {}, $tc: () => {}}};
                    app.prototype.$t = function() {}
                    app.prototype.$tc = function() {}
                    app.prototype.test = function() {
                       ${keyword}('key-${key}');
                    }
                    `
                    if (key === 'js') {
                        extractor.extractJsModule('test-file', module)
                        expectKeyEntry(extractor.keys, null, 'key-js', false)
                    } else if (key === 'ts') {
                        extractor.extractTsModule('test-file', module)
                        expectKeyEntry(extractor.keys, null, 'key-ts', false)
                    }
                }
                extractor.extractJsExpression('test-file', `${keyword}('key-jse')`)
                expectKeyEntry(extractor.keys, null, 'key-jse', false)
            }
        })
    })

    describe('vue-i18n keywords in vue file', () => {
        it('extract $t in vue', () => {
            const module = `
                <template>
                    <div>
                        <span>{{ $t('Apple & Banana') }}</span>
                        <span>{{ $t('Hello') }}</span>
                    </div>
                </template>
            `
            const extractor = new KeyExtractor({
                markers: [{start: '{{', end: '}}'}],
                keywords: ['$t']
            })
            extractor.extractVue('test-file', module)
            expectKeyEntry(extractor.keys, null, 'Apple & Banana', false, 'test-file', '4')
            expectKeyEntry(extractor.keys, null, 'Hello', false, 'test-file', '5')
        })

        it('extract $t in vue (plural)', () => {
            const module = `
                <template>
                    <div>
                        <span>{{ $t('Apple & Banana', 1) }}</span>
                        <span>{{ $t('Hello', 2) }}</span>
                    </div>
                </template>
            `
            const extractor = new KeyExtractor({
                markers: [{start: '{{', end: '}}'}],
                keywords: ['$t']
            })
            extractor.extractVue('test-file', module)
            expectKeyEntry(extractor.keys, null, 'Apple & Banana', true, 'test-file', '4')
            expectKeyEntry(extractor.keys, null, 'Hello', true, 'test-file', '5')
        })
    })

    describe('vue-i18n i18n, i18n-t tag', () => {
        it('i18n tag path and :path', () => {
            const module = `
                <template>
                    <div>
                        <i18n tag="span" path="key-vue-i18n-path"></i18n>
                        <i18n tag="span" :path="'key-vue-i18n-path-exp'"></i18n>
                        <i18n-t keypath="{name}은{br}더 이상{br}실재하지 않습니다.">
                            <template #name><img src="https://test.com/a.jpg"></template>
                            <template #br><br></template>
                        </i18n-t>
                        <i18n-t keypath="사과 {count}개" :plural="count">
                            <template #count><b>{{ count }}</b></template>
                        </i18n-t>
                    </div>
                </template>
            `
            const extractor = new KeyExtractor({tagNames: ['i18n', 'i18n-t']})
            extractor.extractVue('test-file', module)
            expectKeyEntry(extractor.keys, null, 'key-vue-i18n-path', false, 'test-file', '4')
            expectKeyEntry(extractor.keys, null, 'key-vue-i18n-path-exp', false, 'test-file', '5')
        })

        it('i18n-t tag keypath and :keypath', () => {
            const module = `
                <template>
                    <div>
                        <i18n-t keypath="{name}은{br}더 이상{br}실재하지 않습니다.">
                            <template #name><img src="https://test.com/a.jpg"></template>
                            <template #br><br></template>
                        </i18n-t>
                        <i18n-t :keypath="'사과 {count}개'" :plural="count">
                            <template #count><b>{{ count }}</b></template>
                        </i18n-t>
                    </div>
                </template>
            `
            const extractor = new KeyExtractor({tagNames: ['i18n', 'i18n-t']})
            extractor.extractVue('test-file', module)
            expectKeyEntry(extractor.keys, null, '{name}은{br}더 이상{br}실재하지 않습니다.', false, 'test-file', '4')
            expectKeyEntry(extractor.keys, null, '사과 {count}개', true, 'test-file', '8')
        })

        it('v-t attrs', () => {
            const module = `
                <template>
                    <div v-t="'key-v-t'"></div>
                    <div v-t="{path: 'key-v-t-path'}"></div>
                </template>
            `
            const extractor = new KeyExtractor({objectAttrs: {'v-t': ['', 'path']}})
            extractor.extractVue('test-file', module)
            expectKeyEntry(extractor.keys, null, 'key-v-t', false, 'test-file', '3')
            expectKeyEntry(extractor.keys, null, 'key-v-t-path', false, 'test-file', '4')
        })
    })

    describe('script in vue file', () => {
        it('extract with reference', () => {
            const module = `
                <template><div></div></template>
                <script>
                class Component {
                    mounted() {
                        this.$t('key-js')
                    }
                }
                </script>
                <script lang="ts">
                class Component {
                    mounted() {
                        this.$t('key-ts')
                    }
                }
                </script>
            `
            const extractor = new KeyExtractor({keywords: ['this.$t']})
            extractor.extractVue('test-file', module)
            expectKeyEntry(extractor.keys, null, 'key-js', false, 'test-file', '6')
            expectKeyEntry(extractor.keys, null, 'key-ts', false, 'test-file', '13')
        })
    })

    describe('jsx file', () => {
        it('extract with reference', () => {
            const module = `
                function translate(key, options) {}
                const car = "MG Hector";
    
                const getDimensions = () => (
                    translate('{length}(mm) {width}(mm) {height}(mm)', {
                        length : 4655,
                        width : 1835,
                        height : 1760
                    })
                )
    
                export default function Vehicles() {
                    return(
                        <div>
                            <p>{car}</p>
                            <p>{getDimensions(specifications)}</p>
                        </div>
                    );
                }
            `
            const extractor = new KeyExtractor({keywords: ['translate']})
            extractor.extractReactJsModule('test-file', module)
            const key = '{length}(mm) {width}(mm) {height}(mm)'
            expectKeyEntry(extractor.keys, null, key, false, 'test-file', '6')
        })
    })
})
