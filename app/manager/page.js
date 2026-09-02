'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function ManagerPage() {
    async function logout() {
    document.cookie = 'manager_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC'
    window.location.href = '/manager/login'
  }
  const [billRequests, setBillRequests] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchBillRequests() {
    // Get all orders where the customer requested the bill
    // and the order has not been paid yet.
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

  // Group orders by table.
  // A table can have multiple orders during one session.
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

  // Calculate total of all orders belonging to one table.
  function calculateTableTotal(orders) {
    return orders.reduce(
      (sum, order) => sum + Number(order.total || 0),
      0
    )
  }

  async function markAsPaid(orders) {
    if (!orders || orders.length === 0) {
      return
    }

    const orderIds = orders.map((order) => order.id)

    // --------------------------------------------------
    // STEP 1:
    // Mark all orders for this table as PAID
    // --------------------------------------------------
    const { error: orderError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        bill_requested: false,
      })
      .in('id', orderIds)

    if (orderError) {
      alert('Error marking orders as paid')
      console.error(orderError)
      return
    }

    // --------------------------------------------------
    // STEP 2:
    // Find the restaurant table connected to these orders
    // --------------------------------------------------
    const { data: orderTableData, error: tableLookupError } =
      await supabase
        .from('orders')
        .select('table_id')
        .eq('id', orderIds[0])
        .single()

    if (tableLookupError || !orderTableData) {
      alert(
        'Bill was paid, but the table session could not be closed.'
      )

      console.error(tableLookupError)

      fetchBillRequests()
      return
    }

    // --------------------------------------------------
    // STEP 3:
    // Close the table session
    //
    // occupied = customer can order
    // closed   = customer cannot place another order
    // --------------------------------------------------
    const { error: tableError } = await supabase
      .from('restaurant_tables')
      .update({
        status: 'closed',
      })
      .eq('id', orderTableData.table_id)

    if (tableError) {
      alert(
        'Bill was paid, but the table session could not be closed.'
      )

      console.error(tableError)
      return
    }

    // --------------------------------------------------
    // STEP 4:
    // Refresh manager screen
    // --------------------------------------------------
    fetchBillRequests()
  }

  if (loading) {
    return (
      <p style={{ padding: 20 }}>
        Loading bill requests...
      </p>
    )
  }

  const grouped = groupByTable(billRequests)
  const tableNumbers = Object.keys(grouped)

  return (
    <div
      style={{
        padding: 20,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <h1>Manager — Bill Requests</h1>
  <button onClick={logout} style={{ padding: '8px 14px', fontSize: 13 }}>Logout</button>
</div>
      {tableNumbers.length === 0 && (
        <p>No pending bill requests right now.</p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fill, minmax(300px, 1fr))',
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
              <h2 style={{ margin: 0 }}>
                Table {tableNum}
              </h2>

              <p
                style={{
                  color: '#d9534f',
                  fontWeight: 'bold',
                }}
              >
                💰 Bill Requested
              </p>

              {orders.map((order) => (
                <div
                  key={order.id}
                  style={{
                    marginBottom: 10,
                    paddingLeft: 10,
                  }}
                >
                  <p
                    style={{
                      margin: '5px 0',
                      fontSize: 13,
                      color: '#555',
                    }}
                  >
                    Order #{order.id} — {order.status}
                  </p>

                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                    }}
                  >
                    {order.order_items.map((item) => (
                      <li key={item.id}>
                        {item.quantity}x{' '}
                        {item.menu_items?.name} — Rs.{' '}
                        {Number(
                          item.menu_items?.price || 0
                        ) * Number(item.quantity || 0)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <hr />

              <p
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                }}
              >
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
                  cursor: 'pointer',
                  fontSize: 16,
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