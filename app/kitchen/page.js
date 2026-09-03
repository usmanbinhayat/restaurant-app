'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const STATUS_STYLES = {
  pending: { label: 'New', bg: 'bg-[#E8A93A]/15', border: 'border-[#E8A93A]/40', text: 'text-[#946A1C]', dot: 'bg-[#E8A93A]' },
  preparing: { label: 'Preparing', bg: 'bg-[#8B5FA8]/15', border: 'border-[#8B5FA8]/40', text: 'text-[#6B3F87]', dot: 'bg-[#8B5FA8]' },
  ready: { label: 'Ready', bg: 'bg-[#55684A]/15', border: 'border-[#55684A]/40', text: 'text-[#3E4D36]', dot: 'bg-[#55684A]' },
}

export default function KitchenPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  async function fetchOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        created_at,
        total,
        restaurant_tables ( table_number ),
        order_items (
          id,
          quantity,
          notes,
          menu_items ( name )
        )
      `)
      .in('status', ['pending', 'preparing', 'ready'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading orders:', error)
    } else {
      setOrders(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(clock)
  }, [])

  async function logout() {
    document.cookie = 'kitchen_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC'
    window.location.href = '/kitchen/login'
  }

    async function updateStatus(orderId, newStatus) {
    const updateData =
      newStatus === 'served'
        ? { status: newStatus, served_at: new Date().toISOString() }
        : { status: newStatus }

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)

    if (error) {
      alert('Error updating order status')
      console.error(error)
    } else {
      fetchOrders()
    }
  }

  function minutesAgo(createdAt) {
    return Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000))
  }

  function waitColor(mins) {
    if (mins >= 20) return 'text-[#A6341D] font-semibold'
    if (mins >= 10) return 'text-[#946A1C] font-semibold'
    return 'text-[#241A14]/50'
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F3E9D8]">
        <p className="font-[family-name:var(--font-body)] text-[#241A14]">Loading orders…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F3E9D8] font-[family-name:var(--font-body)]">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#241A14] px-6 py-5">
        <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[#F3E9D8]">
          Kitchen
        </h1>
        <button
          onClick={logout}
          className="rounded-full border border-[#F3E9D8]/30 px-4 py-1.5 text-xs font-medium text-[#F3E9D8] transition hover:bg-[#F3E9D8]/10"
        >
          Logout
        </button>
      </div>

      <div className="p-5">
        {orders.length === 0 ? (
          <p className="mt-10 text-center text-sm text-[#241A14]/50">
            No active orders right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => {
              const style = STATUS_STYLES[order.status] || STATUS_STYLES.pending
              const orderTime = new Date(order.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
              const mins = minutesAgo(order.created_at)

              return (
                <div
                  key={order.id}
                  className={`rounded-2xl border-2 bg-white p-4 shadow-sm ${style.border}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h2 className="font-[family-name:var(--font-display)] text-xl italic text-[#241A14]">
                      Table {order.restaurant_tables?.table_number}
                    </h2>
                    <span
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {style.label}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-[#241A14]/50">Ordered at {orderTime}</span>
                    <span className={waitColor(mins)}>{mins} min ago</span>
                  </div>

                  {/* Items */}
                  <ul className="mt-3 space-y-1 border-t border-[#241A14]/10 pt-3">
                    {order.order_items.map((item) => (
                      <li key={item.id} className="text-sm text-[#241A14]">
                        <span className="font-medium">{item.quantity}×</span> {item.menu_items?.name}
                        {item.notes && (
                          <span className="text-[#241A14]/50"> ({item.notes})</span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Action button */}
                  <div className="mt-4">
                    {order.status === 'pending' && (
                      <button
                        onClick={() => updateStatus(order.id, 'preparing')}
                        className="w-full rounded-full bg-[#241A14] py-2.5 text-sm font-semibold text-[#F3E9D8] transition active:scale-95"
                      >
                        Start Preparing
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button
                        onClick={() => updateStatus(order.id, 'ready')}
                        className="w-full rounded-full bg-[#D9A441] py-2.5 text-sm font-semibold text-[#241A14] transition active:scale-95"
                      >
                        Mark Ready
                      </button>
                    )}
                    {order.status === 'ready' && (
                      <button
                        onClick={() => updateStatus(order.id, 'served')}
                        className="w-full rounded-full bg-[#55684A] py-2.5 text-sm font-semibold text-[#F3E9D8] transition active:scale-95"
                      >
                        Mark Served
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}