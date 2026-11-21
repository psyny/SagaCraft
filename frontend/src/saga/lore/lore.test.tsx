import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { DocumentPage, Resource, ResourceFolder } from '../../api/types'
import { DocumentReader, pagesKey } from './DocumentPage'
import Folders, { DRAG_TYPE, groupByFolder, inFolder, parseFolderPick } from './Folders'
import { filterResources } from './ResourceList'

const item = (id: number, name: string, type: string, tags: string[] = []): Resource =>
  ({ id, kind: 'item', type, name, attributes: {}, editable: [], category_id: null, tags } as unknown as Resource)

describe('item and document lists', () => {
  it('filter by name, category and every tag', () => {
    const list = [item(1, 'Longsword', 'weapon', ['magic']), item(2, 'Rope', 'gear'), item(3, 'Long bow', 'weapon')]
    expect(filterResources(list, 'long', null, []).map((r) => r.id)).toEqual([1, 3])
    expect(filterResources(list, '', 'gear', []).map((r) => r.id)).toEqual([2])
    expect(filterResources(list, '', null, ['MAGIC']).map((r) => r.id)).toEqual([1])
  })
})

describe('documents', () => {
  const pages: DocumentPage[] = [
    { id: 'a', kind: 'text', title: 'Page one', text: 'My dear cousin' },
    { id: 'b', kind: 'image', title: 'The seal', image: { file_id: 1, url: '/f/1', face: { x: 0.5, y: 0.5, size: 1 } } },
  ]
  function Reader() {
    const [index, setIndex] = useState(0)
    return <DocumentReader pages={pages} index={index} onIndex={setIndex} />
  }
  it('finds the pages variable by its type', () => {
    expect(pagesKey([{ key: 'name', type: 'text' }, { key: 'sheets', type: 'pages' }])).toBe('sheets')
  })
  it('reads page by page (buttons and arrow keys)', () => {
    render(<Reader />)
    expect(screen.getByText('My dear cousin')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('img', { name: 'The seal' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('Page one')).toBeInTheDocument()
  })
})

describe('document folders', () => {
  const doc = (id: number, folder_id: number | null) => ({ ...item(id, `Doc ${id}`, 'document'), kind: 'document', folder_id }) as Resource
  const folders: ResourceFolder[] = [{ id: 7, kind: 'document', name: 'Letters', count: 1 }, { id: 9, kind: 'document', name: 'Maps', count: 0 }]
  const list = [doc(1, 7), doc(2, null), doc(3, 42)]

  it('picks all, one folder, or none from the address', () => {
    expect([parseFolderPick(null), parseFolderPick('none'), parseFolderPick('7'), parseFolderPick('x')]).toEqual(['all', 'none', 7, 'all'])
    expect(list.filter((r) => inFolder(r, 7)).map((r) => r.id)).toEqual([1])
    expect(list.filter((r) => inFolder(r, 'none')).map((r) => r.id)).toEqual([2])
  })
  it('groups all documents by folder, empty folders left out, unknown folders with the unfiled', () => {
    expect(groupByFolder(list, folders).map((g) => [g.folder?.name ?? null, g.list.map((r) => r.id)])).toEqual([['Letters', [1]], [null, [2, 3]]])
  })
  it('files dropped documents in a folder', () => {
    const onFile = vi.fn()
    const onPick = vi.fn()
    render(<Folders folders={folders} total={3} unfiled={1} pick="all" onPick={onPick} isAdmin onCreate={async () => true}
      onRename={() => undefined} onDelete={() => undefined} onFile={onFile} />)
    fireEvent.click(screen.getByRole('button', { name: /^Maps/ }))
    expect(onPick).toHaveBeenCalledWith(9)
    const data = { types: [DRAG_TYPE], getData: () => JSON.stringify([2]), dropEffect: '' }
    const row = screen.getByRole('button', { name: /^Letters/ }).parentElement!
    fireEvent.dragOver(row, { dataTransfer: data })
    fireEvent.drop(row, { dataTransfer: data })
    expect(onFile).toHaveBeenCalledWith(7, [2])
    fireEvent.drop(screen.getByRole('button', { name: /Not in a folder/ }).parentElement!, { dataTransfer: data })
    expect(onFile).toHaveBeenLastCalledWith(null, [2])
  })
})
