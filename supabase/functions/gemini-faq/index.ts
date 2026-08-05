// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const FAQ_CONTENT = `
## 📅 Itinerary & Schedule
Q: What time should I arrive on the first day?
A: We will be welcoming guests from 5:00 PM onwards.

Q: What time does everything wrap up on the final day?
A: Guests need to check out by 10:30 AM.

Q: Are there any gaps between events where we can explore Devon?
A: You are welcome to explore Devon in the mornings, or you can join us for the optional morning activities we will be hosting.

## 📍 Logistics
Q: What is the exact address of the venue?
A: Huntsham Court, Huntsham, Tiverton EX16 7NA.

Q: Is there parking available on-site, and is it free?
A: Yes, there is plenty of parking available free of charge.

Q: Can I leave my car at the venue overnight?
A: Of course! You are welcome to leave your vehicle parked at the venue overnight.

Q: What is the closest train station to the venue?
A: Tiverton Parkway offers express links to London (1 hour 55 minutes), Bristol (45 minutes), and Exeter (15 minutes), and is just a 12-minute taxi ride from Huntsham Court. Postcode EX16 7NA will lead you directly to the entrance.

Q: How easy is it to get a taxi in the area?
A: We highly recommend booking taxis in advance as Huntsham is in a rural area and taxis can be hard to come by on the spot.

Q: Do you have numbers for local taxi companies we should pre-book?
A: Yes, please pre-book with any of the following: A-2-B Taxis (01884 251 252), RT Taxis (07731 154 024), Rick’s Private Hire (07789 998 224), Brian’s Taxi (07753 791 810), Liz Cabs (07899 903 314), Parkway Taxis (01884 388 99), Devon Transfers Private Hire (07425 262 087), Chris Cars (07773 600 125), Hero 2 Transport (01884 212 447).

Q: Is there reliable phone signal or Wi-Fi at the venue?
A: Yes, Wi-Fi is available throughout the property.

Q: Is the venue wheelchair accessible / suitable for those with limited mobility?
A: Yes. The venue is accessible; please request a downstairs bedroom if needed by contacting Rosh or Harry.

Q: What happens if it rains? Is there an indoor backup plan?
A: We are crossing our fingers for good weather! However, we have a complete indoor backup plan ready if needed.

## 🛏️ Accommodation
Q: What nearby hotels, B&Bs, or Airbnbs do you recommend?
A: We recommend the Hartnoll Hotel (Tiverton, 6m), Lawpit Lodges (Tiverton, 6m), Three Gates Farm (Huntsham, 1.5m), Weston House Devon (Bampton, 4m), Bishops Barton (Greenham, 5m), Travelodge (Sampford Peverell, 5m), Brambles Bed and Breakfast (Sampford Peverell, 5m), Berry House and Farm (Shillingford, 4m), Waterside House (Uplowman, 3m), Old Mill Cottages (Shillingford, 3m), or Cottage for Two (Staple Cross, 2.5m).

Q: When is the deadline to book our accommodation?
A: If you are allocated a room, payment needs to be received by December 1st to secure the booking.

Q: Is there a swimming pool, hot tub, or beach access nearby we should pack for?
A: No, unfortunately there is no swimming pool or hot tub on-site.

## 👗 Dress Code
Q: What colour are the bridesmaids wearing?
A: The bridesmaids will be in sage green.

Q: What is the dress code for Day 1?
A: Summer cocktail party. Feel free to wear dresses, skirts, shorts, shirt/polo, T-shirt or jeans. Trainers are absolutely fine too.

Q: What is the dress code for Day 2?
A: Garden party. We are keeping things relatively casual, so florals, sandals, shorts, polos, and T-shirts are all great. We will be playing some outdoor games so feel free to bring or wear trainers!

Q: What is the dress code for Day 3?
A: Wedding day attire! We are going for a typical summer wedding. Ties are optional, but we kindly ask you skip jeans, shorts, and trainers today.

Q: Will any part of the wedding be on grass, pebbles, or sand? (Important for heel choice!)
A: Yes. There is a lot of grass on the croquet lawn and in the gardens, so please select your footwear accordingly.

Q: Should I bring warm layers for the evening?
A: We suggest checking the weather forecast beforehand. Since some evening events will be held outdoors, we recommend bringing warm layers just in case.

## 🍽️ Food & Drink
Q: Which meals are being provided over the three days?
A: All meals will be provided. We will be having pizza, a picnic lunch (dips, crisps, sausage rolls, etc.), a BBQ (hot dogs, burgers, salads), and fajitas. Breakfast is provided for those staying on-site, consisting of a spread of sausage/bacon rolls, yoghurt, fruit, granola, tea, and coffee. Snacks will also be available in the Butler’s Pantry throughout the weekend. Please indicate any dietary requirements on your RSVP and we will ensure you are catered for.

Q: Which meals or drinks do we need to pay for ourselves?
A: None, everything is included!

Q: Is there a cash bar, or can we pay by card/contactless?
A: All drinks are included throughout the weekend.

Q: Can I bring my own alcohol or drinks to the venue?
A: We will be providing plenty of drinks; however, you are more than welcome to bring any specific drinks of your own. We suggest keeping these in your rooms so they do not get mixed up with the provided options.

## 👶 Children & Plus-Ones
Q: Are kids allowed?
A: We have decided to not have children at the wedding due to the nature of the venue and activities.

Q: Can we bring our children?
A: We have decided to not have children at the wedding due to the nature of the venue and activities.

Q: Is babysitting or a crèche available at the venue?
A: No, babysitting or crèche services are not provided.

Q: Can I bring a plus-one?
A: Please do not bring a plus-one; only guests named on the invitations are invited.

Q: My partner’s name wasn’t on the invite, can they still come?
A: All invited guests are named on the invitations. Please message either Rosh or Harry if you would like to double check.

## 🎁 RSVPs & Gifts
Q: When is the RSVP deadline?
A: The final RSVP deadline is February 7th, 2027, however guests wishing to stay on site will need to RSVP by December 1st 2026.

Q: How do I RSVP for the different days?
A: Please update your RSVP form on our website.

Q: Do you have a wedding gift registry or a wishing well?
A: Having you there to celebrate with us across three days is truly the best gift we could ask for. We know that travelling and taking the time to join us is a huge commitment, and we genuinely do not expect any gifts. Please just bring yourselves! However, if you would like to give something, we will be setting up a donation link towards our honeymoon which will be available here closer to the wedding. But please, do not feel any pressure to do so.

## 📸 Photos & Fun
Q: Can I take photos and videos during the ceremony?
A: We have a professional photographer and content creator capturing the entire ceremony. Please turn off your phones and keep them tucked away during this time.

Q: Can we bring confetti, and does it need to be biodegradable?
A: We will be providing confetti; please do not bring your own.

Q: Is there a theme for the weekend?
A: Short answer: fun!

Q: Are pets allowed at the venue?
A: No, please do not bring pets to the venue.

## 🚨 Contacts & Help
Q: Who should I contact on the day if I get lost or have an emergency?
A: Please do not contact the bride or groom once celebrations have started. If you need assistance, please contact Natalie (our coordinator) or a member of the bridal party.

Q: Who should I ask questions prior to the event?
A: Either Rosh or Harry is on hand to answer any queries you may have prior to the event.

Q: Who can I ask questions to during the event regarding logistics and timings etc?
A: Please refrain from asking Rosh or Harry questions during the weekend. Everything you need to know will be on this website. If anything is unclear, we will have our coordinator Natalie on site, or you can ask a member of the bridal party.
`;

// @ts-ignore
serve(async (req: any) => {
    // 1. CORS Setup
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. Get Request Data
        const { query, guest, roomDetails, itinerary } = await req.json()
        if (!query) {
            throw new Error('No query provided')
        }

        // 2.5. Fetch FAQs from Database (with full FAQ_CONTENT fallback)
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://jkxxswxpykdyrpjriizx.supabase.co';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1...';
        const supabaseClient = createClient(supabaseUrl, supabaseKey, {
            global: {
                headers: {
                    'x-access-code': 'HPRT0730'
                }
            }
        });
        
        let faqContent = FAQ_CONTENT;
        try {
            const { data: faqRows, error: faqErr } = await supabaseClient
                .from('faqs')
                .select('category, question, answer')
                .order('display_order', { ascending: true });
            
            if (!faqErr && faqRows && faqRows.length > 0) {
                faqContent = faqRows.map(f => {
                    return `## ${f.category}\nQ: ${f.question}\nA: ${f.answer}\n`;
                }).join('\n');
            }
        } catch (dbErr) {
            console.error("Database FAQ fetch error, using complete FAQ_CONTENT:", dbErr);
        }

        // 3. Get API Key from Supabase Environment Secret
        // @ts-ignore
        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is not set in Supabase Secrets!')
        }

        // 4. Construct Clean Gem Prompt
        const systemPrompt = `You are a friendly, warm, and helpful AI Concierge for Harry & Rosh's wedding at Huntsham Court.
Answer guest questions accurately using the knowledge base below. Jump straight to the answer without repeating formal greetings every time.

FORMATTING & BREVITY GUIDELINES:
- Keep answers concise, clear, and structured for easy reading on mobile chat.
- Use clean line breaks and bullet points (* Item) rather than giant paragraphs.
- For broad questions (like dress code), provide a crisp 1-sentence summary per day so the answer stays brief and easy to read. Guests can ask about a specific day if they want full details!

# KNOWLEDGE BASE:
${faqContent}

${guest ? `Guest Details:
- Name: ${guest.name || "Guest"}
- RSVP Status: ${guest.attendance || "Not specified"}
- Dietary: ${guest.dietary || "None"}
- Room Assigned: ${guest.room_assigned || "None"}
- Room Revealed: ${guest.is_room_revealed ? "Yes" : "No"}
` : ""}

${roomDetails ? `Assigned Room:\n${roomDetails}\n` : ""}

${itinerary ? `Itinerary / Schedule:\n${JSON.stringify(itinerary, null, 2)}\n` : ""}

CRITICAL DASHBOARD LINKING RULES:
If the user asks about their room, the itinerary/agenda, the estate/map, the photo gallery, or updating their RSVP, append a helpful action link at the end of your response in the format [Link Text](action://target).
Targets:
- Assigned room info: [See room info](action://room) (ONLY if Room Revealed is Yes)
- Wedding schedule/timeline: [See plan](action://itinerary)
- Estate maps/directions: [Explore estate](action://estate)
- Photo gallery: [View gallery](action://gallery)
- Updating RSVP: [Update RSVP](action://rsvp)

CRITICAL ROOM ALLOCATION RULE:
- If (and ONLY if) the guest asks about their own assigned bedroom, room name, price, or roommates, AND "Room Revealed" is "No", politely let them know that room allocations are currently being finalized by Harry & Rosh and will be revealed in the coming months!

User Question: "${query}"
`

        // 5. Call Gemini API
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [
                                { text: systemPrompt }
                            ]
                        }
                    ]
                }),
            }
        )

        const data = await response.json()

        // 6. Parse Response
        if (data.error) {
            throw new Error(`Google Error: ${data.error.message}`);
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response."

        // 7. Return Result
        return new Response(
            JSON.stringify({ reply }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    }
})
