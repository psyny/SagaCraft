import { pdfOf } from './download'

describe("the map's download (plan 52)", () => {
  it('writes a one-page PDF around a JPEG: its objects where the cross-reference says, the picture fitted on A4', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])
    const bytes = pdfOf(jpeg, 3000, 2000, 'Barovia (west)')
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4\n')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/MediaBox [0 0 842 595]') // landscape, like the picture
    expect(text).toContain('/Width 3000 /Height 2000')
    expect(text).toContain(String.raw`/Title (Barovia \(west\))`)
    // every object starts where the cross-reference table says
    const xref = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const entries = text.slice(xref).split('\n').slice(3, 9)
    entries.forEach((line, i) => {
      expect(line).toHaveLength(19) // 20 bytes with its newline
      expect(text.slice(Number(line.slice(0, 10)), Number(line.slice(0, 10)) + 7)).toBe(`${i + 1} 0 obj`)
    })
    // the picture's bytes, untouched, in its stream
    const at = text.indexOf('stream\n', text.indexOf('/DCTDecode')) + 7
    expect([...bytes.slice(at, at + jpeg.length)]).toEqual([...jpeg])
  })
})
