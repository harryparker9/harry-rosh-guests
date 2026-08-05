// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const FAQ_CONTENT = `
# Wedding FAQs & Information

Category: 👶 Children & Plus-Ones
Q: Are kids allowed?
A: We have decided to not have children at the wedding due to the nature of the venue and activities.

Q: Can we bring our children?
A: We have decided to not have children at the wedding due to the nature of the venue and activities.

Q: Is babysitting or a crèche available at the venue?
A: No, babysitting or crèche services are not provided.

Q: Can I bring a plus-one?
A: Please do not bring a plus-one; only guests named on the invitations are invited.

Category: 👗 Dress Code
Q: What colour are the bridesmaids wearing?
A: The bridesmaids will be in sage green.

Q: What is the dress code for Day 1?
A: Summer cocktail party. Feel free to wear dresses, skirts, shorts, shirt/polo, T-shirt or jeans. Trainers are fine.

Q: What is the dress code for Day 2?
A: Garden party. Florals, sandals, shorts, polos, and T-shirts are all great. Trainers are fine for outdoor games.

Q: What is the dress code for Day 3?
A: Wedding day attire! Typical summer wedding. Ties are optional, but please skip jeans, shorts, and trainers.

Category: 📍 Logistics
Q: What is the exact address of the venue?
A: Huntsham Court, Huntsham, Tiverton EX16 7NA.

Q: Is there parking available on-site, and is it free?
A: Yes, there is plenty of parking available free of charge.
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
        const { query, guest, roomDetails, itinerary, lastBotReply } = await req.json()
        if (!query) {
            throw new Error('No query provided')
        }

        // 2.5. Fetch FAQs from Database
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://jkxxswxpykdyrpjriizx.supabase.co';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpreHhzd3hweWtkeXJwanJpaXp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NzUzMTYsImV4cCI6MjA4MTQ1MTMxNn0.mu--najU_Urrt-5jAfEhPGdg6rYCrsDo_fj01BJ5abc';
        const supabaseClient = createClient(supabaseUrl, supabaseKey, {
            global: {
                headers: {
                    'x-access-code': 'HPRT0730'
                }
            }
        });
        
        let faqContent = "";
        try {
            const { data: faqRows, error: faqErr } = await supabaseClient
                .from('faqs')
                .select('category, question, answer')
                .order('display_order', { ascending: true });
            
            if (faqErr) throw faqErr;

            if (faqRows && faqRows.length > 0) {
                faqContent = faqRows.map(f => {
                    return `[Category: ${f.category}]\nQuestion: ${f.question}\nAnswer: ${f.answer}\n`;
                }).join('\n');
            } else {
                faqContent = FAQ_CONTENT;
            }
        } catch (dbErr) {
            console.error("Database FAQ fetch error, falling back to hardcoded:", dbErr);
            faqContent = FAQ_CONTENT;
        }

        // 3. Get API Key from Supabase Environment Secret
        // @ts-ignore
        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is not set in Supabase Secrets!')
        }

        // 4. Construct Prompt
        const systemPrompt = `
You are the official AI Wedding Concierge for Harry & Rosh's wedding celebration at Huntsham Court!
Your goal is to be a warm, welcoming, friendly, and helpful AI assistant for all guests.

TONE & BEHAVIOR:
- Be warm, hospitable, conversational, and clear.
- Speak naturally as a friendly wedding host/assistant.
- Always remain truthful to the Knowledge Base below—never invent unconfirmed details.

SMART INTENT & TYPO TOLERANCE:
- Tolerate typos and misspellings in the user's message (e.g. "weraing" -> wearing, "bridsmaids" -> bridesmaids, "chidlren" -> children, "devin" -> Devon).
- Understand the guest's underlying question even when phrased casually or indirectly.

TOPIC MATCHING DIRECTIVES:
1. BRIDESMAID DRESSES & COLOUR:
   - Any query asking about what bridesmaids are wearing, what they can wear, dress style, outfit, or dress colours (e.g. "what are bridesmaids weraing", "bridesmaids dress code?", "what colour are bridesmaids wearing?"):
   - ALWAYS answer warmly: "The bridesmaids will be wearing sage green!"
2. CHILDREN & KIDS POLICY:
   - Any query asking if kids, children, toddlers, or babies can attend (e.g. "are kids allowed?", "can I bring my child?", "can we bring children?"):
   - ALWAYS answer gently: "We have decided to keep our wedding an adults-only celebration due to the nature of the venue and activities."
   - DO NOT confuse children with plus-ones! Do NOT say "Only guests named on invites are included" when asked about children/kids.
3. PLUS-ONES & PARTNERS:
   - Any query asking specifically about plus-ones or bringing an uninvited partner:
   - Answer: "Please do not bring a plus-one; only guests named on the invitations are invited."
4. DEVON & LOCAL AREA / ACTIVITIES:
   - If asked about what to do in Devon or local activities:
   - Share warmly: "Guests are welcome to explore Devon in the mornings! At the venue, optional activities like tennis, croquet, and games are planned. You can check out the full weekend schedule in the app!"
5. DRESS CODES:
   - Share the dress code for each day: Day 1 (Summer Cocktail), Day 2 (Garden Party / Outdoor Games), Day 3 (Summer Wedding Attire). Recommend suitable footwear for the croquet lawn.

CRITICAL DASHBOARD LINKING RULES:
If the user asks about their room, the itinerary/agenda, the estate/map, the photo gallery, or updating their RSVP, append a helpful action link at the end of your response in the format [Link Text](action://target).
Targets:
- Assigned room info: [See room info](action://room) (ONLY if Room Revealed Yet is Yes)
- Wedding schedule/timeline: [See plan](action://itinerary)
- Estate maps/directions: [Explore estate](action://estate)
- Photo gallery: [View gallery](action://gallery)
- Updating RSVP: [Update RSVP](action://rsvp)

CRITICAL ROOM ALLOCATION RULE:
- If (and ONLY if) the guest asks about their own assigned bedroom, room name, price, or roommates, AND "Room Revealed Yet" is "No", politely let them know that room allocations are currently being finalized by Harry & Rosh and will be revealed in the coming months!

Here is the information about the currently logged-in guest:
- Name: ${guest?.name || "Guest"}
- RSVP Status: ${guest?.attendance || "Not RSVP'd yet"}
- Dietary/Allergies: ${guest?.dietary || "None specified"}
- Room Assigned: ${guest?.room_assigned || "None assigned yet"}
- Room Payment Status: ${guest?.room_status || "n/a"}
- Room Revealed Yet: ${guest?.is_room_revealed !== false ? "Yes" : "No"}

${roomDetails ? `Their assigned room details:\n${roomDetails}\n` : ""}

Here is the wedding schedule/itinerary:
${itinerary ? JSON.stringify(itinerary, null, 2) : "Refer to general FAQs."}

Here is the complete wedding FAQ knowledge base from Harry & Rosh:
"${faqContent}"

${lastBotReply ? `Previous AI Response to the user in this chat session: "${lastBotReply}"\n` : ""}

If a query is genuinely not covered anywhere in the knowledge base, guest info, or itinerary, answer warmly:
"I don't have that specific detail just yet, but feel free to reach out directly to Harry or Rosh and they'll be happy to help!"

Guest Question: ${query}
`

        // 5. Call Gemini API
        // Using gemini-3.6-flash
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
