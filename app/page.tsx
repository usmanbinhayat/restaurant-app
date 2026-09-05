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

function WelcomeSplash({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={`welcome-splash ${visible ? 'welcome-splash-visible' : 'welcome-splash-hidden'}`}
    >
      <div className="welcome-splash-glow welcome-splash-glow-one" />
      <div className="welcome-splash-glow welcome-splash-glow-two" />
      <div className="welcome-splash-content">
        <div className="welcome-mark">KZ</div>
        <p className="welcome-kicker">A taste of home</p>
        <h1>Katlang Zaika</h1>
        <p className="welcome-tagline">Fresh flavours. Warm memories.</p>
        <div className="welcome-line" />
      </div>
    </div>
  )
}

export default function MenuPage() {
  const [showWelcome, setShowWelcome] = useState(true)

  useEffect(() => {
    const welcomeTimer = setTimeout(() => setShowWelcome(false), 1900)
    return () => clearTimeout(welcomeTimer)
  }, [])

  return (
    <>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-[#f1f2f0]">
            <p className="font-[family-name:var(--font-body)] text-sm font-medium text-[#121111]">Loading menu...</p>
          </div>
        }
      >
        <MenuPageInner />
      </Suspense>
      <WelcomeSplash visible={showWelcome} />
    </>
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
        .order('sort_order', { ascending: true })

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
      <div className="flex h-screen flex-col items-center justify-center bg-[#f1f2f0] px-6 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ea811b] text-2xl font-bold text-white">KZ</div>
        <p className="max-w-xs font-[family-name:var(--font-body)] text-sm text-[#121111]/70">
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
      <div className="relative flex h-screen items-center justify-center bg-[#f1f2f0]">
        <p className="font-[family-name:var(--font-body)] text-sm font-medium text-[#121111]">
          Loading menu...
        </p>
      </div>
    )
  }

  // --------------------------------------------------
  // Order confirmation screen
  // --------------------------------------------------
  if (orderConfirmed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#121111] px-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#ea811b] animate-[pop_0.4s_ease-out]">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3"
          >
            <path
              d="M5 13l4 4L19 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-3xl italic text-white">
          Order sent to the kitchen
        </h1>

        <p className="mt-2 max-w-xs font-[family-name:var(--font-body)] text-sm text-white/65">
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
            className="rounded-full border border-white/25 py-3 font-[family-name:var(--font-body)] text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {orderingAllowed ? 'Order more' : 'Session ended'}
          </button>

          {!billRequested ? (
            <button
              onClick={requestBill}
              disabled={requestingBill}
              className="rounded-full bg-[#ea811b] py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-white transition hover:bg-[#d9700f] disabled:opacity-60"
            >
              {requestingBill
                ? 'Requesting…'
                : 'Request the bill'}
            </button>
          ) : (
            <p className="rounded-full bg-[#ea811b]/15 py-3 font-[family-name:var(--font-body)] text-sm text-[#ffc184]">
              Bill requested — staff is on the way
            </p>
          )}
        </div>

        {/* Session ended message */}
        {!orderingAllowed && (
          <p className="mt-6 max-w-xs text-xs leading-relaxed text-white/55">
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
    <div className="min-h-screen bg-[#f1f2f0] pb-32 font-[family-name:var(--font-body)] text-[#121111]">
      {/* Brand header */}
      <div className="bg-[#121111] px-5 pb-6 pt-5 text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#ea811b]">Welcome to</p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl italic">Katlang Zaika</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-white/55 sm:inline">Your table</span>
            <span className="rounded-full bg-[#ea811b] px-3 py-1.5 text-xs font-bold text-white">{CURRENT_TABLE_NUMBER}</span>
          </div>
        </div>

        <div className="mx-auto mt-5 flex max-w-2xl items-center justify-between rounded-xl bg-white/10 px-3 py-2.5 text-xs">
          <span className="text-white/70">{orderingAllowed ? 'Ready when you are' : 'Ordering is currently closed'}</span>
          <span className={orderingAllowed ? 'font-semibold text-[#ea811b]' : 'font-semibold text-red-300'}>{orderingAllowed ? '● Open' : '● Closed'}</span>
        </div>

        {lastOrderId && (
          <div className="mt-3">
            {!billRequested ? (
              <button
                onClick={requestBill}
                disabled={requestingBill}
                className="text-xs font-medium text-[#ea811b] underline underline-offset-2 disabled:opacity-50"
              >
                {requestingBill
                  ? 'Requesting…'
                  : 'Request the bill'}
              </button>
            ) : (
              <p className="text-xs text-[#9bd29b]">
                Bill requested — staff is on the way
              </p>
            )}
          </div>
        )}
      </div>

      {/* Session ended banner */}
      {!orderingAllowed && (
        <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">
            This table session has ended
          </p>

          <p className="mt-1 text-xs leading-relaxed text-[#121111]/60">
            The bill has been paid. You can still browse the
            menu, but you cannot place another order.
          </p>
        </div>
      )}

      {/* Promo banner and category chips */}
      <main className="mx-auto max-w-2xl">
      <div className="mx-5 mt-5 overflow-hidden rounded-2xl bg-[#ea811b] px-5 py-5 text-white shadow-sm sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Katlang kitchen</p>
            <h2 className="mt-2 max-w-[220px] text-2xl font-bold leading-tight">Taste something special today</h2>
            <p className="mt-3 text-xs text-white/80">Freshly prepared favourites, served to your table.</p>
          </div>
          <div className="relative hidden h-24 w-24 shrink-0 sm:block">
            <div className="absolute inset-0 rounded-full border-[14px] border-white/20" />
            <div className="absolute right-1 top-1 h-12 w-12 rounded-full bg-[#121111]" />
            <div className="absolute bottom-1 left-2 h-9 w-9 rounded-full bg-[#ffc184]" />
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 mt-5 overflow-x-auto bg-[#f1f2f0]/95 px-5 py-2 backdrop-blur">
        <div className="flex gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${
              activeCategory === category
                ? 'bg-[#ea811b] text-white shadow-sm'
                : 'bg-white text-[#121111]/55'
            }`}
          >
            {category}
          </button>
        ))}
        </div>
      </div>

      {/* Menu list */}
      <div className="px-5 pt-3">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ea811b]">Our menu</p>
            <h2 className="mt-1 text-xl font-bold">{activeCategory || 'Popular dishes'}</h2>
          </div>
          <span className="text-xs text-[#121111]/45">{visibleItems.length} items</span>
        </div>
        {visibleItems.map((item) => {
          const qty = countInCart(item.id)

          return (
            <div
              key={item.id}
              className="mb-3 flex gap-4 rounded-2xl bg-white p-3 shadow-[0_4px_18px_rgba(18,17,17,0.05)]"
            >
              {/* Image */}
              <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-[#121111]/5">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[#121111]/30">
                    No photo
                  </div>
                )}
              </div>

              {/* Item information */}
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#121111]">
                    {item.name}
                  </h3>

                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#121111]/55">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#ea811b]">
                    Rs. {item.price}
                  </span>

                  {orderingAllowed ? (
                    qty === 0 ? (
                      <button
                        onClick={() => addToCart(item)}
                        className="rounded-full bg-[#ea811b] px-4 py-2 text-xs font-bold text-white transition active:scale-95"
                      >
                        Add
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 rounded-full bg-[#121111] px-2 py-1.5">
                        <button
                          onClick={() =>
                            removeFromCart(item.id)
                          }
                            className="flex h-5 w-5 items-center justify-center text-white"
                        >
                          −
                        </button>

                        <span className="w-4 text-center text-xs font-medium text-white">
                          {qty}
                        </span>

                        <button
                          onClick={() => addToCart(item)}
                          className="flex h-5 w-5 items-center justify-center text-white"
                        >
                          +
                        </button>
                      </div>
                    )
                  ) : (
                    <span className="rounded-full bg-[#121111]/10 px-3 py-1.5 text-xs text-[#121111]/40">
                      Closed
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
gg      </main>

      {/* Cart bar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-20 px-4 pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ${
          cart.length > 0 && orderingAllowed
            ? 'translate-y-0'
            : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between rounded-2xl bg-[#121111] px-4 py-3.5 shadow-[0_10px_30px_rgba(18,17,17,0.2)] ring-1 ring-black/10 sm:px-5 sm:py-4">
          <span className="text-sm font-medium text-white">
            {cart.length}{' '}
            {cart.length === 1 ? 'item' : 'items'} · Rs.{' '}
            {getTotal()}
          </span>

          <button
            onClick={placeOrder}
            disabled={placingOrder || !orderingAllowed}
            className="rounded-full bg-[#ea811b] px-5 py-2 text-sm font-bold text-white transition active:scale-95 disabled:opacity-60"
          >
            {placingOrder ? 'Placing…' : 'Place order'}
          </button>
        </div>
      </div>
    </div>
  )
}
