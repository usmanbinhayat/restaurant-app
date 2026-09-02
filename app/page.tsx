'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CURRENT_TABLE_NUMBER = 1

type MenuItem = {
  id: number
  name: string
  description: string
  price: number
  category: string
  image_url: string | null
}

export default function MenuPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [orderConfirmed, setOrderConfirmed] = useState(false)
  const [lastOrderId, setLastOrderId] = useState<number | null>(null)
  const [billRequested, setBillRequested] = useState(false)
  const [requestingBill, setRequestingBill] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('')

  useEffect(() => {
    async function fetchMenu() {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('available', true)

      if (error) {
        console.error('Error loading menu:', error)
      } else if (data) {
        setMenuItems(data)
        if (data.length > 0) setActiveCategory(data[0].category)
      }
      setLoading(false)
    }
    fetchMenu()
  }, [])

  function addToCart(item: MenuItem) {
    setCart([...cart, item])
  }

  function removeFromCart(itemId: number) {
    const index = cart.findIndex((item) => item.id === itemId)
    if (index !== -1) {
      const newCart = [...cart]
      newCart.splice(index, 1)
      setCart(newCart)
    }
  }

  function countInCart(itemId: number) {
    return cart.filter((item) => item.id === itemId).length
  }

  function getTotal() {
    return cart.reduce((sum, item) => sum + Number(item.price), 0)
  }

  async function placeOrder() {
    setPlacingOrder(true)

    const { data: tableData, error: tableError } = await supabase
      .from('restaurant_tables')
      .select('id')
      .eq('table_number', CURRENT_TABLE_NUMBER)
      .single()

    if (tableError || !tableData) {
      alert('Error: could not find this table. Please tell the manager.')
      setPlacingOrder(false)
      return
    }

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({ table_id: tableData.id, status: 'pending', total: getTotal() })
      .select()
      .single()

    if (orderError || !orderData) {
      alert('Error placing order. Please try again.')
      setPlacingOrder(false)
      return
    }

    const grouped: Record<number, { menu_item_id: number; quantity: number }> = {}
    cart.forEach((item) => {
      if (grouped[item.id]) {
        grouped[item.id].quantity += 1
      } else {
        grouped[item.id] = { menu_item_id: item.id, quantity: 1 }
      }
    })

    const orderItemsToInsert = Object.values(grouped).map((item) => ({
      order_id: orderData.id,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
    }))

    const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert)

    if (itemsError) {
      alert('Order created, but there was an issue saving items.')
      setPlacingOrder(false)
      return
    }

    setLastOrderId(orderData.id)
    setBillRequested(false)
    setOrderConfirmed(true)
    setCart([])
    setPlacingOrder(false)
  }

  async function requestBill() {
    if (!lastOrderId) return
    setRequestingBill(true)
    const { error } = await supabase
      .from('orders')
      .update({ bill_requested: true })
      .eq('id', lastOrderId)

    if (!error) setBillRequested(true)
    setRequestingBill(false)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F3E9D8]">
        <p className="font-[family-name:var(--font-body)] text-[#241A14]">Loading menu…</p>
      </div>
    )
  }

  if (orderConfirmed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#241A14] px-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#D9A441] animate-[pop_0.4s_ease-out]">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#241A14" strokeWidth="3">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl italic text-[#F3E9D8]">
          Order sent to the kitchen
        </h1>
        <p className="mt-2 max-w-xs font-[family-name:var(--font-body)] text-sm text-[#F3E9D8]/70">
          Sit back and relax — we&apos;ll bring it out shortly.
        </p>

        <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => setOrderConfirmed(false)}
            className="rounded-full border border-[#F3E9D8]/30 py-3 font-[family-name:var(--font-body)] text-sm font-medium text-[#F3E9D8] transition hover:bg-[#F3E9D8]/10"
          >
            Order more
          </button>

          {!billRequested ? (
            <button
              onClick={requestBill}
              disabled={requestingBill}
              className="rounded-full bg-[#A6341D] py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[#F3E9D8] transition hover:bg-[#8c2b18] disabled:opacity-60"
            >
              {requestingBill ? 'Requesting…' : 'Request the bill'}
            </button>
          ) : (
            <p className="rounded-full bg-[#55684A]/20 py-3 font-[family-name:var(--font-body)] text-sm text-[#9AB88E]">
              Bill requested — staff is on the way
            </p>
          )}
        </div>

        <style>{`
          @keyframes pop {
            0% { transform: scale(0); opacity: 0; }
            70% { transform: scale(1.1); }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  const categories = [...new Set(menuItems.map((item) => item.category))]
  const visibleItems = menuItems.filter((item) => item.category === activeCategory)

  return (
    <div className="min-h-screen bg-[#F3E9D8] pb-32 font-[family-name:var(--font-body)]">
      {/* Header / signboard */}
      <div className="bg-[#241A14] px-5 pb-5 pt-6">
        <div className="flex items-start justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[#F3E9D8]">
            Katlang Zaika
          </h1>
          <span className="rounded-full border border-[#D9A441]/50 px-3 py-1 text-xs font-medium tracking-wide text-[#D9A441]">
            Table {CURRENT_TABLE_NUMBER}
          </span>
        </div>

        {lastOrderId && (
          <div className="mt-3">
            {!billRequested ? (
              <button
                onClick={requestBill}
                disabled={requestingBill}
                className="text-xs font-medium text-[#D9A441] underline underline-offset-2"
              >
                {requestingBill ? 'Requesting…' : 'Request the bill'}
              </button>
            ) : (
              <p className="text-xs text-[#9AB88E]">Bill requested — staff is on the way</p>
            )}
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div className="sticky top-0 z-10 flex gap-6 overflow-x-auto border-b border-[#241A14]/10 bg-[#F3E9D8] px-5 py-3">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`whitespace-nowrap pb-1 text-sm font-medium transition ${
              activeCategory === category
                ? 'border-b-2 border-[#A6341D] text-[#241A14]'
                : 'text-[#241A14]/50'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Menu list */}
      <div className="px-5">
        {visibleItems.map((item) => {
          const qty = countInCart(item.id)
          return (
            <div key={item.id} className="flex gap-4 border-b border-[#241A14]/10 py-4">
              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-[#241A14]/5">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[#241A14]/30">
                    No photo
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#241A14]">{item.name}</h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[#241A14]/60">{item.description}</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#A6341D]">Rs. {item.price}</span>

                  {qty === 0 ? (
                    <button
                      onClick={() => addToCart(item)}
                      className="rounded-full bg-[#241A14] px-4 py-1.5 text-xs font-medium text-[#F3E9D8] transition active:scale-95"
                    >
                      Add
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 rounded-full bg-[#241A14] px-2 py-1">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="flex h-5 w-5 items-center justify-center text-[#F3E9D8]"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-xs font-medium text-[#F3E9D8]">{qty}</span>
                      <button
                        onClick={() => addToCart(item)}
                        className="flex h-5 w-5 items-center justify-center text-[#F3E9D8]"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cart bar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-20 transition-transform duration-300 ${
          cart.length > 0 ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-4 mb-4 flex items-center justify-between rounded-2xl bg-[#241A14] px-5 py-4 shadow-xl">
          <span className="text-sm font-medium text-[#F3E9D8]">
            {cart.length} {cart.length === 1 ? 'item' : 'items'} · Rs. {getTotal()}
          </span>
          <button
            onClick={placeOrder}
            disabled={placingOrder}
            className="rounded-full bg-[#D9A441] px-5 py-2 text-sm font-semibold text-[#241A14] transition active:scale-95 disabled:opacity-60"
          >
            {placingOrder ? 'Placing…' : 'Place order'}
          </button>
        </div>
      </div>
    </div>
  )
}