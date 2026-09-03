'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const EMPTY_ITEM = {
  name: '',
  description: '',
  price: '',
  category: '',
  available: true,
  image_url: '',
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('menu')
  const [items, setItems] = useState([])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)

  const [newItem, setNewItem] = useState(EMPTY_ITEM)
  const [uploadingNew, setUploadingNew] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editItem, setEditItem] = useState(EMPTY_ITEM)
  const [uploadingEditId, setUploadingEditId] = useState(null)

  async function fetchAll() {
        const { data: itemData } = await supabase
      .from('menu_items')
      .select('*')
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })
    const { data: tableData } = await supabase
      .from('restaurant_tables')
      .select('*')
      .order('table_number', { ascending: true })

    if (itemData) setItems(itemData)
    if (tableData) setTables(tableData)
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  async function logout() {
    document.cookie = 'admin_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC'
    window.location.href = '/admin/login'
  }

  // ---------- Image upload helper ----------
  async function uploadImage(file) {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

    const { error } = await supabase.storage.from('menu-images').upload(fileName, file)
    if (error) {
      alert('Image upload failed: ' + error.message)
      return null
    }

    const { data } = supabase.storage.from('menu-images').getPublicUrl(fileName)
    return data.publicUrl
  }

  // ---------- Add new item ----------
  async function handleNewImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingNew(true)
    const url = await uploadImage(file)
    if (url) setNewItem((prev) => ({ ...prev, image_url: url }))
    setUploadingNew(false)
  }

  async function addItem() {
    if (!newItem.name || !newItem.price || !newItem.category) {
      alert('Name, price, and category are required.')
      return
    }

    const { error } = await supabase.from('menu_items').insert({
      name: newItem.name,
      description: newItem.description,
      price: Number(newItem.price),
      category: newItem.category,
      available: newItem.available,
      image_url: newItem.image_url || null,
    })

    if (error) {
      alert('Error adding item: ' + error.message)
      return
    }

    setNewItem(EMPTY_ITEM)
    fetchAll()
  }

  // ---------- Edit existing item ----------
  function startEdit(item) {
    setEditingId(item.id)
    setEditItem({
      name: item.name,
      description: item.description || '',
      price: item.price,
      category: item.category,
      available: item.available,
      image_url: item.image_url || '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditItem(EMPTY_ITEM)
  }

  async function handleEditImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingEditId(editingId)
    const url = await uploadImage(file)
    if (url) setEditItem((prev) => ({ ...prev, image_url: url }))
    setUploadingEditId(null)
  }

  async function saveEdit(id) {
    const { error } = await supabase
      .from('menu_items')
      .update({
        name: editItem.name,
        description: editItem.description,
        price: Number(editItem.price),
        category: editItem.category,
        available: editItem.available,
        image_url: editItem.image_url || null,
      })
      .eq('id', id)

    if (error) {
      alert('Error saving: ' + error.message)
      return
    }

    setEditingId(null)
    fetchAll()
  }

  async function deleteItem(id) {
    if (!confirm('Delete this menu item permanently?')) return
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (error) {
      alert('Error deleting: ' + error.message)
      return
    }
    fetchAll()
  }

    async function moveItem(item, direction) {
    const categoryItems = items
      .filter((i) => i.category === item.category)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    const index = categoryItems.findIndex((i) => i.id === item.id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1

    if (swapIndex < 0 || swapIndex >= categoryItems.length) return

    const other = categoryItems[swapIndex]
    const itemOrder = item.sort_order || 0
    const otherOrder = other.sort_order || 0

    await supabase.from('menu_items').update({ sort_order: otherOrder }).eq('id', item.id)
    await supabase.from('menu_items').update({ sort_order: itemOrder }).eq('id', other.id)

    fetchAll()
  }

  // ---------- Tables ----------
  async function addTable() {
    const nextNumber =
      tables.length > 0 ? Math.max(...tables.map((t) => t.table_number)) + 1 : 1

    const { error } = await supabase
      .from('restaurant_tables')
      .insert({ table_number: nextNumber, status: 'available' })

    if (error) {
      alert('Error adding table: ' + error.message)
      return
    }
    fetchAll()
  }

  async function deleteTable(id) {
    if (!confirm('Delete this table? This cannot be undone.')) return
    const { error } = await supabase.from('restaurant_tables').delete().eq('id', id)
    if (error) {
      alert('Error deleting table (it may have existing orders linked to it).')
      return
    }
    fetchAll()
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F3E9D8]">
        <p className="font-[family-name:var(--font-body)] text-[#241A14]">Loading admin panel…</p>
      </div>
    )
  }

  const categories = [...new Set(items.map((i) => i.category))]

  return (
    <div className="min-h-screen bg-[#F3E9D8] pb-20 font-[family-name:var(--font-body)]">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#241A14] px-6 py-5">
        <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[#F3E9D8]">
          Admin Panel
        </h1>
        <button
          onClick={logout}
          className="rounded-full border border-[#F3E9D8]/30 px-4 py-1.5 text-xs font-medium text-[#F3E9D8] transition hover:bg-[#F3E9D8]/10"
        >
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-[#241A14]/10 bg-[#F3E9D8] px-6 py-3">
        <button
          onClick={() => setActiveTab('menu')}
          className={`text-sm font-medium ${activeTab === 'menu' ? 'border-b-2 border-[#A6341D] pb-1 text-[#241A14]' : 'text-[#241A14]/50'}`}
        >
          Menu Items
        </button>
        <button
          onClick={() => setActiveTab('tables')}
          className={`text-sm font-medium ${activeTab === 'tables' ? 'border-b-2 border-[#A6341D] pb-1 text-[#241A14]' : 'text-[#241A14]/50'}`}
        >
          Tables
        </button>
      </div>

      {activeTab === 'menu' && (
        <div className="p-6">
          {/* Add new item form */}
          <div className="mb-8 rounded-2xl border border-[#241A14]/10 bg-white p-5">
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-lg italic text-[#241A14]">
              Add New Item
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                placeholder="Name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="rounded-lg border border-[#241A14]/20 px-3 py-2 text-sm"
              />
              <input
                placeholder="Category (e.g. Karahi)"
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                className="rounded-lg border border-[#241A14]/20 px-3 py-2 text-sm"
              />
              <input
                placeholder="Price"
                type="number"
                value={newItem.price}
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                className="rounded-lg border border-[#241A14]/20 px-3 py-2 text-sm"
              />
              <input
                placeholder="Description"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                className="rounded-lg border border-[#241A14]/20 px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-dashed border-[#241A14]/30 px-3 py-2 text-xs text-[#241A14]/60">
                {uploadingNew ? 'Uploading…' : newItem.image_url ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/*" onChange={handleNewImageUpload} className="hidden" />
              </label>
              {newItem.image_url && (
                <img src={newItem.image_url} alt="preview" className="h-12 w-12 rounded-lg object-cover" />
              )}
            </div>

            <button
              onClick={addItem}
              className="mt-4 rounded-full bg-[#241A14] px-5 py-2.5 text-sm font-semibold text-[#F3E9D8] transition active:scale-95"
            >
              Add Item
            </button>
          </div>

          {/* Existing items, grouped by category */}
          {categories.map((category) => (
            <div key={category} className="mb-8">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#241A14]/50">
                {category}
              </h3>
              <div className="space-y-3">
                {items
                  .filter((item) => item.category === category)
                  .map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[#241A14]/10 bg-white p-4">
                      {editingId === item.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <input
                              value={editItem.name}
                              onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
                              className="rounded-lg border border-[#241A14]/20 px-3 py-2 text-sm"
                            />
                            <input
                              value={editItem.category}
                              onChange={(e) => setEditItem({ ...editItem, category: e.target.value })}
                              className="rounded-lg border border-[#241A14]/20 px-3 py-2 text-sm"
                            />
                            <input
                              type="number"
                              value={editItem.price}
                              onChange={(e) => setEditItem({ ...editItem, price: e.target.value })}
                              className="rounded-lg border border-[#241A14]/20 px-3 py-2 text-sm"
                            />
                            <input
                              value={editItem.description}
                              onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                              className="rounded-lg border border-[#241A14]/20 px-3 py-2 text-sm"
                            />
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="cursor-pointer rounded-lg border border-dashed border-[#241A14]/30 px-3 py-2 text-xs text-[#241A14]/60">
                              {uploadingEditId === editingId ? 'Uploading…' : 'Change photo'}
                              <input type="file" accept="image/*" onChange={handleEditImageUpload} className="hidden" />
                            </label>
                            {editItem.image_url && (
                              <img src={editItem.image_url} alt="preview" className="h-12 w-12 rounded-lg object-cover" />
                            )}
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(item.id)}
                              className="rounded-full bg-[#241A14] px-4 py-2 text-xs font-semibold text-[#F3E9D8]"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded-full border border-[#241A14]/20 px-4 py-2 text-xs text-[#241A14]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-[#241A14]/5">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-[#241A14]/30">
                                No photo
                              </div>
                            )}
                          </div>

                          <div className="flex-1">
                            <p className="text-sm font-semibold text-[#241A14]">{item.name}</p>
                            <p className="text-xs text-[#241A14]/50">{item.description}</p>
                            <p className="text-sm font-semibold text-[#A6341D]">Rs. {item.price}</p>
                          </div>

                          <button
                            onClick={() => toggleAvailable(item)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                              item.available
                                ? 'bg-[#55684A]/15 text-[#3E4D36]'
                                : 'bg-[#241A14]/10 text-[#241A14]/50'
                            }`}
                          >
                            {item.available ? 'Available' : 'Hidden'}
                          </button>
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => moveItem(item, 'up')}
                              className="rounded border border-[#241A14]/20 px-2 text-xs text-[#241A14]"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveItem(item, 'down')}
                              className="rounded border border-[#241A14]/20 px-2 text-xs text-[#241A14]"
                            >
                              ↓
                            </button>
                          </div>
                          <button
                            onClick={() => startEdit(item)}
                            className="rounded-full border border-[#241A14]/20 px-3 py-1.5 text-xs text-[#241A14]"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => deleteItem(item.id)}
                            className="rounded-full border border-[#A6341D]/30 px-3 py-1.5 text-xs text-[#A6341D]"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'tables' && (
        <div className="p-6">
          <div className="mb-5 flex gap-3">
            <button
              onClick={addTable}
              className="rounded-full bg-[#241A14] px-5 py-2.5 text-sm font-semibold text-[#F3E9D8]"
            >
              + Add Table
            </button>
            <button
              onClick={() => window.open('/admin/qr-print?table=all', '_blank')}
              className="rounded-full border border-[#241A14]/30 px-5 py-2.5 text-sm font-semibold text-[#241A14]"
            >
              Print All QR Codes
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tables.map((table) => (
              <div
                key={table.id}
                className="rounded-2xl border border-[#241A14]/10 bg-white p-4 text-center"
              >
                <p className="font-[family-name:var(--font-display)] text-2xl italic text-[#241A14]">
                  {table.table_number}
                </p>
                <p className="mt-1 text-xs text-[#241A14]/50">{table.status}</p>
                <div className="mt-2 flex justify-center gap-3">
                  <button
                    onClick={() => window.open(`/admin/qr-print?table=${table.table_number}`, '_blank')}
                    className="text-xs text-[#241A14] underline"
                  >
                    Print QR
                  </button>
                  <button
                    onClick={() => deleteTable(table.id)}
                    className="text-xs text-[#A6341D]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}