const { createClient } = require('@supabase/supabase-js')
   require('dotenv').config({ path: '.env.local' })

   const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL,
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
   )

   async function test() {
     const { data, error } = await supabase.from('_test').select('*')
     if (error && error.message.includes('does not exist')) {
       console.log('? SUCCESS: Connected to Supabase! (table just doesn\'t exist yet, which is expected)')
     } else if (error) {
       console.log('? ERROR:', error.message)
     } else {
       console.log('? SUCCESS: Connected to Supabase!')
     }
   }
   test()