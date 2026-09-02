'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// TEMPORARY: hardcoded table number for testing.
// Later this will come from the QR code URL instead.
const CURRENT_TABLE_NUMBER = 1

export default function MenuPage() {
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(true)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [orderConfirmed, setOrderConfirmed] = useState(false)
  const [lastOrderId, setLastOrderId] = useState(null)
  const [billRequested, setBillRequested] = useState(false)
  const [requestingBill, setRequestingBill] = useState(false)

  useEffect(() => {
    async function fetchMenu() {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('available', true)

      if (error) {
        console.error('Error loading menu:', error)
      } else {
        setMenuItems(data)
      }
      setLoading(false)
    }
    fetchMenu()
  }, [])

  function addToCart(item) {
    setCart([...cart, item])
  }

  function removeFromCart(itemId) {
    const index = cart.findIndex((item) => item.id === itemId)
    if (index !== -1) {
      const newCart = [...cart]
      newCart.splice(index, 1)
      setCart(newCart)
    }
  }

  function countInCart(itemId) {
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
      console.error(tableError)
      setPlacingOrder(false)
      return
    }

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        table_id: tableData.id,
        status: 'pending',
        total: getTotal(),
      })
      .select()
      .single()

    if (orderError || !orderData) {
      alert('Error placing order. Please try again.')
      console.error(orderError)
      setPlacingOrder(false)
      return
    }

    const grouped = {}
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

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsToInsert)

    if (itemsError) {
      alert('Order created, but there was an issue saving items. Please tell the manager.')
      console.error(itemsError)
      setPlacingOrder(false)
      return
    }

    // Remember this order so "Request Bill" knows what to update
    setLastOrderId(orderData.id)
    setBillRequested(false)
    setOrderConfirmed(true)
    setCart([])
    setPlacingOrder(false)
  }

  // Runs when "Request Bill" is clicked
  async function requestBill() {
    if (!lastOrderId) return
    setRequestingBill(true)

    const { error } = await supabase
      .from('orders')
      .update({ bill_requested: true })
      .eq('id', lastOrderId)

    if (error) {
      alert('Error requesting bill. Please tell staff directly.')
      console.error(error)
    } else {
      setBillRequested(true)
    }
    setRequestingBill(false)
  }

  if (loading) {
    return <p style={{ padding: 20 }}>Loading menu...</p>
  }

  if (orderConfirmed) {
    return (
      <div style={{ padding: 20, textAlign: 'center', marginTop: 50 }}>
        <h1>✅ Order Placed!</h1>
        <p>Your order has been sent to the kitchen. Sit back and relax!</p>

        <button
          onClick={() => setOrderConfirmed(false)}
          style={{ marginTop: 20, padding: '10px 20px', marginRight: 10 }}
        >
          Order More
        </button>

        {!billRequested ? (
          <button
            onClick={requestBill}
            disabled={requestingBill}
            style={{
              marginTop: 20,
              padding: '10px 20px',
              background: '#d9534f',
              color: 'white',
              border: 'none',
              borderRadius: 5,
            }}
          >
            {requestingBill ? 'Requesting...' : 'Request Bill'}
          </button>
        ) : (
          <p style={{ marginTop: 20, color: 'green' }}>
            ✅ Bill requested — a staff member is on the way!
          </p>
        )}
      </div>
    )
  }

  const categories = [...new Set(menuItems.map((item) => item.category))]

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif', paddingBottom: 100 }}>
      <h1>Our Menu</h1>
      <p style={{ color: '#666' }}>Table {CURRENT_TABLE_NUMBER}</p>

      {lastOrderId && (
        <div style={{ marginBottom: 20 }}>
          {!billRequested ? (
            <button
              onClick={requestBill}
              disabled={requestingBill}
              style={{
                padding: '10px 20px',
                background: '#d9534f',
                color: 'white',
                border: 'none',
                borderRadius: 5,
              }}
            >
              {requestingBill ? 'Requesting...' : 'Request Bill'}
            </button>
          ) : (
            <p style={{ color: 'green' }}>✅ Bill requested — a staff member is on the way!</p>
          )}
        </div>
      )}

      {categories.map((category) => (
        <div key={category} style={{ marginBottom: 30 }}>
          <h2 style={{ borderBottom: '2px solid #333', paddingBottom: 5 }}>
            {category}
          </h2>

          {menuItems
            .filter((item) => item.category === category)
            .map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid #eee',
                }}
              >
                <div>
                  <strong>{item.name}</strong>
                  <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
                    {item.description}
                  </p>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>Rs. {item.price}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    disabled={countInCart(item.id) === 0}
                    style={{ padding: '5px 10px' }}
                  >
                    -
                  </button>
                  <span>{countInCart(item.id)}</span>
                  <button onClick={() => addToCart(item)} style={{ padding: '5px 10px' }}>
                    +
                  </button>
                </div>
              </div>
            ))}
        </div>
      ))}

      {cart.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#222',
            color: 'white',
            padding: 15,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{cart.length} items — Rs. {getTotal()}</span>
          <button
            onClick={placeOrder}
            disabled={placingOrder}
            style={{
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 5,
            }}
          >
            {placingOrder ? 'Placing order...' : 'Place Order'}
          </button>
        </div>
      )}
    </div>
  )
}