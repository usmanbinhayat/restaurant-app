'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const STATUS_STYLES = {
  pending: { label: 'New', bg: 'bg-[#E8A93A]/15', text: 'text-[#946A1C]', dot: 'bg-[#E8A93A]' },
  received: { label: 'Received', bg: 'bg-[#5B7FA6]/15', text: 'text-[#3A5A7A]', dot: 'bg-[#5B7FA6]' },
  preparing: { label: 'Preparing', bg: 'bg-[#8B5FA8]/15', text: 'text-[#6B3F87]', dot: 'bg-[#8B5FA8]' },
  ready: { label: 'Ready', bg: 'bg-[#55684A]/15', text: 'text-[#3E4D36]', dot: 'bg-[#55684A]' },
}

export default function ManagerPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        total,
        created_at,
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
    const interval = setInterval(fetchOrders, 4000)
    return () => clearInterval(interval)
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F3E9D8]">
        <p className="font-[family-name:var(--font-body)] text-[#241A14]">Loading dashboard…</p>
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
    <div className="min-h-screen bg-[#F3E9D8] font-[family-name:var(--font-body)]">
      {/* Header */}
      <div className="bg-[#241A14] px-6 pb-6 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-2xl italic text-[#F3E9D8]">
            Manager Dashboard
          </h1>
          <button
            onClick={logout}
            className="rounded-full border border-[#F3E9D8]/30 px-4 py-1.5 text-xs font-medium text-[#F3E9D8] transition hover:bg-[#F3E9D8]/10"
          >
            Logout
          </button>
        </div>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-[#F3E9D8]/10 px-4 py-3">
            <p className="text-2xl font-semibold text-[#F3E9D8]">{totalActiveTables}</p>
            <p className="text-xs text-[#F3E9D8]/60">Active tables</p>
          </div>
          <div className="rounded-xl bg-[#F3E9D8]/10 px-4 py-3">
            <p className="text-2xl font-semibold text-[#D9A441]">{totalPendingItems}</p>
            <p className="text-xs text-[#F3E9D8]/60">New orders</p>
          </div>
          <div className="rounded-xl bg-[#F3E9D8]/10 px-4 py-3">
            <p className="text-2xl font-semibold text-[#E58B78]">{totalBillRequests}</p>
            <p className="text-xs text-[#F3E9D8]/60">Bill requests</p>
          </div>
        </div>
      </div>

      {/* Table cards */}
      <div className="p-5">
        {tableNumbers.length === 0 ? (
          <p className="mt-10 text-center text-sm text-[#241A14]/50">
            No active tables right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tableNumbers.map((tableNum) => {
              const tableOrders = grouped[tableNum]
              const requested = tableHasBillRequest(tableOrders)
              const total = tableTotal(tableOrders)

              return (
                <div
                  key={tableNum}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    requested ? 'border-[#A6341D]' : 'border-[#241A14]/10'
                  }`}
                >
                  {/* Table header */}
                  <div className="flex items-center justify-between">
                    <h2 className="font-[family-name:var(--font-display)] text-xl italic text-[#241A14]">
                      Table {tableNum}
                    </h2>
                    {requested && (
                      <span className="rounded-full bg-[#A6341D] px-3 py-1 text-xs font-semibold text-white">
                        Bill requested
                      </span>
                    )}
                  </div>

                  {/* Orders for this table */}
                  <div className="mt-3 space-y-3">
                    {tableOrders.map((order) => {
                      const style = STATUS_STYLES[order.status] || STATUS_STYLES.pending
                      const orderTime = new Date(order.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })

                      return (
                        <div key={order.id} className="rounded-xl bg-[#F3E9D8]/60 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#241A14]/50">
                              Order #{order.id} · {orderTime}
                            </span>
                            <span
                              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                              {style.label}
                            </span>
                          </div>

                          <ul className="mt-2 space-y-1">
                            {order.order_items.map((item) => (
                              <li
                                key={item.id}
                                className="flex justify-between text-sm text-[#241A14]"
                              >
                                <span>
                                  {item.quantity}× {item.menu_items?.name}
                                </span>
                                <span className="text-[#241A14]/60">
                                  Rs. {Number(item.menu_items?.price || 0) * Number(item.quantity || 0)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>

                  {/* Total + action */}
                  <div className="mt-4 flex items-center justify-between border-t border-[#241A14]/10 pt-3">
                    <span className="text-lg font-semibold text-[#A6341D]">Rs. {total}</span>
                    <button
                      onClick={() => markAsPaid(tableOrders)}
                      className="rounded-full bg-[#241A14] px-4 py-2 text-xs font-semibold text-[#F3E9D8] transition active:scale-95"
                    >
                      Mark as Paid
                    </button>
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