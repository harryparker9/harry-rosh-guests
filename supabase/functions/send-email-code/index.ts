import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

// Helper to clean phone numbers (keep only digits)
function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// CORS Headers configuration matching other edge functions
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
    // Optional custom sender, fallback to onboarding@resend.dev
    const resendSender = Deno.env.get('RESEND_SENDER_EMAIL') || 'onboarding@resend.dev';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are missing.');
    }

    // Initialize Supabase Client with service role key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // ACTION 1: VERIFY GUEST
    if (action === 'verify') {
      const { name, phone } = body;
      if (!name || !phone) {
        return new Response(
          JSON.stringify({ error: 'Name and Phone number are required.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Query database for guest matching name case-insensitively
      const { data: guests, error: dbError } = await supabase
        .from('guests')
        .select('id, full_name, phone')
        .ilike('full_name', name.trim());

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      const inputPhoneClean = cleanPhone(phone);
      
      // Find matching guest by normalized phone
      const matchedGuest = guests?.find(g => {
        const dbPhoneClean = cleanPhone(g.phone || '');
        if (!dbPhoneClean || !inputPhoneClean) return false;
        if (dbPhoneClean === inputPhoneClean) return true;
        // Last 9 digits match (UK format safe)
        if (dbPhoneClean.length >= 9 && inputPhoneClean.length >= 9) {
          return dbPhoneClean.slice(-9) === inputPhoneClean.slice(-9);
        }
        return false;
      });

      if (!matchedGuest) {
        return new Response(
          JSON.stringify({ error: 'No matching guest found. Please enter your details exactly as they appear on your invitation.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, guestId: matchedGuest.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION 2: SEND EMAIL
    if (action === 'send') {
      const { guestId, email } = body;
      if (!guestId || !email) {
        return new Response(
          JSON.stringify({ error: 'Guest ID and Email are required.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return new Response(
          JSON.stringify({ error: 'Invalid email address format.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch guest code and name
      const { data: guest, error: fetchError } = await supabase
        .from('guests')
        .select('full_name, access_code')
        .eq('id', guestId)
        .single();

      if (fetchError || !guest) {
        return new Response(
          JSON.stringify({ error: 'Guest not found.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update email in database
      const { error: updateError } = await supabase
        .from('guests')
        .update({ email: email.trim() })
        .eq('id', guestId);

      if (updateError) {
        throw new Error(`Failed to save email address: ${updateError.message}`);
      }

      if (!resendApiKey) {
        throw new Error('RESEND_API_KEY environment variable is not set.');
      }

      // Construct auto-login URL based on incoming request origin (supports localhost, vercel etc.)
      const origin = req.headers.get('origin') || 'https://harryandrosh.co.uk';
      const loginUrl = `${origin}/?code=${encodeURIComponent(guest.access_code)}`;

      // HTML Email body with gold/cream wedding theme
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Wedding Access Code</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: #FAF9F5;
      color: #2C2C2C;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 550px;
      margin: 40px auto;
      background-color: #ffffff;
      border: 1px solid rgba(193, 162, 122, 0.2);
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 4px 25px rgba(0, 0, 0, 0.015);
    }
    .header {
      text-align: center;
      font-size: 24px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #2C2C2C;
      margin-bottom: 30px;
      border-bottom: 1px solid rgba(193, 162, 122, 0.15);
      padding-bottom: 20px;
    }
    .content {
      line-height: 1.6;
      font-size: 16px;
      color: #4A4A4A;
    }
    .greeting {
      font-size: 18px;
      font-weight: 500;
      color: #2C2C2C;
      margin-bottom: 15px;
    }
    .code-box {
      background: #FAF9F5;
      border: 1px dashed #C1A27A;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin: 30px 0;
    }
    .code-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #7E7B77;
      margin-bottom: 8px;
    }
    .code-value {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #C1A27A;
    }
    .btn-container {
      text-align: center;
      margin: 30px 0;
    }
    .btn {
      background-color: #C1A27A;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 36px;
      border-radius: 50px;
      font-weight: 600;
      font-size: 14px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      display: inline-block;
    }
    .link-alt {
      font-size: 12px;
      color: #7E7B77;
      text-align: center;
      margin-top: 25px;
      word-break: break-all;
    }
    .link-alt a {
      color: #C1A27A;
      text-decoration: none;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      font-size: 12px;
      color: #7E7B77;
      border-top: 1px solid rgba(193, 162, 122, 0.15);
      padding-top: 25px;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">Harry & Rosh</div>
    <div class="content">
      <div class="greeting">Hi ${guest.full_name},</div>
      <p>We received a request to recover your access code for our wedding website.</p>
      <p>Use the code below to enter, or simply click the button to log in automatically:</p>
      
      <div class="code-box">
        <div class="code-label">Your Access Code</div>
        <div class="code-value">${guest.access_code}</div>
      </div>
      
      <div class="btn-container">
        <a href="${loginUrl}" class="btn" target="_blank">Log In Automatically</a>
      </div>
      
      <div class="link-alt">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${loginUrl}" target="_blank">${loginUrl}</a>
      </div>
    </div>
    <div class="footer">
      AUGUST 2027 &bull; HUNTSHAM COURT, DEVON
    </div>
  </div>
</body>
</html>`;

      // Call Resend REST API to send email
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: `Harry & Rosh <${resendSender}>`,
          to: [email.trim()],
          subject: 'Your Wedding Website Access Code',
          html: htmlContent,
        }),
      });

      const emailResult = await emailResponse.json();

      if (!emailResponse.ok) {
        throw new Error(`Resend error: ${emailResult.message || JSON.stringify(emailResult)}`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
})
