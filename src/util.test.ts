import {describe, it} from 'node:test'
import {faker} from '@faker-js/faker'
import {expect} from 'expect'
import {isPureKey} from './utils.js'

describe('Util', () => {
  describe('isPureKey', () => {
    it('returns false for empty prefixes', () => {
      const key = faker.lorem.words()
      expect(isPureKey(key, [])).toBe(false)
    })

    it('returns by prefix matching', () => {
      const matchedKey = '$' + faker.string.sample()
      const unmatchedKey = faker.string.sample()
      const prefix = '$'
      expect(isPureKey(matchedKey, [prefix])).toBe(true)
      expect(isPureKey(unmatchedKey, [prefix])).toBe(false)
    })
  })
})
