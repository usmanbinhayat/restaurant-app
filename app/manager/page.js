'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const STATUS_STYLES = {
  pending: { label: 'New', bg: 'bg-[#ea811b]/10', text: 'text-[#b35e0f]', dot: 'bg-[#ea811b]' },
  preparing: { label: 'Preparing', bg: 'bg-[#8B5FA8]/10', text: 'text-[#6B3F87]', dot: 'bg-[#8B5FA8]' },
  ready: { label: 'Ready', bg: 'bg-[#55684A]/10', text: 'text-[#3E4D36]', dot: 'bg-[#55684A]' },
  served: { label: 'Served', bg: 'bg-[#121111]/8', text: 'text-[#121111]/45', dot: 'bg-[#121111]/35' },
}

export default function ManagerPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  const AUTO_CLOSE_HOURS = 2

  async function sweepStaleTables() {
    const cutoff = new Date(Date.now() - AUTO_CLOSE_HOURS * 60 * 60 * 1000).toISOString()
    await supabase
      .from('restaurant_tables')
      .update({ status: 'closed' })
      .eq('status', 'occupied')
      .lt('occupied_since', cutoff)
  }

  async function fetchOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        total,
        created_at,
        served_at,
        bill_requested,
        restaurant_tables ( table_number, status ),
        order_items (
          id,
          quantity,
          menu_items ( name, price )
        )
      `)
      .neq('status', 'paid')
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
    sweepStaleTables()
    const interval = setInterval(() => {
      fetchOrders()
      sweepStaleTables()
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(clock)
  }, [])

  async function logout() {
    document.cookie = 'manager_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC'
    window.location.href = '/manager/login'
  }

  function groupByTable(orderList) {
    const grouped = {}
    orderList.forEach((order) => {
      const tableNum = order.restaurant_tables?.table_number
      if (!grouped[tableNum]) grouped[tableNum] = []
      grouped[tableNum].push(order)
    })
    return grouped
  }

  function tableTotal(tableOrders) {
    return tableOrders.reduce((sum, o) => sum + Number(o.total || 0), 0)
  }

  function tableHasBillRequest(tableOrders) {
    return tableOrders.some((o) => o.bill_requested)
  }

  function minutesAgo(createdAt, servedAt) {
    const endTime = servedAt ? new Date(servedAt) : now
    return Math.max(0, Math.floor((endTime.getTime() - new Date(createdAt).getTime()) / 60000))
  }

  function waitTimeColor(mins, isReady) {
    if (isReady) return 'text-[#121111]/40'
    if (mins >= 20) return 'text-red-600 font-semibold'
    if (mins >= 10) return 'text-[#b35e0f] font-semibold'
    return 'text-[#121111]/45'
  }

  function longestWait(tableOrders) {
    const activeOrders = tableOrders.filter((o) => !['ready', 'served'].includes(o.status))
    const source = activeOrders.length > 0 ? activeOrders : tableOrders
    return Math.max(...source.map((o) => minutesAgo(o.created_at, o.served_at)))
  }

  async function markAsPaid(tableOrders) {
    const orderIds = tableOrders.map((o) => o.id)
    const tableNumber = tableOrders[0]?.restaurant_tables?.table_number

    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid', bill_requested: false })
      .in('id', orderIds)

    if (error) {
      alert('Error marking as paid')
      console.error(error)
      return
    }

    if (tableNumber) {
      await supabase
        .from('restaurant_tables')
        .update({ status: 'closed' })
        .eq('table_number', tableNumber)
    }

    fetchOrders()
  }

  function printBill(tableNum) {
    window.open(`/manager/print?table=${tableNum}`, '_blank')
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f1f2f0]">
        <p className="font-[family-name:var(--font-body)] text-[#121111]">Loading dashboard…</p>
      </div>
    )
  }

  const grouped = groupByTable(orders)
  const tableNumbers = Object.keys(grouped).sort((a, b) => {
    const aRequested = tableHasBillRequest(grouped[a])
    const bRequested = tableHasBillRequest(grouped[b])
    if (aRequested && !bRequested) return -1
    if (!aRequested && bRequested) return 1
    return Number(a) - Number(b)
  })

  const totalActiveTables = tableNumbers.length
  const totalPendingItems = orders.filter((o) => o.status === 'pending').length
  const totalBillRequests = tableNumbers.filter((t) => tableHasBillRequest(grouped[t])).length

  return (
    <div className="min-h-screen bg-[#f1f2f0] font-[family-name:var(--font-body)] text-[#121111]">
      {/* Header */}
      <div className="bg-[#121111] px-6 pb-6 pt-6 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#ea811b]">Katlang Zaika</p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl italic">Manager Dashboard</h1>
          </div>
          <button
            onClick={logout}
            className="rounded-full border border-white/25 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            Logout
          </button>
        </div>

        <div className="mx-auto mt-5 grid max-w-5xl grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-2xl font-bold">{totalActiveTables}</p>
            <p className="text-xs text-white/55">Active tables</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-2xl font-bold text-[#ea811b]">{totalPendingItems}</p>
            <p className="text-xs text-white/55">New orders</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-2xl font-bold text-red-300">{totalBillRequests}</p>
            <p className="text-xs text-white/55">Bill requests</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl p-5">
        {tableNumbers.length === 0 ? (
          <p className="mt-10 text-center text-sm text-[#121111]/45">
            No active tables right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tableNumbers.map((tableNum) => {
              const tableOrders = grouped[tableNum]
              const requested = tableHasBillRequest(tableOrders)
              const total = tableTotal(tableOrders)
              const waitMins = longestWait(tableOrders)

              return (
                <div
                  key={tableNum}
                  className={`rounded-2xl border bg-white p-4 shadow-[0_4px_18px_rgba(18,17,17,0.05)] ${
                    requested ? 'border-red-300' : 'border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-[family-name:var(--font-display)] text-xl italic">
                      Table {tableNum}
                    </h2>
                    <div className="flex items-center gap-2">
                      {waitMins >= 10 && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            waitMins >= 20 ? 'bg-red-50 text-red-600' : 'bg-[#ea811b]/10 text-[#b35e0f]'
                          }`}
                        >
                          {waitMins}m waiting
                        </span>
                      )}
                      {requested && (
                        <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                          Bill requested
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {tableOrders.map((order) => {
                      const style = STATUS_STYLES[order.status] || STATUS_STYLES.pending
                      const orderTime = new Date(order.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      const isServed = order.status === 'served'
                      const mins = minutesAgo(order.created_at, order.served_at)

                      return (
                        <div key={order.id} className="rounded-xl bg-[#f1f2f0] p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#121111]/45">
                              Order #{order.id} · {orderTime}
                            </span>
                            <span
                              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                              {style.label}
                            </span>
                          </div>

                          <p className={`mt-1 text-xs ${waitTimeColor(mins, isServed)}`}>
                            {isServed ? `Served in ${mins} min` : `Waiting ${mins} min`}
                          </p>

                          <ul className="mt-2 space-y-1">
                            {order.order_items.map((item) => (
                              <li
                                key={item.id}
                                className="flex justify-between text-sm"
                              >
                                <span>
                                  {item.quantity}× {item.menu_items?.name}
                                </span>
                                <span className="text-[#121111]/45">
                                  Rs. {Number(item.menu_items?.price || 0) * Number(item.quantity || 0)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[#121111]/10 pt-3">
                    <span className="text-lg font-bold text-[#ea811b]">Rs. {total}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => printBill(tableNum)}
                        className="rounded-full border border-[#121111]/15 px-3 py-2 text-xs font-medium transition active:scale-95"
                      >
                        Print Bill
                      </button>
                      <button
                        onClick={() => markAsPaid(tableOrders)}
                        className="rounded-full bg-[#121111] px-4 py-2 text-xs font-semibold text-white transition active:scale-95"
                      >
                        Mark as Paid
                      </button>
                    </div>
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