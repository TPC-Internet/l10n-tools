import {KeyExtractor} from './key-extractor.js'

describe('KeyExtractor', () => {
    describe('vue-i18n keywords', () => {
        const keywords = ['$t', 'vm.$t', 'this.$t', 'app.i18n.t', '$tc', 'vm.$tc', 'this.$tc', 'app.i18n.tc']
        it.each([...keywords])('extract %s', (keyword) => {
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
                    expect(extractor.keys.find(null, 'key-js')).toBeDefined()
                } else if (key === 'ts') {
                    extractor.extractTsModule('test-file', module)
                    expect(extractor.keys.find(null, 'key-ts')).toBeDefined()
                }
            }
            extractor.extractJsExpression('test-file', `${keyword}('key-jse')`)
            expect(extractor.keys.find(null, 'key-jse')).toBeDefined()
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
            {
                const keyEntry = extractor.keys.find(null, 'Apple & Banana')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '4'})
            }
            {
                const keyEntry = extractor.keys.find(null, 'Hello')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '5'})
            }
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
            const extractor = new KeyExtractor({tagNames: ['i18n']})
            extractor.extractVue('test-file', module)
            {
                const keyEntry = extractor.keys.find(null, 'key-vue-i18n-path')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '4'})
            }
            {
                const keyEntry = extractor.keys.find(null, 'key-vue-i18n-path-exp')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '5'})
            }
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
            {
                const keyEntry = extractor.keys.find(null, 'key-v-t')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '3'})
            }
            {
                const keyEntry = extractor.keys.find(null, 'key-v-t-path')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '4'})
            }
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
            {
                const keyEntry = extractor.keys.find(null, 'key-js')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '6'})
            }
            {
                const keyEntry = extractor.keys.find(null, 'key-ts')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '13'})
            }
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
            const extractor = new KeyExtractor({keywords: ['translate']})
            extractor.extractReactJsModule('test-file', module)
            const key = '{length}(mm) {width}(mm) {height}(mm)'
            {
                const keyEntry = extractor.keys.find(null, key)
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '12'})
            }
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
    <string name="escaped_key">&lt;font color="#FF424D"&gt;RENEW&lt;/font&gt;</string>
    <plurals name="plural_key">
        <item quantity="one">%d day</item>
        <item quantity="other">%d days</item>
    </plurals>
</resources>`
            const extractor = new KeyExtractor({})
            extractor.extractAndroidStringsXml('test-file', srcXml)
            {
                const keyEntry = extractor.keys.find('normal_key', 'LIKEY')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '3'})
            }
            {
                const keyEntry = extractor.keys.find('html_key_1', 'No Account? <font color="#FF424D">SignUp</font>')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '4'})
            }
            {
                const keyEntry = extractor.keys.find('html_key_2', 'Agreed to <u>Terms</u> and <u>PP</u>')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '5'})
            }
            {
                const keyEntry = extractor.keys.find('cdata_key_1', '관심사 & 해시태그')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '6'})
            }
            {
                const keyEntry = extractor.keys.find('html_key_3', '<b>관심사!</b>\\n설정!\\n아래!')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '7'})
            }
            {
                const keyEntry = extractor.keys.find('cdata_key_2', '<b>%1$s</b> Present.')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '9'})
            }
            {
                const keyEntry = extractor.keys.find('escaped_key', '<font color="#FF424D">RENEW</font>')
                expect(keyEntry).not.toBeNull()
                expect(keyEntry!.references).toContainEqual({file: 'test-file', loc: '10'})
            }
        })
    })
})
