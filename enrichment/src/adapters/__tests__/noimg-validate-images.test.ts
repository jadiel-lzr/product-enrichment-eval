import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOpenAICreate = vi.fn()

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: mockOpenAICreate } }
    constructor() {}
  }
  return { default: MockOpenAI }
})

import { validateImagesWithVision, type ImageValidationResult } from '../noimg-claude-adapter.js'

function mockVisionResponse(content: string) {
  mockOpenAICreate.mockResolvedValueOnce({
    choices: [{ message: { content } }],
  })
}

const PRODUCT = {
  brand: 'DOLCE & GABBANA',
  name: 'Printed Silk Tie',
  code: '3850073',
  color: 'White',
  category: 'Ties',
}

describe('validateImagesWithVision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty results for empty image list', async () => {
    const result = await validateImagesWithVision(PRODUCT, [])

    expect(result.validUrls).toEqual([])
    expect(result.flaggedUrls).toEqual([])
    expect(mockOpenAICreate).not.toHaveBeenCalled()
  })

  it('parses valid JSON response and separates valid/flagged images', async () => {
    const images = [
      'https://cdn.example.com/tie-front.jpg',
      'https://cdn.example.com/tie-back.jpg',
      'https://cdn.example.com/sneaker-promo.jpg',
      'https://cdn.example.com/tie-detail.jpg',
    ]

    mockVisionResponse(JSON.stringify({
      results: [
        { index: 1, valid: true },
        { index: 2, valid: true },
        { index: 3, valid: false, reason: 'Shows sneakers, not a tie' },
        { index: 4, valid: true },
      ],
    }))

    const result = await validateImagesWithVision(PRODUCT, images)

    expect(result.validUrls).toEqual([
      'https://cdn.example.com/tie-front.jpg',
      'https://cdn.example.com/tie-back.jpg',
      'https://cdn.example.com/tie-detail.jpg',
    ])
    expect(result.flaggedUrls).toEqual([
      { url: 'https://cdn.example.com/sneaker-promo.jpg', reason: 'Shows sneakers, not a tie' },
    ])
  })

  it('treats unmentioned images as valid', async () => {
    const images = [
      'https://cdn.example.com/img1.jpg',
      'https://cdn.example.com/img2.jpg',
      'https://cdn.example.com/img3.jpg',
    ]

    // Model only mentions image 2 (flagged), omits 1 and 3
    mockVisionResponse(JSON.stringify({
      results: [
        { index: 2, valid: false, reason: 'Brand logo' },
      ],
    }))

    const result = await validateImagesWithVision(PRODUCT, images)

    expect(result.validUrls).toEqual([
      'https://cdn.example.com/img1.jpg',
      'https://cdn.example.com/img3.jpg',
    ])
    expect(result.flaggedUrls).toHaveLength(1)
    expect(result.flaggedUrls[0].url).toBe('https://cdn.example.com/img2.jpg')
  })

  it('treats all images as valid when response is unparseable', async () => {
    const images = ['https://cdn.example.com/img1.jpg']

    mockVisionResponse('Sorry, I cannot analyze these images.')

    const result = await validateImagesWithVision(PRODUCT, images)

    expect(result.validUrls).toEqual(['https://cdn.example.com/img1.jpg'])
    expect(result.flaggedUrls).toEqual([])
  })

  it('treats all images as valid when API call throws', async () => {
    const images = ['https://cdn.example.com/img1.jpg']

    mockOpenAICreate.mockRejectedValueOnce(new Error('Rate limited'))

    const result = await validateImagesWithVision(PRODUCT, images)

    expect(result.validUrls).toEqual(['https://cdn.example.com/img1.jpg'])
    expect(result.flaggedUrls).toEqual([])
  })

  it('ignores out-of-range indices in response', async () => {
    const images = ['https://cdn.example.com/img1.jpg']

    mockVisionResponse(JSON.stringify({
      results: [
        { index: 1, valid: true },
        { index: 99, valid: false, reason: 'phantom' },
      ],
    }))

    const result = await validateImagesWithVision(PRODUCT, images)

    expect(result.validUrls).toEqual(['https://cdn.example.com/img1.jpg'])
    expect(result.flaggedUrls).toEqual([])
  })

  it('provides default reason when model omits it', async () => {
    const images = ['https://cdn.example.com/logo.png']

    mockVisionResponse(JSON.stringify({
      results: [{ index: 1, valid: false }],
    }))

    const result = await validateImagesWithVision(PRODUCT, images)

    expect(result.flaggedUrls[0].reason).toBe('Flagged as unrelated')
  })

  it('sends image URLs as vision content parts', async () => {
    const images = [
      'https://cdn.example.com/img1.jpg',
      'https://cdn.example.com/img2.jpg',
    ]

    mockVisionResponse(JSON.stringify({
      results: [
        { index: 1, valid: true },
        { index: 2, valid: true },
      ],
    }))

    await validateImagesWithVision(PRODUCT, images)

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    const content = callArgs.messages[0].content

    // Should have 2 image_url parts + 1 text part
    expect(content).toHaveLength(3)
    expect(content[0].type).toBe('image_url')
    expect(content[0].image_url.url).toBe('https://cdn.example.com/img1.jpg')
    expect(content[1].type).toBe('image_url')
    expect(content[2].type).toBe('text')
    expect(content[2].text).toContain('DOLCE & GABBANA')
    expect(content[2].text).toContain('3850073')
  })
})
