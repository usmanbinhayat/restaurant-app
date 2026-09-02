'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function ManagerPage() {
  const [billRequests, setBillRequests] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchBillRequests() {
    // Get all orders where the customer asked for the bill and it's not paid yet
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        total,
        created_at,
        restaurant_tables ( table_number ),
        order_items (
          id,
          quantity,
          menu_items ( name, price )
        )
      `)
      .eq('bill_requested', true)
      .neq('status', 'paid')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading bill requests:', error)
    } else {
      setBillRequests(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchBillRequests()
    const interval = setInterval(fetchBillRequests, 5000)
    return () => clearInterval(interval)
  }, [])

  // Group individual orders by table, since a table might have multiple orders (rounds)
  function groupByTable(orders) {
    const grouped = {}
    orders.forEach((order) => {
      const tableNum = order.restaurant_tables?.table_number
      if (!grouped[tableNum]) {
        grouped[tableNum] = []
      }
      grouped[tableNum].push(order)
    })
    return grouped
  }

  function calculateTableTotal(orders) {
    return orders.reduce((sum, order) => sum + Number(order.total), 0)
  }

  async function markAsPaid(orders) {
    const orderIds = orders.map((o) => o.id)

    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid', bill_requested: false })
      .in('id', orderIds)

    if (error) {
      alert('Error marking as paid')
      console.error(error)
    } else {
      fetchBillRequests()
    }
  }

  if (loading) {
    return <p style={{ padding: 20 }}>Loading bill requests...</p>
  }

  const grouped = groupByTable(billRequests)
  const tableNumbers = Object.keys(grouped)

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>Manager — Bill Requests</h1>

      {tableNumbers.length === 0 && <p>No pending bill requests right now.</p>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 15,
        }}
      >
        {tableNumbers.map((tableNum) => {
          const orders = grouped[tableNum]
          const total = calculateTableTotal(orders)

          return (
            <div
              key={tableNum}
              style={{
                border: '2px solid #d9534f',
                borderRadius: 8,
                padding: 15,
                background: '#fff5f5',
              }}
            >
              <h2 style={{ margin: 0 }}>Table {tableNum}</h2>
              <p style={{ color: '#d9534f', fontWeight: 'bold' }}>
                💰 Bill Requested
              </p>

              {orders.map((order) => (
                <div key={order.id} style={{ marginBottom: 10, paddingLeft: 10 }}>
                  <p style={{ margin: '5px 0', fontSize: 13, color: '#555' }}>
                    Order #{order.id} — {order.status}
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {order.order_items.map((item) => (
                      <li key={item.id}>
                        {item.quantity}x {item.menu_items?.name} — Rs.{' '}
                        {item.menu_items?.price * item.quantity}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <hr />
              <p style={{ fontSize: 18, fontWeight: 'bold' }}>
                Total: Rs. {total}
              </p>

              <button
                onClick={() => markAsPaid(orders)}
                style={{
                  padding: '10px 20px',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: 5,
                  width: '100%',
                }}
              >
                Mark as Paid
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}