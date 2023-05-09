import {PotExtractor} from './pot-extractor.js'

describe('PotExtractor', () => {
    describe('vue-i18n keywords', () => {
        const keywords = ['$t', 'vm.$t', 'this.$t', 'app.i18n.t', '$tc', 'vm.$tc', 'this.$tc', 'app.i18n.tc']
        it.each([...keywords])('extract %s', (keyword) => {
            const extractor = PotExtractor.create('testDomain', {keywords: [keyword]})
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
                    expect(extractor.po.translations).toHaveProperty(['', 'key-js'])
                } else if (key === 'ts') {
                    extractor.extractTsModule('test-file', module)
                    expect(extractor.po.translations).toHaveProperty(['', 'key-ts'])
                }
            }
            extractor.extractJsExpression('test-file', `${keyword}('key-jse')`)
            expect(extractor.po.translations).toHaveProperty(['', 'key-jse'])
        })
    })

    describe('vue-i18n i18n tag', () => {
        it('path and :path', () => {
            const module = `
                <template>
                    <div>
                        <i18n tag="span" path="key-vue-i18n-path"></i18n>
                        <i18n tag="span" :path="'key-vue-i18n-path-exp'"></i18n>
                    </div>
                </template>
            `
            const extractor = PotExtractor.create('testDomain', {tagNames: ['i18n']})
            extractor.extractVue('test-file', module)
            expect(extractor.po.translations).toHaveProperty(['', 'key-vue-i18n-path', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-vue-i18n-path']?.comments?.reference).toEqual('test-file:4')
            expect(extractor.po.translations).toHaveProperty(['', 'key-vue-i18n-path-exp', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-vue-i18n-path-exp']?.comments?.reference).toEqual('test-file:5')
        })

        it('v-t attrs', () => {
            const module = `
                <template>
                    <div v-t="'key-v-t'"></div>
                    <div v-t="{path: 'key-v-t-path'}"></div>
                </template>
            `
            const extractor = PotExtractor.create('testDomain', {objectAttrs: {'v-t': ['', 'path']}})
            extractor.extractVue('test-file', module)
            expect(extractor.po.translations).toHaveProperty(['', 'key-v-t', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-v-t']?.comments?.reference).toEqual('test-file:3')
            expect(extractor.po.translations).toHaveProperty(['', 'key-v-t-path', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-v-t-path']?.comments?.reference).toEqual('test-file:4')
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
            const extractor = PotExtractor.create('testDomain', {keywords: ['this.$t']})
            extractor.extractVue('test-file', module)
            expect(extractor.po.translations).toHaveProperty(['', 'key-js', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-js']?.comments?.reference).toEqual('test-file:6')
            expect(extractor.po.translations).toHaveProperty(['', 'key-ts', 'comments', 'reference'])
            expect(extractor.po.translations['']['key-ts']?.comments?.reference).toEqual('test-file:13')
        })
    })

    describe('jsx file', () => {
        it('extract with reference', () => {
            const module = `
                function translate(key, options) {}
                const car = "MG Hector";
    
                const specifications = {
                    length : 4655,
                    width : 1835,
                    height : 1760
                }
    
                const getDimensions = specifications => (
                    translate('{length}(mm) {width}(mm) {height}(mm)', specifications)
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
            const extractor = PotExtractor.create('testDomain', {keywords: ['translate']})
            extractor.extractReactJsModule('test-file', module)
            const key = '{length}(mm) {width}(mm) {height}(mm)'
            expect(extractor.po.translations).toHaveProperty(['', key, 'comments', 'reference'])
            expect(extractor.po.translations[''][key]?.comments?.reference).toEqual('test-file:12')
        })
    })

    describe('angular-gettext files', () => {
        it('translate attr', () => {
            const module = `
                <input placeholder="{{'angular-translate-key' | translate}}">
            `
            const extractor = PotExtractor.create('testDomain', {
                tagNames: ['translate'],
                attrNames: ['translate'],
                filterNames: ['translate'],
                markers: [{start: '{{', end: '}}', type: 'angular'}]
            })
            extractor.extractTemplate('test-file', module)
            expect(extractor.po.translations).toHaveProperty(['', 'angular-translate-key', 'comments', 'reference'])
            expect(extractor.po.translations['']['angular-translate-key']?.comments?.reference).toEqual('test-file:2')
        })
    })
})
