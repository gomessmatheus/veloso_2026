import { describe, it, expect } from 'vitest'
import { calcEngagement, postRepostCount } from './posts.js'

// ─── calcEngagement ───────────────────────────────────────
describe('calcEngagement', () => {
  it('returns null when reach is 0', () => {
    expect(calcEngagement({ reach: 0, likes: 100, comments: 10, shares: 5, saves: 20 })).toBeNull()
  })

  it('returns null when reach is missing', () => {
    expect(calcEngagement({ likes: 100, comments: 10 })).toBeNull()
  })

  it('calculates correctly with all interaction types', () => {
    const p = { reach: 1000, likes: 50, comments: 10, shares: 5, saves: 35 }
    // interactions = 100, rate = 100/1000*100 = 10%
    expect(calcEngagement(p)).toBeCloseTo(10)
  })

  it('returns 0% (not null) when reach is set but no interactions', () => {
    const p = { reach: 1000, likes: 0, comments: 0, shares: 0, saves: 0 }
    expect(calcEngagement(p)).toBe(0)
  })

  it('handles missing interaction fields gracefully (treat as 0)', () => {
    const p = { reach: 500, likes: 25 }
    // interactions = 25, rate = 25/500*100 = 5%
    expect(calcEngagement(p)).toBeCloseTo(5)
  })

  it('result is a number in [0, ∞) when valid', () => {
    const p = { reach: 100, likes: 200, comments: 0, shares: 0, saves: 0 }
    const result = calcEngagement(p)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

// ─── postRepostCount ──────────────────────────────────────
describe('postRepostCount', () => {
  it('returns 1 for repost type regardless of networks', () => {
    expect(postRepostCount({ type: 'repost', networks: ['Instagram', 'TikTok', 'YouTube'] })).toBe(1)
  })

  it('returns networks.length - 1 for regular posts', () => {
    expect(postRepostCount({ type: 'post', networks: ['Instagram', 'TikTok'] })).toBe(1)
    expect(postRepostCount({ type: 'post', networks: ['Instagram', 'TikTok', 'YouTube'] })).toBe(2)
  })

  it('returns 0 for a single-network post', () => {
    expect(postRepostCount({ type: 'post', networks: ['Instagram'] })).toBe(0)
  })

  it('returns 0 when networks is empty', () => {
    expect(postRepostCount({ type: 'post', networks: [] })).toBe(0)
  })

  it('returns 0 when networks is missing', () => {
    expect(postRepostCount({ type: 'post' })).toBe(0)
  })

  it('handles tiktok type like a regular post', () => {
    expect(postRepostCount({ type: 'tiktok', networks: ['TikTok', 'Instagram'] })).toBe(1)
  })
})
