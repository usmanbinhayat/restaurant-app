'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type MenuItem = {
  id: number
  name: string
  description: string
  price: number
  category: string
  image_url: string | null
}

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#F3E9D8]">
          <p className="text-[#241A14]">Loading…</p>
        </div>
      }
    >
      <MenuPageInner />
    </Suspense>
  )
}

function MenuPageInner() {
  const searchParams = useSearchParams()
  const CURRENT_TABLE_NUMBER = Number(searchParams.get('table')) || null

  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [orderConfirmed, setOrderConfirmed] = useState(false)
  const [lastOrderId, setLastOrderId] = useState<number | null>(null)
  const [billRequested, setBillRequested] = useState(false)
  const [requestingBill, setRequestingBill] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('')

  // Controls whether this table session is currently allowed to order.
  const [orderingAllowed, setOrderingAllowed] = useState(false)

  // --------------------------------------------------
  // Load menu
  // --------------------------------------------------
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

        if (data.length > 0) {
          setActiveCategory(data[0].category)
        }
      }

      setLoading(false)
    }

    fetchMenu()
  }, [])

  // --------------------------------------------------
  // Reactivate this table for a fresh customer scanning the QR code
  // --------------------------------------------------
  useEffect(() => {
    async function reactivateTable() {
      if (!CURRENT_TABLE_NUMBER) return
      await supabase
        .from('restaurant_tables')
        .update({ status: 'occupied' })
        .eq('table_number', CURRENT_TABLE_NUMBER)
    }
    reactivateTable()
  }, [CURRENT_TABLE_NUMBER])

  // --------------------------------------------------
  // Check table session status
  //
  // occupied = customer can order
  // closed   = customer cannot order
  //
  // We check repeatedly so the customer page updates
  // even if the customer does NOT refresh the page.
  // --------------------------------------------------
  useEffect(() => {
    async function checkTableStatus() {
      if (!CURRENT_TABLE_NUMBER) return

      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('status')
        .eq('table_number', CURRENT_TABLE_NUMBER)
        .single()

      if (error) {
        console.error('Error checking table status:', error)
        return
      }

      if (data) {
        const allowed = data.status === 'occupied'

        setOrderingAllowed(allowed)

        // If manager closed the table while customer
        // still had items in the cart, clear the cart.
        if (!allowed) {
          setCart([])
        }
      }
    }

    // Check immediately
    checkTableStatus()

    // Then check every 2 seconds
    const interval = setInterval(checkTableStatus, 2000)

    return () => clearInterval(interval)
  }, [CURRENT_TABLE_NUMBER])

  // --------------------------------------------------
  // Add item to cart
  // --------------------------------------------------
  function addToCart(item: MenuItem) {
    // Do not allow adding if the session is closed.
    if (!orderingAllowed) {
      alert(
        'This table session has ended. Please scan the QR code again to place a new order.'
      )
      return
    }

    setCart((currentCart) => [...currentCart, item])
  }

  // --------------------------------------------------
  // Remove item from cart
  // --------------------------------------------------
  function removeFromCart(itemId: number) {
    const index = cart.findIndex((item) => item.id === itemId)

    if (index !== -1) {
      const newCart = [...cart]
      newCart.splice(index, 1)
      setCart(newCart)
    }
  }

  // --------------------------------------------------
  // Count item quantity
  // --------------------------------------------------
  function countInCart(itemId: number) {
    return cart.filter((item) => item.id === itemId).length
  }

  // --------------------------------------------------
  // Calculate cart total
  // --------------------------------------------------
  function getTotal() {
    return cart.reduce(
      (sum, item) => sum + Number(item.price),
      0
    )
  }

  // --------------------------------------------------
  // Place order
  // --------------------------------------------------
  async function placeOrder() {
    if (cart.length === 0 || !CURRENT_TABLE_NUMBER) {
      return
    }

    // First local check
    if (!orderingAllowed) {
      alert(
        'This table session has ended. Please scan the QR code again to place a new order.'
      )
      setCart([])
      return
    }

    setPlacingOrder(true)

    // --------------------------------------------------
    // IMPORTANT:
    // Check the database again immediately before
    // creating the order.
    //
    // This protects against the manager closing the
    // session at exactly the same time.
    // --------------------------------------------------
    const { data: tableCheck, error: tableCheckError } =
      await supabase
        .from('restaurant_tables')
        .select('id, status')
        .eq('table_number', CURRENT_TABLE_NUMBER)
        .single()

    if (
      tableCheckError ||
      !tableCheck ||
      tableCheck.status !== 'occupied'
    ) {
      alert(
        'This table session has ended. Please scan the QR code again to place a new order.'
      )

      setOrderingAllowed(false)
      setCart([])
      setPlacingOrder(false)

      return
    }

    // --------------------------------------------------
    // Create order
    // --------------------------------------------------
    const { data: orderData, error: orderError } =
      await supabase
        .from('orders')
        .insert({
          table_id: tableCheck.id,
          status: 'pending',
          total: getTotal(),
        })
        .select()
        .single()

    if (orderError || !orderData) {
      alert('Error placing order. Please try again.')
      setPlacingOrder(false)
      return
    }

    // --------------------------------------------------
    // Group identical menu items
    // --------------------------------------------------
        // --------------------------------------------------
    // Group identical menu items
    // --------------------------------------------------
    const grouped: { [key: number]: { menu_item_id: number; quantity: number } } = {}

    cart.forEach((item) => {
      if (grouped[item.id]) {
        grouped[item.id].quantity += 1
      } else {
        grouped[item.id] = {
          menu_item_id: item.id,
          quantity: 1,
        }
      }
    })

    const orderItemsToInsert = Object.values(grouped).map(
      (item) => ({
        order_id: orderData.id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
      })
    )

    // --------------------------------------------------
    // Save order items
    // --------------------------------------------------
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsToInsert)

    if (itemsError) {
      alert(
        'Order created, but there was an issue saving items.'
      )

      setPlacingOrder(false)
      return
    }

    // --------------------------------------------------
    // Order successfully created
    // --------------------------------------------------
    setLastOrderId(orderData.id)
    setBillRequested(false)
    setOrderConfirmed(true)
    setCart([])
    setPlacingOrder(false)
  }

  // --------------------------------------------------
  // Request bill
  // --------------------------------------------------
  async function requestBill() {
    if (!lastOrderId) return

    setRequestingBill(true)

    const { error } = await supabase
      .from('orders')
      .update({
        bill_requested: true,
      })
      .eq('id', lastOrderId)

    if (!error) {
      setBillRequested(true)
    }

    setRequestingBill(false)
  }

  // --------------------------------------------------
  // No table number in the link
  // --------------------------------------------------
  if (!CURRENT_TABLE_NUMBER) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F3E9D8] px-6 text-center">
        <p className="font-[family-name:var(--font-body)] text-sm text-[#241A14]">
          Please scan the QR code on your table to view the menu.
        </p>
      </div>
    )
  }

  // --------------------------------------------------
  // Loading screen
  // --------------------------------------------------
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F3E9D8]">
        <p className="font-[family-name:var(--font-body)] text-[#241A14]">
          Loading menu…
        </p>
      </div>
    )
  }

  // --------------------------------------------------
  // Order confirmation screen
  // --------------------------------------------------
  if (orderConfirmed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#241A14] px-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#D9A441] animate-[pop_0.4s_ease-out]">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#241A14"
            strokeWidth="3"
          >
            <path
              d="M5 13l4 4L19 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-3xl italic text-[#F3E9D8]">
          Order sent to the kitchen
        </h1>

        <p className="mt-2 max-w-xs font-[family-name:var(--font-body)] text-sm text-[#F3E9D8]/70">
          Sit back and relax — we&apos;ll bring it out shortly.
        </p>

        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          {/* Order more button */}
          <button
            onClick={() => {
              if (!orderingAllowed) {
                alert(
                  'This table session has ended. Please scan the QR code again to place a new order.'
                )
                return
              }

              setOrderConfirmed(false)
            }}
            disabled={!orderingAllowed}
            className="rounded-full border border-[#F3E9D8]/30 py-3 font-[family-name:var(--font-body)] text-sm font-medium text-[#F3E9D8] transition hover:bg-[#F3E9D8]/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {orderingAllowed ? 'Order more' : 'Session ended'}
          </button>

          {!billRequested ? (
            <button
              onClick={requestBill}
              disabled={requestingBill}
              className="rounded-full bg-[#A6341D] py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[#F3E9D8] transition hover:bg-[#8c2b18] disabled:opacity-60"
            >
              {requestingBill
                ? 'Requesting…'
                : 'Request the bill'}
            </button>
          ) : (
            <p className="rounded-full bg-[#55684A]/20 py-3 font-[family-name:var(--font-body)] text-sm text-[#9AB88E]">
              Bill requested — staff is on the way
            </p>
          )}
        </div>

        {/* Session ended message */}
        {!orderingAllowed && (
          <p className="mt-6 max-w-xs text-xs leading-relaxed text-[#F3E9D8]/60">
            This table has been paid and the session has ended.
            Please scan the restaurant QR code again to start a
            new session.
          </p>
        )}

        <style>{`
          @keyframes pop {
            0% {
              transform: scale(0);
              opacity: 0;
            }

            70% {
              transform: scale(1.1);
            }

            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    )
  }

  // --------------------------------------------------
  // Categories
  // --------------------------------------------------
  const categories = [
    ...new Set(menuItems.map((item) => item.category)),
  ]

  const visibleItems = menuItems.filter(
    (item) => item.category === activeCategory
  )

  // --------------------------------------------------
  // Main menu
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-[#F3E9D8] pb-32 font-[family-name:var(--font-body)]">
      {/* Header */}
      <div className="bg-[#241A14] px-5 pb-5 pt-6">
        <div className="flex items-start justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[#F3E9D8]">
            Katlang Zaika
          </h1>

          <span className="rounded-full border border-[#D9A441]/50 px-3 py-1 text-xs font-medium tracking-wide text-[#D9A441]">
            Table {CURRENT_TABLE_NUMBER}
          </span>
        </div>

        {/* Session status */}
        {orderingAllowed ? (
          <p className="mt-3 text-xs text-[#9AB88E]">
            ● Ordering is open
          </p>
        ) : (
          <p className="mt-3 text-xs font-medium text-[#E58B78]">
            ● Session ended — scan QR code again to order
          </p>
        )}

        {lastOrderId && (
          <div className="mt-3">
            {!billRequested ? (
              <button
                onClick={requestBill}
                disabled={requestingBill}
                className="text-xs font-medium text-[#D9A441] underline underline-offset-2 disabled:opacity-50"
              >
                {requestingBill
                  ? 'Requesting…'
                  : 'Request the bill'}
              </button>
            ) : (
              <p className="text-xs text-[#9AB88E]">
                Bill requested — staff is on the way
              </p>
            )}
          </div>
        )}
      </div>

      {/* Session ended banner */}
      {!orderingAllowed && (
        <div className="mx-5 mt-4 rounded-xl border border-[#A6341D]/20 bg-[#A6341D]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[#A6341D]">
            This table session has ended
          </p>

          <p className="mt-1 text-xs leading-relaxed text-[#241A14]/60">
            The bill has been paid. You can still browse the
            menu, but you cannot place another order.
          </p>
        </div>
      )}

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
            <div
              key={item.id}
              className="flex gap-4 border-b border-[#241A14]/10 py-4"
            >
              {/* Image */}
              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-[#241A14]/5">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[#241A14]/30">
                    No photo
                  </div>
                )}
              </div>

              {/* Item information */}
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#241A14]">
                    {item.name}
                  </h3>

                  <p className="mt-0.5 line-clamp-2 text-xs text-[#241A14]/60">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#A6341D]">
                    Rs. {item.price}
                  </span>

                  {orderingAllowed ? (
                    qty === 0 ? (
                      <button
                        onClick={() => addToCart(item)}
                        className="rounded-full bg-[#241A14] px-4 py-1.5 text-xs font-medium text-[#F3E9D8] transition active:scale-95"
                      >
                        Add
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 rounded-full bg-[#241A14] px-2 py-1">
                        <button
                          onClick={() =>
                            removeFromCart(item.id)
                          }
                          className="flex h-5 w-5 items-center justify-center text-[#F3E9D8]"
                        >
                          −
                        </button>

                        <span className="w-4 text-center text-xs font-medium text-[#F3E9D8]">
                          {qty}
                        </span>

                        <button
                          onClick={() => addToCart(item)}
                          className="flex h-5 w-5 items-center justify-center text-[#F3E9D8]"
                        >
                          +
                        </button>
                      </div>
                    )
                  ) : (
                    <span className="rounded-full bg-[#241A14]/10 px-3 py-1.5 text-xs text-[#241A14]/40">
                      Closed
                    </span>
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
          cart.length > 0 && orderingAllowed
            ? 'translate-y-0'
            : 'translate-y-full'
        }`}
      >
        <div className="mx-4 mb-4 flex items-center justify-between rounded-2xl bg-[#241A14] px-5 py-4 shadow-xl">
          <span className="text-sm font-medium text-[#F3E9D8]">
            {cart.length}{' '}
            {cart.length === 1 ? 'item' : 'items'} · Rs.{' '}
            {getTotal()}
          </span>

          <button
            onClick={placeOrder}
            disabled={placingOrder || !orderingAllowed}
            className="rounded-full bg-[#D9A441] px-5 py-2 text-sm font-semibold text-[#241A14] transition active:scale-95 disabled:opacity-60"
          >
            {placingOrder ? 'Placing…' : 'Place order'}
          </button>
        </div>
      </div>
    </div>
  )
}