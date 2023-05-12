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
            const extractor = PotExtractor.create('testDomain', {
                markers: [{start: '{{', end: '}}'}],
                keywords: ['$t']
            })
            extractor.extractVue('test-file', module)
            expect(extractor.po.translations).toHaveProperty(['', 'Apple & Banana', 'comments', 'reference'])
            expect(extractor.po.translations['']['Apple & Banana']?.comments?.reference).toEqual('test-file:4')
            expect(extractor.po.translations).toHaveProperty(['', 'Hello', 'comments', 'reference'])
            expect(extractor.po.translations['']['Hello']?.comments?.reference).toEqual('test-file:5')
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

    describe('android strings.xml', () => {
        it('extract with reference', () => {
            const srcXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="normal_key">LIKEY</string>
    <string name="html_key_1" format="html">No Account? <font color="#FF424D">SignUp</font></string>
    <string name="html_key_2" format="html">Agreed to <u>Terms</u> and <u>PP</u></string>
    <string name="cdata_key_1"><![CDATA[관심사 & 해시태그]]></string>
    <string name="html_key_3" format="html"><b>관심사!</b>\\n설정!\\n아래!</string>
    <string name="no_trans_key" translatable="false">(+%1$s)</string>
    <string name="cdata_key_2"><![CDATA[<b>%1$s</b> Present.]]></string>
    <plurals name="plural_key">
        <item quantity="one">%d day</item>
        <item quantity="other">%d days</item>
    </plurals>
</resources>`
            const extractor = PotExtractor.create('testDomain', {})
            extractor.extractAndroidStringsXml('test-file', srcXml)
            expect(extractor.po.translations).toHaveProperty(['normal_key', 'LIKEY', 'comments', 'reference'])
            expect(extractor.po.translations['normal_key']['LIKEY'].comments?.reference).toEqual('test-file:3')
            expect(extractor.po.translations).toHaveProperty(['html_key_1', 'No Account? <font color="#FF424D">SignUp</font>', 'comments', 'reference'])
            expect(extractor.po.translations['html_key_1']['No Account? <font color="#FF424D">SignUp</font>'].comments?.reference).toEqual('test-file:4')
            expect(extractor.po.translations).toHaveProperty(['html_key_2', 'Agreed to <u>Terms</u> and <u>PP</u>', 'comments', 'reference'])
            expect(extractor.po.translations['html_key_2']['Agreed to <u>Terms</u> and <u>PP</u>'].comments?.reference).toEqual('test-file:5')
            expect(extractor.po.translations).toHaveProperty(['cdata_key_1', '관심사 & 해시태그', 'comments', 'reference'])
            expect(extractor.po.translations['cdata_key_1']['관심사 & 해시태그'].comments?.reference).toEqual('test-file:6')
            expect(extractor.po.translations).toHaveProperty(['html_key_3', '<b>관심사!</b>\\n설정!\\n아래!', 'comments', 'reference'])
            expect(extractor.po.translations['html_key_3']['<b>관심사!</b>\\n설정!\\n아래!'].comments?.reference).toEqual('test-file:7')
            expect(extractor.po.translations).toHaveProperty(['cdata_key_2', '<b>%1$s</b> Present.', 'comments', 'reference'])
            expect(extractor.po.translations['cdata_key_2']['<b>%1$s</b> Present.'].comments?.reference).toEqual('test-file:9')
        })
    })
})
