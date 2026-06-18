import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { code, subtotal } = await req.json()
    if (!code) throw new Error('Code is required')

    const { data: discountData } = await supabaseAdmin
      .from('discount_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('active', true)
      .single()

    if (!discountData) {
      throw new Error('Invalid or inactive discount code')
    }

    const now = new Date()
    const startsAt = discountData.starts_at ? new Date(discountData.starts_at) : null
    const endsAt = discountData.ends_at ? new Date(discountData.ends_at) : null

    if (discountData.usage_limit && discountData.used_count >= discountData.usage_limit) {
      throw new Error('Discount code has reached its usage limit')
    }
    if (startsAt && startsAt > now) {
      throw new Error('Discount code is not active yet')
    }
    if (endsAt && endsAt < now) {
      throw new Error('Discount code has expired')
    }
    if (discountData.minimum_subtotal && (subtotal || 0) < discountData.minimum_subtotal) {
      throw new Error(`This code requires a minimum order of J$${discountData.minimum_subtotal.toLocaleString()}`)
    }

    let discountAmount = 0
    if (discountData.discount_type === 'percent') {
      discountAmount = (subtotal || 0) * (Number(discountData.discount_value) / 100)
    } else {
      discountAmount = Number(discountData.discount_value)
    }
    if (subtotal && discountAmount > subtotal) discountAmount = subtotal

    return new Response(
      JSON.stringify({
        valid: true,
        code: discountData.code,
        discountType: discountData.discount_type,
        discountValue: Number(discountData.discount_value),
        discountAmount: discountAmount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
